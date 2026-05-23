// screens-result.jsx — Result screen with persona, scores, gauge, donut, CVaR

const { useState: useStateR, useMemo: useMemoR, useEffect: useEffectR } = React;

// ── 종목명 표시용 변환 ─────────────────────────────────────
const SLOT_NAME_MAP = {
  '국내주식_코스피':       '국내주식 (코스피)',
  '국내주식_코스닥':       '국내주식 (코스닥)',
  '미국주식_SP500':        '미국주식 (S&P 500)',
  '미국주식_나스닥':       '미국주식 (나스닥)',
  '신흥국_인도':           '신흥국 주식 (인도)',
  '신흥국_중국':           '신흥국 주식 (중국)',
  '국내채권_국고채단중기': '국내채권 (단기 국채)',
  '국내채권_국고채장기':   '국내채권 (장기 국채)',
  '국내채권_회사채':       '국내채권 (회사채)',
  '국내채권_종합':         '국내채권 (종합)',
  '해외채권_미국국채':     '해외채권 (미국 국채)',
  '원자재_금':             '원자재 (금)',
  '무위험(현금성)':        '안전 자산',
};
function formatSlotName(name) {
  return SLOT_NAME_MAP[name] ?? name.replace(/_/g, ' ');
}

// ── 자산군 그루핑 ─────────────────────────────────────────
const STOCK_SLOTS = ['미국주식_SP500','미국주식_나스닥','국내주식_코스피','국내주식_코스닥','신흥국_인도','신흥국_중국'];
const BOND_SLOTS  = ['국내채권_국고채단중기','국내채권_국고채장기','국내채권_회사채','국내채권_종합','해외채권_미국국채'];
function getSlotGroup(name) {
  if (STOCK_SLOTS.includes(name)) return 'stock';
  if (BOND_SLOTS.includes(name))  return 'bond';
  return 'other';
}

// ── 자산군별 그루핑 색상 (파랑·초록·회색 계열) ──────────────
const SLOT_GROUP_COLORS = {
  '미국주식_SP500':        '#1A6FE8',
  '미국주식_나스닥':       '#4B9EFF',
  '국내주식_코스피':       '#2B5CAA',
  '국내주식_코스닥':       '#6AABFF',
  '신흥국_인도':           '#3D7ECC',
  '신흥국_중국':           '#8FC3FF',
  '국내채권_국고채단중기': '#00C48C',
  '국내채권_국고채장기':   '#06D6A0',
  '국내채권_회사채':       '#34D399',
  '국내채권_종합':         '#5EE8B0',
  '해외채권_미국국채':     '#85EFC4',
  '원자재_금':             '#D4A853',
  '무위험(현금성)':        '#B0BAD4',
};

// ── 점수 뱃지 ─────────────────────────────────────────────
function scoreBadge(score) {
  if (score >= 0.8) return { label: '매우 높음', bg: '#E8F9F2', color: '#00875A' };
  if (score >= 0.6) return { label: '높음',     bg: '#EBF3FF', color: '#1A6FE8' };
  if (score >= 0.4) return { label: '보통',     bg: '#F5F6FA', color: '#6B7A99' };
  if (score >= 0.2) return { label: '낮음',     bg: '#FFF4ED', color: '#CC5200' };
  return                    { label: '매우 낮음',bg: '#FFF0F0', color: '#CC0000' };
}

// Mock slots — used as fallback before portfolio_data.json loads
const MOCK_SLOTS = [
  { name: '국내주식 ETF',   weight: 0.22, color: '#4B9EFF', kind: 'risky' },
  { name: '해외주식 ETF',   weight: 0.28, color: '#1A6FE8', kind: 'risky' },
  { name: '신흥국주식 ETF', weight: 0.08, color: '#7B61FF', kind: 'risky' },
  { name: '국내채권 ETF',   weight: 0.18, color: '#00C48C', kind: 'risky' },
  { name: '해외채권 ETF',   weight: 0.10, color: '#34D399', kind: 'risky' },
  { name: '리츠·대체',      weight: 0.08, color: '#FFB020', kind: 'risky' },
  { name: '원자재 ETF',     weight: 0.06, color: '#FF6B35', kind: 'risky' },
];

