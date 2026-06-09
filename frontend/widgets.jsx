// widgets.jsx — shared UI atoms + scoring logic
// Original isometric SVG decorations (geometric stacks, not character art)

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ─────────────────────────────────────────────────────────
// Scoring (mirrors the Python in prototype_ux_flow.md)
// ─────────────────────────────────────────────────────────
// ── 직업 안정성 (노트북 get_job_stability_from_ui) ────────
function calcJobStability(jobStab) {
  return { stable: 1.0, general: 0.5, unstable: 0.0, none: 0.0 }[jobStab] ?? 0.5;
}

// ── 시간 여력 (노트북 calculate_time_horizon_score) ───────
const HORIZON_MAP = { over_30: 10, '20_to_30': 8, '10_to_20': 6, '5_to_10': 3, under_5: 1 };
const HORIZON_YRS = { over_30: 35, '20_to_30': 25, '10_to_20': 15, '5_to_10': 7, under_5: 2 };

function calcTimeHorizon(age, horizon) {
  const a = +age;
  const ageScore = a < 30 ? 10 : a < 40 ? 8 : a < 50 ? 6 : a < 60 ? 4 : a < 65 ? 2 : 1;
  const retScore = HORIZON_MAP[horizon] ?? 6;
  return +((ageScore * 0.4 + retScore * 0.6 - 1) / 9).toFixed(4);
}

// ── 가족 부양 부담 (노트북 calculate_family_score) ────────
function calcFamilyScore(dependents) {
  const sel = new Set(dependents ?? []);
  if (!sel.size) return 0.5;
  if (sel.size === 1 && sel.has('alone')) return 1.0;                                          // 혼자: 부양책임 없음
  if (sel.has('children')) return 0.25;                                                        // 자녀 포함: 부양책임 높음
  if (sel.has('spouse') && (sel.has('parents') || sel.has('grandparents'))) return 0.25;      // 배우자+부모/조부모: 다세대 가구
  if (sel.size === 1 && sel.has('spouse')) return 0.75;                                        // 배우자만: 낮은 부양부담
  if (sel.has('parents') || sel.has('grandparents')) return 0.5;                              // 부모/조부모만: 중립
  if (sel.has('siblings') || sel.has('relatives') || sel.has('others')) return 0.5;           // 형제자매/친인척/기타: 중립
  return 0.5;
}

// ── UI 값 → 노트북 카테고리 변환 헬퍼 ───────────────────────
function mapIncomeDependency(laborRatio) {
  const r = laborRatio ?? 100;
  if (r >= 80) return '매우 높음: 소득의 80% 이상이 근로소득';
  if (r >= 60) return '높음: 소득의 60~80%가 근로소득';
  if (r >= 40) return '보통: 소득의 40~60%가 근로소득';
  return '낮음: 소득의 40% 미만이 근로소득';
}

function mapJobType(jobStab) {
  return {
    stable:   '고정 소득 기반 직업군',
    general:  '일반 직장인',
    unstable: '성과/계약 변동 직업군',
    none:     '무직/구직중',
  }[jobStab] ?? '일반 직장인';
}

function mapExpectedContribution(expectedTenure) {
  const et = expectedTenure ?? 0;
  if (et >= 20) return '높음: 장기 근속 가능성이 높음';
  if (et >= 7)  return '보통: 당분간 근속 가능';
  if (et >= 3)  return '낮음: 이직/퇴직 가능성 있음';
  return '매우 낮음: 근속 불확실성이 큼';
}

function mapIncomeLevel(salary) {
  const s = salary ?? 0;
  if (s >= 8000) return '매우 높음';
  if (s >= 5000) return '높음';
  if (s >= 3000) return '중간';
  return '낮음';
}

