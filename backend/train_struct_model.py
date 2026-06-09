"""
정형 변수 위험 성향 모델 학습 스크립트

실행: python3 train_struct_model.py

방법:
  1. JS 공식(calcRiskScore)을 Python으로 포팅
  2. 입력 변수 조합 80,000개 샘플 생성
  3. GradientBoostingRegressor 학습
  4. models/struct_model.pkl 저장

핵심 개선: 기존 JS 공식의 계단 함수(나이 10세 단위 버킷 등)를
  연속 값으로 부드럽게 보간하여 개인화 품질 향상.
"""
import numpy as np
import joblib
from pathlib import Path
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

# ─────────────────────────────────────────────────────────────
# JS 공식 Python 포팅 (widgets.jsx 기준)
# ─────────────────────────────────────────────────────────────
HORIZON_MAP = {'over_30': 10, '20_to_30': 8, '10_to_20': 6, '5_to_10': 3, 'under_5': 1}
HORIZON_YRS = {'over_30': 35, '20_to_30': 25, '10_to_20': 15, '5_to_10': 7, 'under_5': 2}

def _job_stability(job_stab):
    return {'stable': 1.0, 'general': 0.5, 'unstable': 0.0, 'none': 0.0}.get(job_stab, 0.5)

def _time_horizon(age, horizon):
    a = int(age)
    age_score = 10 if a < 30 else 8 if a < 40 else 6 if a < 50 else 4 if a < 60 else 2 if a < 65 else 1
    ret_score = HORIZON_MAP.get(horizon, 6)
    return round((age_score * 0.4 + ret_score * 0.6 - 1) / 9, 4)

def _family_score(dependents):
    sel = set(dependents or [])
    if not sel: return 0.5
    if len(sel) == 1 and 'alone' in sel: return 1.0
    if 'children' in sel: return 0.25
    if 'spouse' in sel and ('parents' in sel or 'grandparents' in sel): return 0.25
    if len(sel) == 1 and 'spouse' in sel: return 0.75
    if 'parents' in sel or 'grandparents' in sel: return 0.5
    return 0.5

def _income_dep_str(labor_ratio):
    r = labor_ratio or 100
    if r >= 80: return '매우 높음: 소득의 80% 이상이 근로소득'
    if r >= 60: return '높음: 소득의 60~80%가 근로소득'
    if r >= 40: return '보통: 소득의 40~60%가 근로소득'
    return '낮음: 소득의 40% 미만이 근로소득'

def _job_type_str(job_stab):
    return {'stable': '고정 소득 기반 직업군', 'general': '일반 직장인',
            'unstable': '성과/계약 변동 직업군', 'none': '무직/구직중'}.get(job_stab, '일반 직장인')

def _exp_contrib_str(expected_tenure):
    et = expected_tenure or 0
    if et >= 20: return '높음: 장기 근속 가능성이 높음'
    if et >= 7:  return '보통: 당분간 근속 가능'
    if et >= 3:  return '낮음: 이직/퇴직 가능성 있음'
    return '매우 낮음: 근속 불확실성이 큼'

def _income_level_str(salary_annual):
    s = salary_annual
    if s >= 10000: return '매우 높음'
    if s >= 6000:  return '높음'
    if s >= 3000:  return '중간'
    return '낮음'

def _capital_score(amount, tenure, yrs_to_retire, income_dep):
    ic = amount or 0
    capital_score = 10 if ic >= 1000 else 7 if ic >= 500 else 4 if ic >= 100 else 1
    career_remaining = (yrs_to_retire or 0) - (tenure or 0)
    career_score = (10 if career_remaining >= 30 else 8 if career_remaining >= 20
                    else 5 if career_remaining >= 10 else 3 if career_remaining >= 5 else 1)
    dep_map = {
        '매우 높음: 소득의 80% 이상이 근로소득': 1,
        '높음: 소득의 60~80%가 근로소득':        3,
        '보통: 소득의 40~60%가 근로소득':        6,
        '낮음: 소득의 40% 미만이 근로소득':      9,
    }
    dep_score = dep_map.get(income_dep, 5)
    return (capital_score * 0.5 + career_score * 0.3 + dep_score * 0.2) / 10

def _pension_score(job_type, exp_contrib, income_level):
    job_map = {'고정 소득 기반 직업군': 9, '일반 직장인': 7,
               '성과/계약 변동 직업군': 4, '무직/구직중': 1}
    contrib_map = {'높음: 장기 근속 가능성이 높음': 9, '보통: 당분간 근속 가능': 7,
                   '낮음: 이직/퇴직 가능성 있음': 4, '매우 낮음: 근속 불확실성이 큼': 1}
    income_map = {'낮음': 2, '중간': 6, '높음': 8, '매우 높음': 10}
    return ((job_map.get(job_type, 5) * 0.4 + contrib_map.get(exp_contrib, 5) * 0.4
             + income_map.get(income_level, 6) * 0.2) / 10)

def formula_risk_score(age, job_stab, horizon, dependents, labor_ratio,
                       salary_annual, tenure, expected_tenure, amount):
    income_dep  = _income_dep_str(labor_ratio)
    job_type    = _job_type_str(job_stab)
    exp_contrib = _exp_contrib_str(expected_tenure)
    inc_level   = _income_level_str(salary_annual)
    yrs_retire  = HORIZON_YRS.get(horizon, 15)

    job_score    = _job_stability(job_stab)
    time_score   = _time_horizon(age, horizon)
    family_score = _family_score(dependents)
    part1        = _capital_score(amount, tenure, yrs_retire, income_dep)
    part2        = _pension_score(job_type, exp_contrib, inc_level)
    capital_score = part1 * 0.5 + part2 * 0.5

    return round(capital_score * 0.30 + time_score * 0.30
                 + job_score * 0.25 + family_score * 0.15, 4)


