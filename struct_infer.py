"""
정형 변수 위험 성향 추론 워커 — api_server.py가 시작 시 1회 실행합니다.

프로토콜:
  요청 → stdin에 JSON 1줄  {"age": 35, "jobStab": "stable", ...}
  응답 → stdout에 JSON 1줄 {"score": 0.6234}
  모델 로드 완료 시 stdout에 "READY" 출력

입력 필드:
  age, jobStab, horizon, dependents (list),
  laborRatio, salary, salaryMode, tenure, expectedTenure, amount
"""
import sys, json, warnings, os
warnings.filterwarnings("ignore")
os.environ["OMP_NUM_THREADS"] = "1"

import joblib
import numpy as np
from pathlib import Path

MODEL_DIR = Path(__file__).parent / "models"
pkg       = joblib.load(MODEL_DIR / "struct_model.pkl")
model     = pkg["model"]

def to_features(d):
    dep = set(d.get("dependents") or [])

    job_enc = {"stable": 3, "general": 2, "unstable": 1, "none": 0}.get(
        d.get("jobStab", "general"), 2)
    hor_enc = {"over_30": 4, "20_to_30": 3, "10_to_20": 2, "5_to_10": 1, "under_5": 0}.get(
        d.get("horizon", "10_to_20"), 2)

    salary = float(d.get("salary") or 0)
    if d.get("salaryMode") == "month":
        salary *= 12

    amount = float(d.get("amount") or 0)

    return np.array([[
        float(d.get("age") or 40),
        float(job_enc),
        float(hor_enc),
        float("alone" in dep),
        float("children" in dep),
        float("spouse" in dep),
        float("parents" in dep),
        float("grandparents" in dep),
        float(len(dep - {"alone"})),
        float(d.get("laborRatio") if d.get("laborRatio") is not None else 80),
        float(np.log1p(max(salary, 0))),
        float(d.get("tenure") or 0),
        float(d.get("expectedTenure") or 10),
        float(np.log1p(max(amount, 0))),
    ]], dtype=np.float32)

print("READY", flush=True)

while True:
    line = sys.stdin.readline()
    if not line:
        break
    line = line.strip()
    if not line:
        continue
    try:
        req   = json.loads(line)
        feats = to_features(req)
        score = float(np.clip(model.predict(feats)[0], 0.0, 1.0))
        print(json.dumps({"score": round(score, 4)}), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)

os._exit(0)