// ── 자금 여력 Part 1: Capital/Career Capacity ────────────
// 노트북 calculate_capital_career_capacity_score() 수정본 기준
function calcCapitalScore(investable_capital, years_worked, years_to_retire, income_dependency) {
  // 1. 현재 여유 투자자금 점수 (0~10) — 6단계 세분화 (단위: 만원)
  const ic = investable_capital ?? 0;
  const capitalScore = ic >= 10000 ? 10
                     : ic >= 5000  ? 8
                     : ic >= 3000  ? 6
                     : ic >= 1500  ? 4
                     : ic >= 500   ? 2 : 1;

  // 2. 커리어 잔여 여력 점수 (0~10) — years_to_retire 직접 사용 (버그 수정)
  const careerRemaining = years_to_retire ?? 0;
  const careerScore = careerRemaining >= 30 ? 10
                    : careerRemaining >= 20 ? 8
                    : careerRemaining >= 10 ? 5
                    : careerRemaining >= 5  ? 3 : 1;

  // 3. 근로소득 의존도 점수 (0~10) — 의존도 낮을수록 고점 (Bodie-Merton-Samuelson)
  const depMap = {
    '매우 높음: 소득의 80% 이상이 근로소득': 3,
    '높음: 소득의 60~80%가 근로소득':        5,
    '보통: 소득의 40~60%가 근로소득':        7,
    '낮음: 소득의 40% 미만이 근로소득':      9,
  };
  const depScore = depMap[income_dependency] ?? 5;

  // Part 1 = (자금×0.5 + 커리어×0.3 + 의존도×0.2) / 10
  return (capitalScore * 0.5 + careerScore * 0.3 + depScore * 0.2) / 10;
}

// ── 자금 여력 Part 2: Pension Contribution Stability ─────
// 노트북 calculate_pension_contribution_stability_score() 실제 구현 기준
function calcPensionScore(job_type, expected_contribution, income_level) {
  // 1. 직업 안정성 점수 (0~10)
  const jobMap = {
    '고정 소득 기반 직업군': 9,
    '일반 직장인':           7,
    '성과/계약 변동 직업군': 4,
    '무직/구직중':           1,
  };
  // 2. 예상 근속 가능성 점수 (0~10)
  const contribMap = {
    '높음: 장기 근속 가능성이 높음': 9,
    '보통: 당분간 근속 가능':        7,
    '낮음: 이직/퇴직 가능성 있음':  4,
    '매우 낮음: 근속 불확실성이 큼': 1,
  };
  // 3. 소득 수준 점수 (0~10)
  const incomeMap = { '낮음': 2, '중간': 6, '높음': 8, '매우 높음': 10 };

  // Part 2 = (직업×0.4 + 근속×0.4 + 소득×0.2) / 10
  return ((jobMap[job_type] ?? 5) * 0.4
        + (contribMap[expected_contribution] ?? 5) * 0.4
        + (incomeMap[income_level] ?? 6) * 0.2) / 10;
}

// ── 최종 Risk Score 통합 (노트북 calculate_final_risk_score) ─
// textScore 없음: 자금×0.30 + 시간×0.30 + 직업×0.25 + 가족×0.15
// textScore 있음: 동일 비율을 0.90으로 줄이고 textScore×0.10 추가
function calcRiskScore(form, textScore = null) {
  const isAnnual = form.salaryMode !== 'month';
  const salary   = form.salary ? (isAnnual ? form.salary : form.salary * 12) : 0;

  // UI 값 → 노트북 카테고리 변환
  const incomeDep  = mapIncomeDependency(form.laborRatio);
  const jobTypeStr = mapJobType(form.jobStab);
  const expContrib = mapExpectedContribution(form.expectedTenure);
  const incLevel   = mapIncomeLevel(salary);
  const yrsToRetire = HORIZON_YRS[form.horizon] ?? 15;

  const jobScore    = calcJobStability(form.jobStab);
  const timeScore   = calcTimeHorizon(form.age, form.horizon);
  const familyScore = calcFamilyScore(form.dependents);
  const part1       = calcCapitalScore(form.amount, form.tenure, yrsToRetire, incomeDep);
  const part2       = calcPensionScore(jobTypeStr, expContrib, incLevel);
  const capitalScore = part1 * 0.5 + part2 * 0.5;

  const riskScore = textScore != null
    ? +(capitalScore * 0.27 + timeScore * 0.27 + jobScore * 0.22 + familyScore * 0.14 + textScore * 0.10).toFixed(4)
    : +(capitalScore * 0.30 + timeScore * 0.30 + jobScore * 0.25 + familyScore * 0.15).toFixed(4);

  return { riskScore, jobScore, timeScore, familyScore, capitalScore };
}

