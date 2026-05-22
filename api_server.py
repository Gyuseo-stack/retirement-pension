"""
로컬 프록시 서버 — JSX 앱에서 OpenAI API를 직접 호출할 수 없어
브라우저(localhost:3000) → 이 서버(localhost:8000) → OpenAI API 순으로 중계

/api/analyze_persona: 라이프스타일 텍스트 → 위험 성향 점수(0~1)
  persona_infer.py를 서버 시작 시 1회 실행해 모델을 메모리에 유지합니다.
  이후 요청은 프로세스 stdin/stdout으로 텍스트만 주고받아 2~5초 내 응답합니다.
"""
import asyncio, json, os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("OMP_NUM_THREADS", "1")

load_dotenv()

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


# ── Request models ──────────────────────────────────────────────
class ChatRequest(BaseModel):
    messages: list[dict]


class PersonaRequest(BaseModel):
    text: str


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
app.mount("/", StaticFiles(directory=Path(__file__).parent, html=True), name="static")