# ─────────────────────────────────────────────────────────────
# 피처 벡터화 (raw 입력 → 14차원)
# ─────────────────────────────────────────────────────────────
def to_features(age, job_stab, horizon, dependents, labor_ratio,
                salary_annual, tenure, expected_tenure, amount):
    dep = set(dependents or [])
    job_enc = {'stable': 3, 'general': 2, 'unstable': 1, 'none': 0}.get(job_stab, 2)
    hor_enc = {'over_30': 4, '20_to_30': 3, '10_to_20': 2, '5_to_10': 1, 'under_5': 0}.get(horizon, 2)
    return [
        float(age),
        float(job_enc),
        float(hor_enc),
        float('alone' in dep),
        float('children' in dep),
        float('spouse' in dep),
        float('parents' in dep),
        float('grandparents' in dep),
        float(len(dep - {'alone'})),          # 비(非)alone 부양가족 수
        float(labor_ratio),
        float(np.log1p(max(salary_annual, 0))),
        float(tenure),
        float(expected_tenure),
        float(np.log1p(max(amount, 0))),
    ]

FEATURE_NAMES = [
    'age', 'job_enc', 'horizon_enc',
    'alone', 'children', 'spouse', 'parents', 'grandparents', 'n_dependents',
    'labor_ratio', 'log_salary', 'tenure', 'expected_tenure', 'log_amount',
]


# ─────────────────────────────────────────────────────────────
# 합성 데이터 생성
# ─────────────────────────────────────────────────────────────
np.random.seed(42)
N = 80_000

JOB_STABS = ['stable', 'general', 'unstable', 'none']
HORIZONS  = ['over_30', '20_to_30', '10_to_20', '5_to_10', 'under_5']
DEP_COMBOS = [
    [],
    ['alone'],
    ['spouse'],
    ['children'],
    ['spouse', 'children'],
    ['parents'],
    ['spouse', 'parents'],
    ['grandparents'],
    ['parents', 'grandparents'],
    ['spouse', 'children', 'parents'],
    ['children', 'parents'],
    ['spouse', 'grandparents'],
]

# 연속 샘플링 — 계단 함수 경계를 조밀하게 커버
ages           = np.random.uniform(22, 70, N)
job_stabs      = np.random.choice(JOB_STABS, N)
horizons       = np.random.choice(HORIZONS, N)
dep_idxs       = np.random.randint(0, len(DEP_COMBOS), N)
labor_ratios   = np.random.uniform(0, 100, N)
log_sal        = np.random.uniform(np.log(1200), np.log(30000), N)
salaries       = np.exp(log_sal)
tenures        = np.random.uniform(0, 40, N)
exp_tenures    = np.random.uniform(0, 40, N)
log_amt        = np.random.uniform(np.log(1), np.log(10001), N)
amounts        = np.exp(log_amt)

print(f"Generating {N} samples…")
X, y = [], []
for i in range(N):
    dep   = DEP_COMBOS[dep_idxs[i]]
    feats = to_features(ages[i], job_stabs[i], horizons[i], dep,
                        labor_ratios[i], salaries[i], tenures[i], exp_tenures[i], amounts[i])
    score = formula_risk_score(ages[i], job_stabs[i], horizons[i], dep,
                               labor_ratios[i], salaries[i], tenures[i], exp_tenures[i], amounts[i])
    X.append(feats)
    y.append(score)

X = np.array(X, dtype=np.float32)
y = np.array(y, dtype=np.float32)
print(f"y range: [{y.min():.4f}, {y.max():.4f}]  mean: {y.mean():.4f}")


# ─────────────────────────────────────────────────────────────
# 모델 학습
# ─────────────────────────────────────────────────────────────
print("Training GradientBoostingRegressor…")
model = GradientBoostingRegressor(
    n_estimators=200,
    max_depth=5,
    learning_rate=0.08,
    subsample=0.8,
    min_samples_leaf=10,
    random_state=42,
    verbose=0,
)
model.fit(X, y)

train_r2 = model.score(X, y)
print(f"Train R²: {train_r2:.4f}")

# 5-fold CV
cv_r2 = cross_val_score(model, X, y, cv=5, scoring='r2', n_jobs=-1)
print(f"5-fold CV R²: {cv_r2.mean():.4f} ± {cv_r2.std():.4f}")

mae = np.mean(np.abs(model.predict(X) - y))
print(f"Train MAE:   {mae:.5f}")


# ─────────────────────────────────────────────────────────────
# 피처 중요도
# ─────────────────────────────────────────────────────────────
imp = sorted(zip(FEATURE_NAMES, model.feature_importances_), key=lambda x: -x[1])
print("\nFeature importances:")
for name, fi in imp:
    bar = '█' * int(fi * 200)
    print(f"  {name:20s} {fi:.4f}  {bar}")


# ─────────────────────────────────────────────────────────────
# 저장
# ─────────────────────────────────────────────────────────────
MODEL_DIR = Path(__file__).parent / "models"
out_path  = MODEL_DIR / "struct_model.pkl"
joblib.dump({'model': model, 'feature_names': FEATURE_NAMES}, out_path)
print(f"\nSaved → {out_path}  ({out_path.stat().st_size / 1024:.1f} KB)")