// ── Risk Score(0~1) → A값(1~8) → 페르소나 분류 ───────────
function estimateA(riskScore) {
  return +Math.min(Math.max(1 + (1 - riskScore) * 7, 1), 8).toFixed(2);
}

function classifyPersona(A) {
  if (A <= 2.5) return { key: 'early',  name: '사회초년생형', desc: '시간이라는 가장 큰 자산을 가진 공격형 투자자입니다.',  allocRisk: 0.85 };
  if (A <= 3.5) return { key: 'accum',  name: '자산축적형',   desc: '안정적 기반 위에 적극적으로 자산을 키워가는 단계입니다.', allocRisk: 0.75 };
  if (A <= 5.0) return { key: 'family', name: '가족부양형',   desc: '책임이 큰 만큼 수익과 안정성의 균형이 중요합니다.',    allocRisk: 0.63 };
  if (A <= 6.5) return { key: 'retire', name: '은퇴준비형',   desc: '자산 보존을 우선하며 점진적으로 위험을 줄여야 합니다.', allocRisk: 0.45 };
  return              { key: 'senior', name: '고령안정형',   desc: '원금 보전이 최우선, 변동성을 최소화해야 합니다.',      allocRisk: 0.25 };
}

// ── Step 2/3 live preview 헬퍼 (raw form 값 → 매핑 → 점수) ──
function previewCapitalScore(form) {
  const incomeDep   = mapIncomeDependency(form.laborRatio);
  const yrsToRetire = HORIZON_YRS[form.horizon] ?? 15;
  return calcCapitalScore(form.amount ?? 0, form.tenure ?? 0, yrsToRetire, incomeDep);
}

function previewPensionScore(form) {
  const isAnnual = form.salaryMode !== 'month';
  const salary   = form.salary ? (isAnnual ? form.salary : form.salary * 12) : 0;
  return calcPensionScore(
    mapJobType(form.jobStab),
    mapExpectedContribution(form.expectedTenure),
    mapIncomeLevel(salary),
  );
}

window.scoringLib = {
  calcRiskScore, calcTimeHorizon, calcCapitalScore, calcPensionScore,
  previewCapitalScore, previewPensionScore,
  estimateA, classifyPersona, HORIZON_MAP,
};