function buildPortfolio(yStar, portfolioData) {
  const y = yStar;
  if (!portfolioData) {
    const slices = MOCK_SLOTS.map((s) => ({ ...s, weight: s.weight * y }));
    slices.push({ name: '현금성·MMF', weight: 1 - y, color: '#B0BAD4', kind: 'rf' });
    return slices.filter((s) => s.weight > 0.001);
  }
  // Real data: normalize risky slots, scale by y*, rf gets 1-y*
  const risky = portfolioData.slots.filter((s) => s.kind !== 'rf');
  const rf    = portfolioData.slots.find((s) => s.kind === 'rf');
  const riskyTotal = risky.reduce((sum, s) => sum + s.weight, 0) || 1;
  const result = risky.map((s) => ({ ...s, weight: (s.weight / riskyTotal) * y }));
  result.push({ name: rf?.name ?? '현금성·MMF', weight: 1 - y, color: rf?.color ?? '#B0BAD4', kind: 'rf' });
  return result.filter((s) => s.weight > 0.001);
}

// CVaR·Sortino 선형 보간 — personas 5개 포인트 기준
function interpolateRiskMetrics(yStar, personas) {
  if (!personas) return { cvar95: -(yStar * 9.5), cvar99: -(yStar * 10.7), sortino: 0.188 + yStar * 0.011 };
  const pts = Object.values(personas)
    .map(p => ({ y: p.y_star, c95: p.cvar95, c99: p.cvar99, s: p.sortino }))
    .filter((p, i, arr) => arr.findIndex(q => q.y === p.y) === i) // dedupe
    .sort((a, b) => a.y - b.y);
  if (yStar <= pts[0].y) return { cvar95: pts[0].c95, cvar99: pts[0].c99, sortino: pts[0].s };
  if (yStar >= pts[pts.length - 1].y) return { cvar95: pts[pts.length - 1].c95, cvar99: pts[pts.length - 1].c99, sortino: pts[pts.length - 1].s };
  let lo = pts[0], hi = pts[1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (pts[i].y <= yStar && yStar <= pts[i + 1].y) { lo = pts[i]; hi = pts[i + 1]; break; }
  }
  const t = (yStar - lo.y) / (hi.y - lo.y);
  return {
    cvar95:  +(lo.c95 + t * (hi.c95 - lo.c95)).toFixed(2),
    cvar99:  +(lo.c99 + t * (hi.c99 - lo.c99)).toFixed(2),
    sortino: +(lo.s   + t * (hi.s   - lo.s  )).toFixed(3),
  };
}

