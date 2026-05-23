// screens-flow.jsx — Welcome + STEP 1/2/3 screens

const { useState: useStateF, useMemo: useMemoF } = React;

// ─────────────────────────────────────────────────────────
// Header (shared by step screens)
// ─────────────────────────────────────────────────────────
function StepHeader({ step, total = 3, title, sub, onBack, theme = 'basic' }) {
  return (
    <div className="grad-header tall">
      {/* decorative isometric in corner */}
      <div style={{ position: 'absolute', right: -10, top: 6, opacity: 0.9, transform: 'scale(0.85)' }}>
        <IsoStack size={150} theme={theme}/>
      </div>
      <div className="header-nav" style={{ position: 'relative', zIndex: 2 }}>
        <button className="back-btn" onClick={onBack} aria-label="뒤로">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="step-label">STEP {step} / {total}</div>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(step / total) * 100}%` }}/>
      </div>
      <div className="header-title">{title}</div>
      {sub && <div className="header-sub">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Welcome
// ─────────────────────────────────────────────────────────
function WelcomeScreen({ onStart }) {
  return (
    <div className="welcome">
      {/* floating decoration */}
      <div style={{ position: 'absolute', top: 80, right: -40, opacity: 0.18 }}>
        <div style={{ width: 200, height: 200, borderRadius: '50%', background: '#fff' }}/>
      </div>
      <div style={{ position: 'absolute', bottom: 240, left: -50, opacity: 0.14 }}>
        <div style={{ width: 140, height: 140, borderRadius: '50%', background: '#fff' }}/>
      </div>

      <div style={{ position: 'relative', zIndex: 2, marginTop: 8 }}>
        <div className="badge">
          <span style={{ width: 6, height: 6, borderRadius: 99, background: '#FFD66B' }}/>
          XAI 기반 포트폴리오 진단 · 약 3분
        </div>
      </div>

      <div className="welcome-illust">
        <div style={{ transform: 'translateY(-10px)' }}>
          <IsoStack size={240} theme="welcome"/>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 2 }}>
        <h1>퇴직연금,<br/>방치 말고 진단부터</h1>
        <p>5가지 정보로 페르소나 리스크 스코어를 계산해<br/>참고용 포트폴리오 분석 정보를 확인할 수 있습니다.</p>

        <div className="welcome-features">
          <div className="welcome-feat">
            <div className="icon">📊</div>
            <div>
              <div className="t">포트폴리오 구성 이유, 한눈에 봐요</div>
              <div className="d">각 자산을 왜 담았는지 시각적으로 보여주세요</div>
            </div>
          </div>
          <div className="welcome-feat">
            <div className="icon">⚖️</div>
            <div>
              <div className="t">방치하면 얼마나 손해일까요?</div>
              <div className="d">30년 복리 시뮬레이션으로 기회비용을 계산해요</div>
            </div>
          </div>
        </div>

        <button className="start-btn" onClick={onStart}>
          진단 시작하기
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="disclaimer">
          본 서비스는 투자 자문이 아닌 참고용 진단 도구이며<br/>
          모든 입력 정보는 기기에만 저장되며 외부로 전송되지 않습니다.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// STEP 1 — Basic Info
// ─────────────────────────────────────────────────────────
function Step1({ form, setForm, onNext, onBack }) {
  const HORIZON_OPTS = [
    { val: 'under_5',  label: '5년 미만', desc: '은퇴 임박' },
    { val: '5_to_10',  label: '5~10년',  desc: '' },
    { val: '10_to_20', label: '10~20년', desc: '' },
    { val: '20_to_30', label: '20~30년', desc: '' },
    { val: 'over_30',  label: '30년 이상', desc: '사회초년생' },
  ];
  const DEP_OPTS = [
    { val: 'alone',        label: '혼자 거주',   ico: '🙋' },
    { val: 'spouse',       label: '배우자',      ico: '💑' },
    { val: 'children',     label: '자녀',        ico: '🧒' },
    { val: 'parents',      label: '부모',        ico: '👨‍👩‍👦' },
    { val: 'grandparents', label: '조부모',      ico: '👴' },
    { val: 'siblings',     label: '형제자매',    ico: '👫' },
    { val: 'relatives',    label: '친인척',      ico: '🏠' },
    { val: 'others',       label: '기타 동거인', ico: '🤝' },
  ];

  const ageErr = form.age && (form.age < 25 || form.age > 65) ? '25세 이상 65세 이하로 입력해주세요' : '';
  const amtErr = form.amount && form.amount < 100 ? '최소 100만 원 이상 입력해주세요' : '';
  const valid = form.age && !ageErr && form.horizon && form.amount && !amtErr;

  const toggleDep = (v) => {
    if (v === 'alone') {
      setForm({ ...form, dependents: form.dependents.includes('alone') ? [] : ['alone'] });
    } else {
      const next = form.dependents.filter((d) => d !== 'alone' && d !== v);
      if (!form.dependents.includes(v)) next.push(v);
      setForm({ ...form, dependents: next });
    }
  };

  const fmtAmt = (n) => n ? Number(n).toLocaleString('ko-KR') : '';

  return (
    <div className="screen-wrap">
      <StepHeader step={1} title={<>기본 정보를 알려주세요<br/></>} sub="나이·은퇴 시점·가족 구성으로 진단 베이스를 설정합니다" onBack={onBack} theme="basic"/>
      <div className="scroll-body overlapping">
        {/* 1-1 나이 */}
        <div className="field-group">
          <div className="field-label">나이 <span className="req">필수</span></div>
          <div className={`txt-input ${ageErr ? 'err' : ''}`} style={ageErr ? { borderColor: 'var(--red)' } : {}}>
            <input
              type="number"
              inputMode="numeric"
              placeholder="예: 34"
              value={form.age || ''}
              onChange={(e) => setForm({ ...form, age: e.target.value ? +e.target.value : null })}
            />
            <span className="suffix">세</span>
          </div>
          {ageErr && <div className="input-error">⚠ {ageErr}</div>}
        </div>

        {/* 1-2 은퇴까지 */}
        <div className="field-group">
          <div className="field-label">은퇴까지 남은 기간 <span className="req">필수</span></div>
          <div className="pill-grid cols-2">
            {HORIZON_OPTS.map((o) => (
              <button key={o.val} className={`pill tall ${form.horizon === o.val ? 'active' : ''}`}
                onClick={() => setForm({ ...form, horizon: o.val })}>
                <div>{o.label}</div>
                {o.desc && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, fontWeight: 400 }}>{o.desc}</div>}
              </button>
            ))}
          </div>
        </div>

        {/* 1-3 부양가족 */}
        <div className="field-group">
          <div className="field-label">
            부양 가족
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(중복 선택 가능)</span>
          </div>
          <div className="pill-grid cols-2">
            {DEP_OPTS.map((o) => (
              <button key={o.val} className={`option-card ${form.dependents.includes(o.val) ? 'active' : ''}`}
                onClick={() => toggleDep(o.val)} style={{ alignItems: 'flex-start' }}>
                <div className="option-icon" style={{ fontSize: 18 }}>{o.ico}</div>
                <div className="option-title">{o.label}</div>
                <div className="option-check">✓</div>
              </button>
            ))}
          </div>
        </div>

        {/* 1-4 투자자금 */}
        <div className="field-group">
          <div className="field-label">퇴직연금 누적금 <span className="req">필수</span></div>
          <div className={`txt-input`} style={amtErr ? { borderColor: 'var(--red)' } : {}}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="예: 3,000"
              value={fmtAmt(form.amount)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setForm({ ...form, amount: raw ? +raw : null });
              }}
            />
            <span className="suffix">만 원</span>
          </div>
          {amtErr ? <div className="input-error">⚠ {amtErr}</div>
            : form.amount > 0 && (
              <div className="field-hint">= {(form.amount * 10000).toLocaleString('ko-KR')} 원</div>
            )}
        </div>

        <div className="cta-bar">
          <button className="btn btn-secondary" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={onNext}>다음</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// STEP 2 — Life-cycle
// ─────────────────────────────────────────────────────────
function Step2({ form, setForm, onNext, onBack }) {
  const tenErr = form.tenure != null && (form.tenure < 0 || form.tenure > 50) ? '0~50년 사이로 입력해주세요' : '';
  const valid = form.tenure != null && !tenErr && form.laborRatio != null;
  const horizonLabel = {
    under_5: '5년 미만', '5_to_10': '5~10년', '10_to_20': '10~20년',
    '20_to_30': '20~30년', 'over_30': '30년 이상',
  }[form.horizon];

  return (
    <div className="screen-wrap">
      <StepHeader step={2} title={<>재직 기간과 소득 구조를<br/>알려주세요</>} sub="재직 기간과 소득 구조로 손실 회복 여력을 파악해요" onBack={onBack} theme="life"/>
      <div className="scroll-body overlapping">
        {/* 2-1 재직 기간 */}
        <div className="field-group">
          <div className="field-label">
            현재까지의 재직 기간
            <HelpTip>현직 기준 총 근무 연수. 이직·경력 단절 포함 누적 기간</HelpTip>
          </div>
          <div className="txt-input" style={tenErr ? { borderColor: 'var(--red)' } : {}}>
            <input type="number" inputMode="numeric" placeholder="예: 7"
              value={form.tenure ?? ''}
              onChange={(e) => setForm({ ...form, tenure: e.target.value === '' ? null : +e.target.value })}
            />
            <span className="suffix">년</span>
          </div>
          {tenErr && <div className="input-error">⚠ {tenErr}</div>}
        </div>

        {/* 2-2 은퇴 (readonly) */}
        <div className="field-group">
          <div className="field-label">은퇴까지 남은 기간</div>
          <div className="readonly-card">
            <div>
              <div className="lbl">STEP 1에서 입력한 정보</div>
              <div className="val" style={{ marginTop: 4 }}>{horizonLabel}</div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 100, background: 'var(--brand-bg)',
              fontSize: 11, color: 'var(--brand-deep)', fontWeight: 600,
            }}>자동 적용</div>
          </div>
        </div>

        {/* 2-3 근로소득 비중 */}
        <div className="field-group">
          <div className="field-label">
            근로소득 비중
            <HelpTip>근로소득: 월급·연봉 / 비근로소득: 배당·임대·사업소득 등</HelpTip>
          </div>
          <RangeSlider
            value={form.laborRatio ?? 100}
            onChange={(v) => setForm({ ...form, laborRatio: v })}
            min={0} max={100} step={5}
            leftLbl="0% (배당·임대만)"
            rightLbl="100% (근로소득만)"
          />
        </div>

        <div className="cta-bar">
          <button className="btn btn-secondary" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={onNext}>다음</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// STEP 3 — Income stability
// ─────────────────────────────────────────────────────────
function Step3({ form, setForm, onNext, onBack }) {
  const JOB_OPTS = [
    { val: 'stable',   ico: '🏛️', t: '안정적 직업군',    s: '공무원 / 교사 / 전문직 등' },
    { val: 'general',  ico: '💼', t: '일반 직장인',       s: '사무직 / IT / 기술직 등' },
    { val: 'unstable', ico: '🔧', t: '자영업·프리랜서',   s: '자영업 / 프리랜서 / 영업직 등' },
    { val: 'none',     ico: '🔍', t: '무직·구직 중',      s: '현재 소득 없음 / 구직 중' },
  ];
  const TENURE_OPTS = [3, 5, 7, 10, 20, 30, 40];

  const isAnnual = form.salaryMode !== 'month';
  const min = isAnnual ? 600 : 50;
  const max = isAnnual ? 100000 : 8000;
  const salaryErr = form.salary != null && (form.salary < min || form.salary > max)
    ? (isAnnual ? '연봉 범위를 확인해주세요 (600~10만 만원)' : '월급 범위를 확인해주세요 (50~8천 만원)')
    : '';

  const valid = form.salary != null && !salaryErr && form.jobStab && form.expectedTenure != null;

  const horizonLabel = {
    under_5: '5년 미만', '5_to_10': '5~10년', '10_to_20': '10~20년',
    '20_to_30': '20~30년', 'over_30': '30년 이상',
  }[form.horizon];

  const fmtAmt = (n) => n != null ? Number(n).toLocaleString('ko-KR') : '';

  return (
    <div className="screen-wrap">
      <StepHeader step={3} title={<>소득의 안정성을<br/>확인할게요</>} sub="규모와 지속성에 따라 추가 가산점이 반영됩니다" onBack={onBack} theme="income"/>
      <div className="scroll-body overlapping">
        {/* 3-1 연봉/월급 */}
        <div className="field-group">
          <div className="field-label" style={{ justifyContent: 'space-between', display: 'flex' }}>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>소득 <span className="req">필수</span></span>
            <div className="toggle">
              <button className={isAnnual ? 'on' : ''} onClick={() => setForm({ ...form, salaryMode: 'year', salary: null })}>연봉</button>
              <button className={!isAnnual ? 'on' : ''} onClick={() => setForm({ ...form, salaryMode: 'month', salary: null })}>월급</button>
            </div>
          </div>
          <div className="txt-input" style={salaryErr ? { borderColor: 'var(--red)' } : {}}>
            <input
              type="text"
              inputMode="numeric"
              placeholder={isAnnual ? '예: 4,500' : '예: 380'}
              value={fmtAmt(form.salary)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setForm({ ...form, salary: raw ? +raw : null });
              }}
            />
            <span className="suffix">만 원 / {isAnnual ? '년' : '월'}</span>
          </div>
          {salaryErr ? <div className="input-error">⚠ {salaryErr}</div>
            : form.salary > 0 && !isAnnual && (
              <div className="field-hint">연 환산 ≈ {(form.salary * 12).toLocaleString('ko-KR')}만 원</div>
            )}
        </div>

        {/* 3-2 직업 안정성 */}
        <div className="field-group">
          <div className="field-label">직업 유형 <span className="req">필수</span></div>
          <div className="pill-grid" style={{ gridTemplateColumns: '1fr', gap: 8 }}>
            {JOB_OPTS.map((o) => (
              <button key={o.val} className={`option-card ${form.jobStab === o.val ? 'active' : ''}`}
                onClick={() => setForm({ ...form, jobStab: o.val })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <div className="option-icon" style={{ fontSize: 20, width: 44, height: 44 }}>{o.ico}</div>
                <div style={{ flex: 1, gap: 2, display: 'flex', flexDirection: 'column' }}>
                  <div className="option-title">{o.t}</div>
                  <div className="option-sub">{o.s}</div>
                </div>
                <div className="option-check">✓</div>
              </button>
            ))}
          </div>
        </div>

        {/* 3-3 예상 근속 */}
        <div className="field-group">
          <div className="field-label">
            예상 근속 가능성
            <HelpTip>현재 직업 또는 유사 직종에서 계속 일할 수 있다고 생각하는 기간</HelpTip>
          </div>
          <div className="pill-grid cols-4" style={{ gap: 6 }}>
            {TENURE_OPTS.map((t) => (
              <button key={t} className={`pill ${form.expectedTenure === t ? 'active' : ''}`}
                onClick={() => setForm({ ...form, expectedTenure: t })}>
                {t}년
              </button>
            ))}
          </div>
        </div>

        {/* 3-4 은퇴까지 (readonly) */}
        <div className="field-group">
          <div className="field-label">은퇴까지 남은 기간</div>
          <div className="readonly-card">
            <div>
              <div className="lbl">STEP 1에서 입력한 정보</div>
              <div className="val" style={{ marginTop: 4 }}>{horizonLabel}</div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 100, background: 'var(--brand-bg)',
              fontSize: 11, color: 'var(--brand-deep)', fontWeight: 600,
            }}>자동 적용</div>
          </div>
        </div>

        <div className="cta-bar">
          <button className="btn btn-secondary" onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={onNext}>
            다음
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// STEP 4 — Lifestyle (선택 사항)
// ─────────────────────────────────────────────────────────
function Step4({ form, setForm, onNext, onBack, onSkip }) {
  return (
    <div className="screen-wrap">
      <StepHeader
        step={4} total={4}
        title={<>라이프스타일을<br/>알려주세요</>}
        sub="선택 사항 · 작성하면 투자 성향을 더 정확하게 파악해요"
        onBack={onBack}
        theme="income"
      />
      <div className="scroll-body overlapping">
        <div className="field-group">
          <div className="field-label">
            나의 라이프스타일
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>선택</span>
          </div>
          <textarea
            placeholder="취미, 직업관, 소비 성향, 인생 목표 등을 자유롭게 적어주세요"
            value={form.lifestyle}
            onChange={e => setForm({ ...form, lifestyle: e.target.value })}
            maxLength={300}
            rows={7}
            style={{
              width: '100%', padding: '14px', borderRadius: 12,
              border: '1.5px solid var(--line)', fontSize: 16,
              lineHeight: 1.6, resize: 'none', color: 'var(--text)',
              background: '#fff', boxSizing: 'border-box',
              fontFamily: 'inherit', outline: 'none',
            }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, textAlign: 'right' }}>
            {form.lifestyle.length} / 300
          </div>
        </div>

        <div style={{
          background: 'var(--bg)', borderRadius: 12, padding: '14px',
          fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>적으면 진단이 더 정확해져요</div>
          소비 성향, 직업관, 인생 목표 등을 자유롭게 적어주세요.<br/>
          AI가 투자 성향 분석에 참고해요.<br/>
          작성하지 않아도 기본 점수로 진단해요.
        </div>

        <div className="cta-bar">
          <button
            className="btn btn-secondary"
            onClick={onSkip}
            style={{ flex: '0 0 80px', whiteSpace: 'nowrap' }}
          >
            건너뛰기
          </button>
          <button
            className="btn btn-primary"
            disabled={!form.lifestyle.trim()}
            onClick={onNext}
          >
            분석 시작
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Loading Screen — 분석 중
// ─────────────────────────────────────────────────────────
function LoadingScreen({ form, setForm, onNext }) {
  const [stage, setStage] = React.useState(0);
  const STAGES = [
    '투자 성향을 파악하고 있어요',
    '최적 포트폴리오를 계산하고 있어요',
    '기회비용을 계산하고 있어요',
    '진단 리포트를 만들고 있어요',
  ];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStage(s => (s + 1) % STAGES.length);
    }, 2000);

    const run = async () => {
      // 텍스트 분석 + 정형 ML 모델 병렬 호출
      const tasks = [];

      if (form.lifestyle.trim()) {
        tasks.push(
          fetch('/api/analyze_persona', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: form.lifestyle }),
          })
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.score != null) setForm(f => ({ ...f, textScore: data.score })); })
            .catch(() => {})
        );
      }

      tasks.push(
        fetch('/api/score_structured', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            age:            form.age ?? 40,
            jobStab:        form.jobStab ?? 'general',
            horizon:        form.horizon ?? '10_to_20',
            dependents:     form.dependents ?? [],
            laborRatio:     form.laborRatio ?? 80,
            salary:         form.salary ?? 0,
            salaryMode:     form.salaryMode ?? 'annual',
            tenure:         form.tenure ?? 0,
            expectedTenure: form.expectedTenure ?? 10,
            amount:         form.amount ?? 0,
          }),
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.score != null) setForm(f => ({ ...f, structScore: data.score })); })
          .catch(() => {})
      );

      await Promise.all(tasks);
      clearInterval(interval);
      setTimeout(onNext, 600);
    };

    run();
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'linear-gradient(160deg, #1a3fcc 0%, #2563eb 45%, #1e40af 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', textAlign: 'center', padding: '32px',
    }}>
      <style>{`
        @keyframes ls-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.25)',
        borderTopColor: '#fff',
        animation: 'ls-spin 0.9s linear infinite',
        marginBottom: 36,
      }}/>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, lineHeight: 1.4 }}>
        {STAGES[stage]}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        {STAGES.map((_, i) => (
          <div key={i} style={{
            width: i === stage ? 20 : 6,
            height: 6,
            borderRadius: 3,
            background: i <= stage ? '#fff' : 'rgba(255,255,255,0.3)',
            transition: 'all 0.4s ease',
          }}/>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { WelcomeScreen, Step1, Step2, Step3, Step4, StepHeader, LoadingScreen });