// ─────────────────────────────────────────────────────────
// Isometric decoration (original, no character art)
// ─────────────────────────────────────────────────────────
function IsoStack({ size = 200, theme = 'welcome' }) {
  // Stacked abstract isometric blocks → "portfolio layers"
  const palettes = {
    welcome: ['#FFFFFF', '#E8F2FF', '#A8D4FF', '#FF6B35'],
    basic:   ['#FFFFFF', '#E8F2FF', '#A8D4FF', '#FFB59E'],
    life:    ['#FFFFFF', '#E1ECFF', '#B7C8FF', '#7B61FF'],
    income:  ['#FFFFFF', '#E8F2FF', '#A8D4FF', '#FFB020'],
  };
  const [a, b, c, accent] = palettes[theme] || palettes.welcome;
  return (
    <svg viewBox="0 0 240 200" width={size} height={size * 200/240} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`g1-${theme}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} stopOpacity="0.95"/>
          <stop offset="1" stopColor={b} stopOpacity="0.85"/>
        </linearGradient>
        <linearGradient id={`g2-${theme}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c} stopOpacity="0.95"/>
          <stop offset="1" stopColor={a} stopOpacity="0.7"/>
        </linearGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="120" cy="178" rx="86" ry="12" fill="rgba(0,30,80,0.18)"/>
      {/* bottom block */}
      <g transform="translate(30,110)">
        <polygon points="0,30 90,75 180,30 90,-15" fill={`url(#g2-${theme})`}/>
        <polygon points="0,30 0,55 90,100 90,75" fill={c} opacity="0.7"/>
        <polygon points="90,75 90,100 180,55 180,30" fill={c} opacity="0.55"/>
      </g>
      {/* middle block */}
      <g transform="translate(54,72)">
        <polygon points="0,24 66,57 132,24 66,-9" fill={`url(#g1-${theme})`}/>
        <polygon points="0,24 0,45 66,78 66,57" fill={b} opacity="0.85"/>
        <polygon points="66,57 66,78 132,45 132,24" fill={b} opacity="0.65"/>
      </g>
      {/* top block (accent / coin) */}
      <g transform="translate(86,38)">
        <polygon points="0,18 34,35 68,18 34,1" fill={accent} opacity="0.95"/>
        <polygon points="0,18 0,33 34,50 34,35" fill={accent} opacity="0.65"/>
        <polygon points="34,35 34,50 68,33 68,18" fill={accent} opacity="0.45"/>
      </g>
      {/* floating coins */}
      <g>
        <circle cx="34" cy="48" r="9" fill="#FFD66B" stroke="#FFA928" strokeWidth="1.5"/>
        <text x="34" y="52" textAnchor="middle" fontSize="11" fontWeight="800" fill="#9A5C00">₩</text>
      </g>
      <g>
        <circle cx="210" cy="62" r="7" fill="#FFD66B" stroke="#FFA928" strokeWidth="1.4"/>
      </g>
      <g>
        <circle cx="200" cy="22" r="5" fill="#fff" opacity="0.8"/>
      </g>
      {/* arrow up */}
      <g transform="translate(186,90)">
        <path d="M0,20 L0,8 L-5,8 L4,-2 L13,8 L8,8 L8,20 Z" fill={accent} opacity="0.95"/>
      </g>
    </svg>
  );
}

// Donut chart (used on result screen)
function Donut({ slices, size = 180, stroke = 26, riskyShare = 1 }) {
  // slices: [{name, weight, color}] — weights normalized
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F4F6FA" strokeWidth={stroke}/>
      {slices.map((s, i) => {
        const frac = s.weight / total;
        const dash = c * frac;
        const offset = c * (1 - acc);
        acc += frac;
        return (
          <circle
            key={s.name}
            cx={size/2}
            cy={size/2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: 'stroke-dasharray 800ms ease-out' }}
          />
        );
      })}
      <text x={size/2} y={size/2 - 4} textAnchor="middle" fontSize="11" fill="#6B7A99" fontWeight="500">공격 투자 비중</text>
      <text x={size/2} y={size/2 + 20} textAnchor="middle" fontSize="28" fontWeight="800" fill="#1A1F36" letterSpacing="-0.02em">{Math.round(riskyShare * 100)}%</text>
    </svg>
  );
}

