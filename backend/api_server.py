"""
로컬 프록시 서버 — JSX 앱에서 OpenAI API를 직접 호출할 수 없어
브라우저(localhost:3000) → 이 서버(localhost:8000) → OpenAI API 순으로 중계

/api/analyze_persona: 라이프스타일 텍스트 → 위험 성향 점수(0~1)
  persona_infer.py를 서버 시작 시 1회 실행해 모델을 메모리에 유지합니다.
  이후 요청은 프로세스 stdin/stdout으로 텍스트만 주고받아 2~5초 내 응답합니다.
"""
import asyncio, json, os
from pathlib import Path

import numpy as np
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("OMP_NUM_THREADS", "1")

load_dotenv()

# ── 역사적 CVaR 계산용 데이터 (서버 시작 시 1회 로드) ────────────
_risky_port_r: "pd.Series | None" = None   # 리스크 포트폴리오 월 수익률
_rf_r:         "pd.Series | None" = None   # 무위험 자산 월 수익률

DATA_DIR      = Path(__file__).parent.parent.parent / "최종_데이터셋"
CVAR_JSON     = Path(__file__).parent / "cvar_returns.json"

def _load_return_data() -> None:
    """사전 계산 JSON 우선 로드, 없으면 parquet에서 직접 계산."""
    global _risky_port_r, _rf_r
    try:
        # ① 사전 계산 JSON (Railway 배포 환경)
        if CVAR_JSON.exists():
            with open(CVAR_JSON, encoding="utf-8") as f:
                d = json.load(f)
            idx = pd.to_datetime(d["dates"])
            _risky_port_r = pd.Series(d["risky_port_r"], index=idx, dtype=float)
            _rf_r         = pd.Series(d["rf_r"],         index=idx, dtype=float)
            print(f"[cvar] Loaded from JSON — {len(_risky_port_r)} months", flush=True)
            return

        # ② parquet 원본 (로컬 환경)
        slots_path   = DATA_DIR / "입력_데이터" / "slot_returns.parquet"
        weights_path = DATA_DIR / "step5_지역제약포트폴리오_최종" / "portfolio_weights_constrained.parquet"
        if not slots_path.exists() or not weights_path.exists():
            print("[cvar] Data files not found — CVaR endpoint unavailable", flush=True)
            return

        df_r = pd.read_parquet(slots_path)
        df_w = pd.read_parquet(weights_path)
        df_r_monthly = df_r.resample("ME").apply(lambda x: (1 + x).prod() - 1)
        df_w_monthly = (df_w.resample("ME").ffill()
                            .reindex(df_r_monthly.index, method="ffill"))

        rf_col  = "무위험(현금성)"
        risky_r = df_r_monthly.drop(columns=[rf_col])
        risky_w = df_w_monthly.drop(columns=[rf_col])
        _rf_r   = df_r_monthly[rf_col]

        vals = []
        for dt in risky_r.index:
            r_row = risky_r.loc[dt]
            w_row = risky_w.loc[dt]
            avail = r_row.notna()
            if not avail.any():
                vals.append(float(_rf_r.loc[dt]))
                continue
            w_a, r_a = w_row[avail], r_row[avail]
            w_sum = float(w_a.sum())
            vals.append(float((w_a / w_sum * r_a).sum()) if w_sum > 0 else float(_rf_r.loc[dt]))

        _risky_port_r = pd.Series(vals, index=risky_r.index)
        print(f"[cvar] Return data loaded from parquet — {len(_risky_port_r)} months", flush=True)
    except Exception as e:
        print(f"[cvar] Data load failed: {e}", flush=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_openai_client: OpenAI | None = None

def get_client() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(503, "OPENAI_API_KEY 환경변수가 설정되지 않았습니다.")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client

INFER_SCRIPT   = Path(__file__).parent / "persona_infer.py"
STRUCT_SCRIPT  = Path(__file__).parent / "struct_infer.py"

# ── 퍼시스턴트 추론 워커 (텍스트 페르소나) ──────────────────────
_worker: asyncio.subprocess.Process | None = None
_worker_lock: asyncio.Lock | None = None

# ── 퍼시스턴트 추론 워커 (정형 변수) ───────────────────────────
_struct_worker: asyncio.subprocess.Process | None = None
_struct_worker_lock: asyncio.Lock | None = None


async def _start_worker() -> None:
    """persona_infer.py를 실행하고 READY 신호를 기다립니다."""
    global _worker
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3", str(INFER_SCRIPT),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        ready = await asyncio.wait_for(proc.stdout.readline(), timeout=180)
        if ready.strip() == b"READY":
            _worker = proc
    except Exception as e:
        print(f"[worker] 시작 실패: {e}", flush=True)
        _worker = None


async def _start_struct_worker() -> None:
    """struct_infer.py를 실행하고 READY 신호를 기다립니다."""
    global _struct_worker
    try:
        proc = await asyncio.create_subprocess_exec(
            "python3", str(STRUCT_SCRIPT),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        ready = await asyncio.wait_for(proc.stdout.readline(), timeout=30)
        if ready.strip() == b"READY":
            _struct_worker = proc
    except Exception as e:
        print(f"[struct_worker] 시작 실패: {e}", flush=True)
        _struct_worker = None


@app.on_event("startup")
async def startup() -> None:
    global _worker_lock, _struct_worker_lock
    _worker_lock        = asyncio.Lock()
    _struct_worker_lock = asyncio.Lock()
    asyncio.create_task(_start_worker())
    asyncio.create_task(_start_struct_worker())
    # 리턴 데이터 로드 (blocking but fast — ~0.2s)
    await run_in_threadpool(_load_return_data)


# ── Request models ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    messages: list[dict]


class PersonaRequest(BaseModel):
    text: str


class CvarRequest(BaseModel):
    y_star: float


class StructRequest(BaseModel):
    age: int = 40
    jobStab: str = "general"
    horizon: str = "10_to_20"
    dependents: list[str] = []
    laborRatio: float = 80
    salary: float = 0
    salaryMode: str = "annual"
    tenure: int = 0
    expectedTenure: int = 10
    amount: float = 0


# ── /api/chat ───────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(req: ChatRequest):
    client = get_client()  # API 키 확인을 스트리밍 시작 전에 수행

    def generate():
        stream = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=req.messages,
            max_tokens=1000,
            temperature=0.3,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            if delta:
                yield f"data: {json.dumps({'delta': delta}, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── /api/analyze_persona ────────────────────────────────────────
@app.post("/api/analyze_persona")
async def analyze_persona(req: PersonaRequest):
    global _worker

    if not INFER_SCRIPT.exists():
        raise HTTPException(503, "추론 스크립트가 없습니다.")

    async with _worker_lock:
        # 워커가 없거나 종료됐으면 재시작
        if _worker is None or _worker.returncode is not None:
            await _start_worker()
        if _worker is None:
            raise HTTPException(503, "추론 워커가 아직 준비 중이에요. 잠시 후 다시 시도해주세요.")

        payload = json.dumps({"text": req.text}, ensure_ascii=False) + "\n"
        _worker.stdin.write(payload.encode("utf-8"))
        await _worker.stdin.drain()

        try:
            line = await asyncio.wait_for(_worker.stdout.readline(), timeout=30)
        except asyncio.TimeoutError:
            _worker = None  # 다음 요청 시 재시작
            raise HTTPException(504, "추론 시간 초과 (30초)")

    result = json.loads(line.decode().strip())
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


# ── /api/calc_cvar ──────────────────────────────────────────────
@app.post("/api/calc_cvar")
async def calc_cvar(req: CvarRequest):
    if _risky_port_r is None or _rf_r is None:
        raise HTTPException(503, "수익률 데이터가 아직 로드 중입니다. 잠시 후 다시 시도해주세요.")

    y = float(np.clip(req.y_star, 0.0, 1.0))

    def _compute():
        port = y * _risky_port_r + (1 - y) * _rf_r
        q05  = float(port.quantile(0.05))
        q01  = float(port.quantile(0.01))
        cvar95 = round(float(port[port <= q05].mean()) * 100, 2)
        cvar99 = round(float(port[port <= q01].mean()) * 100, 2)
        # Sortino: monthly mean / monthly downside-std (음수 수익월 기준)
        downside = float(port[port < 0].std())
        sortino  = round(float(port.mean()) / downside, 3) if downside > 0 else 0.0
        n_months = int(len(port))
        return {"cvar95": cvar95, "cvar99": cvar99, "sortino": sortino, "n_months": n_months}

    return await run_in_threadpool(_compute)


# ── /api/score_structured ───────────────────────────────────────
@app.post("/api/score_structured")
async def score_structured(req: StructRequest):
    global _struct_worker

    if not STRUCT_SCRIPT.exists():
        raise HTTPException(503, "정형 추론 스크립트가 없습니다.")

    async with _struct_worker_lock:
        if _struct_worker is None or _struct_worker.returncode is not None:
            await _start_struct_worker()
        if _struct_worker is None:
            raise HTTPException(503, "정형 추론 워커가 아직 준비 중이에요. 잠시 후 다시 시도해주세요.")

        payload = json.dumps(req.model_dump(), ensure_ascii=False) + "\n"
        _struct_worker.stdin.write(payload.encode("utf-8"))
        await _struct_worker.stdin.drain()

        try:
            line = await asyncio.wait_for(_struct_worker.stdout.readline(), timeout=10)
        except asyncio.TimeoutError:
            _struct_worker = None
            raise HTTPException(504, "추론 시간 초과 (10초)")

    result = json.loads(line.decode().strip())
    if "error" in result:
        raise HTTPException(500, result["error"])
    return result


# ── /health ─────────────────────────────────────────────────────
@app.get("/health")
def health():
    worker_ready        = _worker is not None and _worker.returncode is None
    struct_worker_ready = _struct_worker is not None and _struct_worker.returncode is None
    return {"status": "ok", "worker_ready": worker_ready, "struct_worker_ready": struct_worker_ready}


# API 라우트 등록 후 맨 마지막에 정적 파일 서빙
app.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True), name="static")
