// app.jsx — main app, state, routing between screens

const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

const SCREENS = ['welcome', 'step1', 'step2', 'step3', 'step4', 'loading', 'result'];

function App() {
  const [screen, setScreen] = useStateA('welcome');
  const [direction, setDirection] = useStateA('forward'); // for transitions
  const [form, setForm] = useStateA({
    age: null,
    horizon: null,
    dependents: [],
    amount: null,
    tenure: null,
    laborRatio: 100,
    salaryMode: 'year',
    salary: null,
    jobStab: null,
    expectedTenure: null,
    lifestyle: '',
    textScore: null,
  });

  const go = (next) => {
    const cIdx = SCREENS.indexOf(screen);
    const nIdx = SCREENS.indexOf(next);
    setDirection(nIdx > cIdx ? 'forward' : 'back');
    setScreen(next);
  };

  const goNext = () => {
    const cIdx = SCREENS.indexOf(screen);
    if (cIdx < SCREENS.length - 1) go(SCREENS[cIdx + 1]);
  };
  const goBack = () => {
    const cIdx = SCREENS.indexOf(screen);
    if (cIdx > 0) go(SCREENS[cIdx - 1]);
  };

  const restart = () => {
    setForm({
      age: null, horizon: null, dependents: [], amount: null,
      tenure: null, laborRatio: 100,
      salaryMode: 'year', salary: null, jobStab: null, expectedTenure: null,
      lifestyle: '', textScore: null,
    });
    go('welcome');
  };

  // demo: pre-fill data button for quick testing
  const fillDemo = () => {
    setForm({
      age: 34,
      horizon: '20_to_30',
      dependents: ['spouse', 'children'],
      amount: 5000,
      tenure: 8,
      laborRatio: 90,
      salaryMode: 'year',
      salary: 5800,
      jobStab: 'general',
      expectedTenure: 20,
      lifestyle: '',
      textScore: null,
    });
  };

  // Load Step 6/7 portfolio data
  // 초기값: index.html에 임베드된 __PORTFOLIO_DATA__ (file:// 포함 항상 동작)
  // fetch 성공 시 최신 portfolio_data.json으로 덮어쓰기 (HTTP 서버 환경)
  const [portfolioData, setPortfolioData] = useStateA(window.__PORTFOLIO_DATA__ || null);
  useEffectA(() => {
    fetch('./portfolio_data.json')
      .then((r) => r.json())
      .then(setPortfolioData)
      .catch(() => {}); // fallback to embedded data already set as initial state
  }, []);

  // Expose demo fill on window for keyboard shortcut
  useEffectA(() => {
    const h = (e) => {
      if (e.key === 'd' && e.shiftKey) fillDemo();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="app-shell" data-screen={screen}>
      {screen === 'welcome' && <WelcomeScreen onStart={() => go('step1')}/>}
      {screen === 'step1' && <Step1 form={form} setForm={setForm} onNext={goNext} onBack={goBack}/>}
      {screen === 'step2' && <Step2 form={form} setForm={setForm} onNext={goNext} onBack={goBack}/>}
      {screen === 'step3' && <Step3 form={form} setForm={setForm} onNext={goNext} onBack={goBack}/>}
      {screen === 'step4' && <Step4 form={form} setForm={setForm} onNext={goNext} onBack={goBack} onSkip={() => { setForm(f => ({ ...f, textScore: null })); go('result'); }}/>}
      {screen === 'loading' && <LoadingScreen form={form} setForm={setForm} onNext={() => go('result')}/>}
      {screen === 'result' && <ResultScreen form={form} onRestart={restart} onBack={goBack} portfolioData={portfolioData}/>}

      {/* hidden helper: demo fill */}
      {screen !== 'welcome' && screen !== 'result' && (
        <button
          onClick={fillDemo}
          style={{
            position: 'absolute', top: 14, right: 70, zIndex: 100,
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)',
            color: '#fff', fontSize: 10, fontWeight: 700, opacity: 0.7,
          }}
          title="데모 데이터 채우기 (Shift+D)"
        >데모</button>
      )}
    </div>
  );
}

// Mount inside iOS frame (desktop) or full-screen (mobile)
function Root() {
  const DEVICE_W = 390, DEVICE_H = 844;

  const getState = () => {
    const vH = window.visualViewport?.height || window.innerHeight;
    const vW = window.innerWidth;
    return {
      mobile: vW <= 500,
      scale: Math.max(0.5, Math.min(1,
        (window.innerHeight - 120) / DEVICE_H,
        (vW - 48) / DEVICE_W,
      )),
      mobileScale: vW / 390,
      innerH: vH,
    };
  };

  const [st, setSt] = useStateA(getState);

  useEffectA(() => {
    const update = () => setSt(getState());
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  if (st.mobile) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        <div style={{
          width: 390,
          height: Math.round(st.innerH / st.mobileScale),
          transform: `scale(${st.mobileScale})`,
          transformOrigin: 'top left',
        }}>
          <App/>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: Math.round(DEVICE_W * st.scale), height: Math.round(DEVICE_H * st.scale), flexShrink: 0 }}>
        <div style={{ transform: `scale(${st.scale})`, transformOrigin: 'top left' }}>
          <IOSDevice width={DEVICE_W} height={DEVICE_H} dark={false}>
            <App/>
          </IOSDevice>
        </div>
      </div>
      <div style={{
        fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 500,
        fontFamily: '-apple-system, system-ui, sans-serif', textAlign: 'center', maxWidth: 360,
      }}>
        XAI 기반 퇴직연금 포트폴리오 진단 · 페르소나 리스크 스코어 v0.1<br/>
        Shift+D 키로 데모 데이터를 빠르게 채울 수 있습니다.
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Root/>);