// Half-arc gauge for A value
function ArcGauge({ value, min = 1, max = 8, size = 200, label = "위험회피계수 A" }) {
  // semicircle from 0° (left) to 180° (right)
  const cx = size / 2;
  const cy = size * 0.75;
  const r = size * 0.42;
  const startAngle = Math.PI;
  const endAngle = 0;
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = startAngle - frac * Math.PI;

  const polar = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [sx, sy] = polar(startAngle);
  const [ex, ey] = polar(endAngle);
  const [vx, vy] = polar(angle);

  const colors = [
    { stop: 0.0, c: '#00C48C' },
    { stop: 0.3, c: '#4B9EFF' },
    { stop: 0.6, c: '#7B61FF' },
    { stop: 1.0, c: '#8896B3' },
  ];

  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
      <defs>
        <linearGradient id="arcGrad" x1="0" y1="0" x2="1" y2="0">
          {colors.map((s) => <stop key={s.stop} offset={s.stop} stopColor={s.c} />)}
        </linearGradient>
      </defs>
      {/* background arc */}
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} stroke="#EEF1F8" strokeWidth="14" fill="none" strokeLinecap="round"/>
      {/* colored arc */}
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} stroke="url(#arcGrad)" strokeWidth="14" fill="none" strokeLinecap="round" opacity="0.92"/>
      {/* ticks */}
      {[2.5, 3, 4, 6].map((tv) => {
        const ta = startAngle - ((tv - min) / (max - min)) * Math.PI;
        const [x1, y1] = [cx + (r - 10) * Math.cos(ta), cy + (r - 10) * Math.sin(ta)];
        const [x2, y2] = [cx + (r + 10) * Math.cos(ta), cy + (r + 10) * Math.sin(ta)];
        return <line key={tv} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="2"/>;
      })}
      {/* pointer */}
      <line x1={cx} y1={cy} x2={vx} y2={vy} stroke="#1A1F36" strokeWidth="3" strokeLinecap="round" style={{ transition: 'all 800ms ease-out' }}/>
      <circle cx={cx} cy={cy} r="9" fill="#1A1F36"/>
      <circle cx={cx} cy={cy} r="4" fill="#fff"/>
      {/* labels */}
      <text x={sx} y={sy + 18} textAnchor="middle" fontSize="10" fill="#B0BAD4" fontWeight="600">공격형</text>
      <text x={ex} y={ey + 18} textAnchor="middle" fontSize="10" fill="#B0BAD4" fontWeight="600">안정형</text>
    </svg>
  );
}

// Animated number that counts from 0 → target
function useCountUp(target, duration = 900, deps = []) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

// Tooltip helper
function HelpTip({ children }) {
  return (
    <span className="tip-trigger">?
      <span className="tip">{children}</span>
    </span>
  );
}

// Slider widget
function RangeSlider({ value, onChange, min = 0, max = 100, step = 1, leftLbl, rightLbl, fmt = (v) => v + '%' }) {
  const trackRef = useRef(null);
  const pct = ((value - min) / (max - min)) * 100;
  const onPointerDown = (e) => {
    const track = trackRef.current;
    if (!track) return;
    const move = (ev) => {
      const rect = track.getBoundingClientRect();
      const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX);
      const x = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      const raw = min + x * (max - min);
      const snapped = Math.round(raw / step) * step;
      onChange(Math.max(min, Math.min(max, snapped)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    move(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
  };
  return (
    <div className="slider-card">
      <div className="slider-top">
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>현재 값</div>
        <div className="slider-value">{fmt(value)}</div>
      </div>
      <div ref={trackRef} className="slider-track" onPointerDown={onPointerDown} onTouchStart={onPointerDown}>
        <div className="slider-fill" style={{ width: `${pct}%` }}/>
        <div className="slider-thumb" style={{ left: `${pct}%` }}/>
      </div>
      <div className="slider-labels">
        <span>{leftLbl}</span>
        <span>{rightLbl}</span>
      </div>
    </div>
  );
}

// Persona pill
function PersonaPill({ persona }) {
  return (
    <span className={`persona-pill ${persona.key}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 100, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      ...(persona.key === 'early'   && { background: 'var(--green-bg)',  color: 'var(--green-text)' }),
      ...(persona.key === 'accum'   && { background: '#DFF4FF',          color: '#0099E6' }),
      ...(persona.key === 'family'  && { background: 'var(--brand-bg)',  color: 'var(--brand-deep)' }),
      ...(persona.key === 'retire'  && { background: 'var(--purple-bg)', color: 'var(--purple)' }),
      ...(persona.key === 'senior'  && { background: '#F0F1F5',          color: '#8896B3' }),
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor' }}/>
      {persona.name}
    </span>
  );
}

Object.assign(window, {
  IsoStack, Donut, ArcGauge, useCountUp, HelpTip, RangeSlider, PersonaPill,
});