function ResultScreen({ form, onRestart, onBack, portfolioData }) {
  // 컴포넌트별 점수 — SHAP 시각화용 (JS 공식 그대로)
  const { riskScore: formulaScore, jobScore, timeScore, familyScore, capitalScore } =
    scoringLib.calcRiskScore(form, null);

  // 최종 riskScore: ML 모델 점수(structScore) 우선 사용, 폴백 시 JS 공식
  // textScore 있으면 10% 가중 혼합 (JS 공식과 동일 비율)
  const baseScore = form.structScore ?? formulaScore;
  const riskScore = form.textScore != null
    ? +(baseScore * 0.90 + form.textScore * 0.10).toFixed(4)
    : baseScore;

  const A = scoringLib.estimateA(riskScore);
  const persona = scoringLib.classifyPersona(A);

  // y* — 개인 A값을 CAL 공식에 직접 대입 (연속값)
  // y* = cal_ratio / A, 법적 상한 70% 적용
  const calRatio = portfolioData?.cal_ratio ?? 1.9236;
  const yStar = +Math.min(calRatio / A, 0.70).toFixed(4);

  // CVaR·Sortino — 초기값은 5포인트 보간, API 응답 후 실제 역사적 시뮬레이션 값으로 교체
  const fallback = interpolateRiskMetrics(yStar, portfolioData?.personas);
  const [riskMetrics, setRiskMetrics] = useStateR({ ...fallback, exact: false });

  useEffectR(() => {
    setRiskMetrics({ ...fallback, exact: false }); // y* 변경 시 즉시 보간값으로 리셋
    fetch('/api/calc_cvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ y_star: yStar }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.cvar95 != null) setRiskMetrics({ ...data, exact: true }); })
      .catch(() => {});
  }, [yStar]);

  const { cvar95, cvar99, sortino, exact: cvarExact } = riskMetrics;
  const investAmount = (form.amount || 0) * 10000; // 원
  const maxLossWon = Math.round(investAmount * cvar99 / 100 / 10000); // 만 원

  // 30-year opp cost (rough mock)
  const oppCost30y = Math.round((form.amount || 0) * Math.pow(1 + 0.025, 30) * (yStar * 1.6));

  const slices = useMemoR(() => buildPortfolio(yStar, portfolioData), [yStar, portfolioData]);
  const [showAll, setShowAll] = useStateR(false);

  // XAI attribution: delta = weight × (score − 0.5) × 100 (직접 계산, SHAP 근사)
  const shap = [
    { var: '자금 여력',      impact: (capitalScore - 0.5) * 0.30 * 100, kind: capitalScore >= 0.5 ? 'pos' : 'neg' },
    { var: '시간 여력',      impact: (timeScore   - 0.5) * 0.30 * 100, kind: timeScore   >= 0.5 ? 'pos' : 'neg' },
    { var: '직업 안정성',    impact: (jobScore    - 0.5) * 0.25 * 100, kind: jobScore    >= 0.5 ? 'pos' : 'neg' },
    { var: '가족 부양 부담', impact: (familyScore - 0.5) * 0.15 * 100, kind: familyScore >= 0.5 ? 'pos' : 'neg' },
  ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // animated values
  const aAnim       = useCountUp(A, 900, [A]);
  const timeAnim    = useCountUp(timeScore * 10, 900, [timeScore]);
  const capitalAnim = useCountUp(capitalScore * 10, 900, [capitalScore]);
  const yAnim = useCountUp(yStar * 100, 900, [yStar]);

  return (
    <div className="screen-wrap">
      {/* persona header */}
      <div className="persona-banner">
        <div style={{ position: 'absolute', right: -20, top: 16, opacity: 0.85, transform: 'scale(0.85)' }}>
          <IsoStack size={160} theme={persona.key === 'early' ? 'welcome' : persona.key === 'retire' ? 'life' : 'income'}/>
        </div>
        <div className="header-nav">
          <button className="back-btn" onClick={onBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="back-btn" onClick={onRestart} aria-label="다시 진단" title="다시 진단">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M3 12a9 9 0 1015 -7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 3v5h-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div style={{ position: 'relative', zIndex: 2, marginTop: 18 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)',
            padding: '5px 11px', borderRadius: 100, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#FFD66B' }}/>
            YOUR PERSONA
          </div>
          <div className="persona-name">{persona.name}</div>
          <div className="persona-desc">{persona.desc}</div>
        </div>
      </div>

      <div className="scroll-body overlapping" style={{ marginTop: -36 }}>
        {/* score cards */}
        <div className="score-cards">
          <div className="score-card">
            <div className="lbl">시간 여력 <HelpTip>나이·은퇴 기간 기반 손실 회복 여력</HelpTip></div>
            <div className="val">{timeAnim.toFixed(1)} <span className="denom">/ 10</span></div>
            <div className="score-bar"><div className="fill" style={{ width: `${timeScore * 100}%` }}/></div>
            {(() => { const b = scoreBadge(timeScore); return (
              <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: b.bg, color: b.color }}>{b.label}</div>
            ); })()}
          </div>
          <div className="score-card">
            <div className="lbl">자금·소득 여력 <HelpTip>투자자금·재직기간·소득 안정성 평가</HelpTip></div>
            <div className="val">{capitalAnim.toFixed(1)} <span className="denom">/ 10</span></div>
            <div className="score-bar"><div className="fill" style={{ width: `${capitalScore * 100}%` }}/></div>
            {(() => { const b = scoreBadge(capitalScore); return (
              <div style={{ marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: b.bg, color: b.color }}>{b.label}</div>
            ); })()}
          </div>
        </div>

        {/* A + y* */}
        <div className="result-card">
          <div className="result-card-title">나의 투자 성향 분석</div>
          <div className="result-card-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>점수가 낮을수록 공격적인 투자 성향입니다.</span>
            {form.textScore != null && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                background: '#EBF3FF', color: '#1A6FE8',
              }}>✦ 라이프스타일 반영됨</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div className="gauge-wrap" style={{ flex: 1.1 }}>
              <ArcGauge value={A}/>
              <div className="gauge-center-val" style={{ marginTop: -10 }}>{aAnim.toFixed(2)}</div>
              <div className="gauge-center-lbl">투자 성향 점수 <HelpTip>위험회피계수(A): 낮을수록 공격적</HelpTip></div>
            </div>
            <div style={{
              width: 116, height: 116, borderRadius: '50%',
              background: `conic-gradient(var(--brand) 0% ${yStar*100}%, var(--line) ${yStar*100}% 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', flexShrink: 0,
            }}>
              <div style={{
                width: 90, height: 90, borderRadius: '50%', background: '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-deep)', letterSpacing: '-0.02em' }}>
                  {yAnim.toFixed(0)}%
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 600 }}>공격 투자 비중</div>
              </div>
            </div>
          </div>
          <div style={{
            background: 'var(--bg)', borderRadius: 12, padding: '12px 14px', marginTop: 14,
            fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55,
          }}>
            전체 투자자금의 <b style={{ color: 'var(--brand-deep)' }}>{Math.round(yStar*100)}%</b>를 성장 자산(ETF)에,{' '}
            <b style={{ color: 'var(--text)' }}>{Math.round((1-yStar)*100)}%</b>를 안전 자산(예금·채권 등)에 배분합니다.
          </div>
        </div>

        {/* Portfolio donut */}
        <div className="result-card">
          <div className="result-card-title">포트폴리오 배분</div>
          <div className="result-card-sub">최근 업데이트: {portfolioData?.last_rebalance ?? '2025-01-16'} · 자산 비중 최적화 적용</div>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <Donut slices={slices.map((s) => ({ ...s, color: SLOT_GROUP_COLORS[s.name] ?? s.color }))} riskyShare={yStar} size={190}/>
          </div>

          {/* 1단계: 자산군 요약 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
            {[
              { key: 'stock', label: '주식',    color: '#4B9EFF' },
              { key: 'bond',  label: '채권',    color: '#00C48C' },
              { key: 'other', label: '안전·기타', color: '#B0BAD4' },
            ].map(({ key, label, color }) => {
              const total = slices.filter((s) => getSlotGroup(s.name) === key).reduce((sum, s) => sum + s.weight, 0);
              if (total < 0.001) return null;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}/>
                  <div style={{ width: 60, fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
                  <div style={{ flex: 1, height: 6, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${total * 100}%`, height: '100%', background: color, borderRadius: 4 }}/>
                  </div>
                  <div style={{ minWidth: 40, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {(total * 100).toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>

          {/* 2단계: Top 3 종목 */}
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.05em' }}>주요 투자 종목</div>
          <div className="legend-list" style={{ marginBottom: 0 }}>
            {[...slices].sort((a, b) => b.weight - a.weight).slice(0, 3).map((s) => (
              <div key={s.name} className="legend-row">
                <span className="legend-dot" style={{ background: SLOT_GROUP_COLORS[s.name] ?? s.color }}/>
                <span className="legend-name">{formatSlotName(s.name)}</span>
                <span className="legend-pct">{(s.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {/* 3단계: 전체 구성 토글 */}
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{
              marginTop: 8, fontSize: 12, color: 'var(--brand-deep)', fontWeight: 600,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            }}
          >
            {showAll ? '접기 ∧' : `전체 구성 보기 (${slices.length}개) >`}
          </button>
          {showAll && (
            <div className="legend-list" style={{ marginTop: 6 }}>
              {[...slices].sort((a, b) => b.weight - a.weight).map((s) => (
                <div key={s.name} className="legend-row" style={{ opacity: s.weight < 0.01 ? 0.4 : 1 }}>
                  <span className="legend-dot" style={{ background: SLOT_GROUP_COLORS[s.name] ?? s.color }}/>
                  <span className="legend-name">{formatSlotName(s.name)}</span>
                  <span className="legend-pct">{(s.weight * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* XAI / SHAP */}
        <div className="result-card">
          <div className="result-card-title">
            <span style={{
              background: 'linear-gradient(135deg, #7B61FF, #4B9EFF)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontWeight: 800,
            }}>XAI</span> 비중 결정 이유
          </div>
          <div className="result-card-sub">각 요소가 나의 투자 성향 점수에 기여한 정도</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shap.map((s) => {
              const pct = Math.min(Math.abs(s.impact) * 4, 50); // max 50% half-bar (max delta=15 → 60%, capped)
              const sign = s.impact >= 0 ? '+' : '';
              return (
                <div key={s.var} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{s.var}</div>
                  <div style={{ flex: 1.5, height: 22, background: 'var(--bg)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute', left: '50%', top: 0, bottom: 0,
                      width: `${pct}%`,
                      transform: s.kind === 'neg' ? 'translateX(-100%)' : 'none',
                      background: s.kind === 'pos' ? 'linear-gradient(90deg, #00C48C, #4B9EFF)' : 'linear-gradient(90deg, #FF5252, #FF8A65)',
                      borderRadius: 4, opacity: 0.92,
                      transition: 'width 600ms ease-out',
                    }}/>
                    <div style={{
                      position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
                      background: 'var(--text-3)',
                    }}/>
                  </div>
                  <div style={{
                    minWidth: 52, textAlign: 'right', fontSize: 13, fontWeight: 700,
                    color: s.kind === 'pos' ? 'var(--green-text)' : 'var(--red)',
                    fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
                  }}>
                    {sign}{s.impact.toFixed(1)}%p
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CVaR */}
        <div className="result-card">
          <div className="result-card-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            최악의 상황에서 얼마나 잃을 수 있을까요?
            <HelpTip>CVaR: 과거 수익률 분포에서 최악의 5%·1% 구간 평균 손실 (월 기준)</HelpTip>
          </div>
          <div className="result-card-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>역사적 시뮬레이션 (2016~2025, {riskMetrics.n_months ?? 112}개월)</span>
            {cvarExact
              ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#E8F9F2', color: '#00875A' }}>✦ 개인 y* 정밀 계산</span>
              : <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#F5F6FA', color: '#8896B3' }}>추정값 (계산 중…)</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="cvar-row">
              <div className="lbl">일반적 나쁜 달의 평균 손실 (월 CVaR 95%)</div>
              <div className="val neg">{cvar95.toFixed(1)}%</div>
            </div>
            <div style={{ fontSize: 11, color: '#A03A3A', padding: '2px 0 8px', lineHeight: 1.5 }}>
              100번 중 5번 있는 나쁜 달에 평균 <b>{Math.abs(cvar95).toFixed(1)}%</b> 손실이 예상됩니다.
            </div>
            <div className="cvar-row">
              <div className="lbl">극단적 달의 평균 손실 (월 CVaR 99%)</div>
              <div className="val neg">{cvar99.toFixed(1)}%</div>
            </div>
            <div style={{ fontSize: 11, color: '#A03A3A', padding: '2px 0 8px', lineHeight: 1.5 }}>
              100번 중 1번 있는 극단적 달에 평균 <b>{Math.abs(cvar99).toFixed(1)}%</b> 손실이 예상됩니다.
            </div>
            <div className="cvar-row">
              <div className="lbl">한 달 최대 손실 금액 (CVaR 99%)</div>
              <div className="val neg">{maxLossWon.toLocaleString('ko-KR')}만 원</div>
            </div>
          </div>
        </div>

        {/* opp cost helper */}
        <div className="cta-helper">
          <div className="icon">!</div>
          <div className="copy">
            지금 적립금을 그대로 두면, 30년 뒤 약 <b>{oppCost30y.toLocaleString('ko-KR')}만 원</b>의 차이가 생길 수 있어요.
          </div>
        </div>

        <div style={{ flex: 1 }}/>
        <div style={{ padding: '16px 0 24px', display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={onRestart} style={{ width: '100%', maxWidth: 260 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            홈으로 돌아가기
          </button>
        </div>
      </div>

      <FloatingChatButton personaContext={{
        persona, A, yStar,
        riskScore, timeScore, capitalScore, jobScore, familyScore,
        cvar95, cvar99, sortino,
        shap, slices,
      }} />
    </div>
  );
}

Object.assign(window, { ResultScreen });
