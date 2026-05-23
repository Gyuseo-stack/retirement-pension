"""
퍼시스턴트 추론 워커 — api_server.py가 서버 시작 시 1회만 실행합니다.
모델을 한 번 로드한 뒤 요청 루프에서 대기합니다.

프로토콜:
  요청 → stdin에 JSON 1줄  {"text": "..."}
  응답 → stdout에 JSON 1줄 {"score": float, "raw": float}
  모델 로드 완료 시 stdout에 "READY" 출력
"""
import sys, json, re, warnings, os
warnings.filterwarnings("ignore")
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"

import joblib
import numpy as np
from pathlib import Path
from sentence_transformers import SentenceTransformer

MODEL_DIR = Path(__file__).parent / "models"

ridge    = joblib.load(MODEL_DIR / "ridge_model.pkl")
lgbm     = joblib.load(MODEL_DIR / "lgbm_model.pkl")
kw_sc    = joblib.load(MODEL_DIR / "keyword_scaler.pkl")
score_sc = joblib.load(MODEL_DIR / "score_scaler.pkl")
pca      = joblib.load(MODEL_DIR / "pca.pkl")
embed    = SentenceTransformer("jhgan/ko-sroberta-multitask")

# 피처별 앙상블 가중치: openness / conscientiousness / stability_preference 순
W_LGBM  = np.array([0.8, 0.5, 0.2])
W_RIDGE = np.array([0.2, 0.5, 0.8])

with open(MODEL_DIR / "keyword_meta.json", encoding="utf-8") as f:
    meta = json.load(f)

def count_kw(text, kws):
    return sum(len(re.findall(re.escape(k), str(text))) for k in kws)

def infer(text: str):
    emb = embed.encode([text], convert_to_numpy=True)
    kw_row = {c: 0 for c in meta["keyword_feature_cols"]}
    for group, kws in meta["keyword_dict"].items():
        cnt = count_kw(text, kws)
        if f"{group}_count" in kw_row: kw_row[f"{group}_count"] = cnt
        if f"{group}_has"   in kw_row: kw_row[f"{group}_has"]   = int(cnt > 0)
    kw_arr    = np.array([[kw_row[c] for c in meta["keyword_feature_cols"]]])
    kw_scaled = kw_sc.transform(kw_arr)
    X         = np.hstack([emb, kw_scaled])
    pred_ridge = np.clip(ridge.predict(X), 1.0, 5.0)
    pred_lgbm  = np.clip(lgbm.predict(X),  1.0, 5.0)
    pred   = pred_lgbm * W_LGBM + pred_ridge * W_RIDGE
    pred_z = score_sc.transform(pred)
    raw    = -float(pca.transform(pred_z)[0, 0])
    score  = float(1 / (1 + np.exp(-raw)))
    return score, raw

# 모델 로드 완료 신호
print("READY", flush=True)

# 요청 루프 (파이프 통신에 안전한 readline 방식)
while True:
    line = sys.stdin.readline()
    if not line:  # EOF — 부모 프로세스가 종료됨
        break
    line = line.strip()
    if not line:
        continue
    try:
        req   = json.loads(line)
        text  = req.get("text", "")
        score, raw = infer(text)
        print(json.dumps({"score": score, "raw": raw}), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)

os._exit(0)
