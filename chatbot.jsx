// chatbot.jsx — floating chat button + slide-up modal
// OpenAI API 직접 호출 (백엔드 불필요)

const { useState: useStateC, useRef: useRefC, useEffect: useEffectC, useMemo: useMemoC } = React;

// ─── 시스템 프롬프트 ───────────────────────────────────────────
const SYSTEM_BASE = `당신은 퇴직연금 전문 AI 상담사입니다.
반드시 아래 제공된 문서 내용만을 근거로 답변하세요.
문서에 없는 내용은 "해당 내용은 제가 보유한 자료에서 확인이 어렵습니다. 금융감독원(1332) 또는 근로복지공단(1588-0075)에 문의해 주세요." 라고 답변하세요.
답변은 항상 한국어로, 친근하고 명확하게 작성하세요.
숫자와 수치는 정확하게 인용하세요.

============================================================
[문서 1] 세액공제 규정 (소득세법 제59조의3)
============================================================
■ 세액공제 한도
- 연금저축 단독: 연 600만원 한도
- 연금저축 + IRP 합산: 연 900만원 한도
- IRP 단독으로도 900만원까지 납입 가능

■ 세액공제율
- 총급여 5,500만원 이하: 16.5% (지방소득세 포함)
- 총급여 5,500만원 초과: 13.2% (지방소득세 포함)

■ 최대 환급액
- 5,500만원 이하: 900만원 × 16.5% = 148만 5,000원
- 5,500만원 초과: 900만원 × 13.2% = 118만 8,000원

■ 납입 전략
- 연금저축 600만원 먼저 채운 후 → IRP 300만원 추가
- 이유: 연금저축이 IRP보다 중도 인출이 자유롭고 수익률 비교적 높음

■ ISA 연계 추가 혜택
- ISA 만기금액을 IRP로 전환 시 전환금액의 10%, 최대 300만원 추가 세액공제

■ 중도 해지 시 불이익
- 세액공제 받은 금액에 대해 기타소득세 16.5% 부과

============================================================
[문서 2] 퇴직연금 제도 기본 (근로자퇴직급여 보장법)
============================================================
■ 퇴직연금 종류
- DB형 (확정급여형): 회사가 운용 책임. 퇴직 시 사전에 정해진 급여 수령
- DC형 (확정기여형): 근로자가 직접 운용 지시. 운용 결과에 따라 수령액 달라짐
- IRP (개인형 퇴직연금): 개인이 자유롭게 가입. 이직·퇴직 시 퇴직금 통합 관리 가능

■ DC형 운용 현실
- 적립금의 83.3% (약 58조원)가 원리금보장형에 방치
- 원리금보장형 평균 수익률: 연 1~2%대

■ 디폴트옵션 제도
- DC형/IRP 가입자가 운용 지시를 하지 않을 경우 자동으로 적용되는 운용 방법
- 위험등급 1~5단계로 구분, 2022년 도입

■ 수령 방법
- 만 55세 이상, 가입 기간 10년 이상 시 연금 수령 가능
- 연금 수령 시 연금소득세 (3.3~5.5%) — 일시금보다 세금 유리

============================================================
[문서 3] ETF 투자 한도 및 운용 규정
============================================================
■ 퇴직연금 ETF 투자 가능 비중
- 위험자산 (주식형 ETF 등): 적립금의 최대 70%까지
- 안전자산 (채권형, 원리금보장 등): 최소 30% 이상 유지

■ 투자 불가 ETF
- 레버리지·인버스 ETF는 퇴직연금 계좌에서 투자 불가

■ 주요 투자 가능 ETF 예시
- 국내주식: KODEX 코스피200, KODEX 코스닥150
- 해외주식: TIGER 미국S&P500, TIGER 미국나스닥100
- 채권: KODEX 국고채3-5년, KODEX 국고채10년
- 원자재: KODEX 골드선물(H)

============================================================
[문서 4] 포트폴리오 최적화 개념 (MPT + XAI)
============================================================
■ 샤프지수 (Sharpe Ratio)
- 공식: (포트폴리오 수익률 - 무위험이자율) / 표준편차
- 의미: 위험 1단위당 초과수익. 높을수록 효율적

■ 소르티노 비율 (Sortino Ratio)
- 하방 위험만 고려한 위험조정수익률
- 소르티노 = (수익률 - MAR) / 하방표준편차

■ CVaR (조건부 손실기대액)
- 95% CVaR: 최악의 5% 상황에서의 평균 손실
- 99% CVaR: 최악의 1% 상황에서의 평균 손실

■ SHAP 설명 (XAI)
- 각 변수가 ETF 비중 결정에 얼마나 기여했는지 수치화
- 예: "은퇴까지 남은 기간이 위험자산 비중에 +12.3%p 기여"

■ 금리 국면별 전략
- 금리 인상기: 채권 비중 축소, 단기채·원자재 비중 확대
- 금리 인하기: 장기채 비중 확대, 주식 비중 유지

============================================================
[답변 규칙 — 반드시 지켜야 함]
============================================================
- 첫 줄에 핵심 결론 한 줄만 써. 예) "시간 여력이 높아서 위험자산 비중이 55%로 설정됐어요."
- 이유는 3줄 이내로, 각 항목을 줄바꿈으로만 구분해
- 마크다운 기호(**, ##, --, * 등) 절대 사용하지 마
- "~을 의미합니다", "~을 나타냅니다" 같은 반복 표현 쓰지 마
- 숫자 기여도는 괄호로 짧게 표시해. 예) 시간 여력 73% (+7.0%p)
- 마지막 줄은 한 줄 요약으로 마무리
- 전체 답변 5줄 이내
`;

const TAB_CONTEXT = {
  '제도 Q&A': '현재 사용자는 퇴직연금 제도에 대한 일반적인 궁금증을 질문하고 있습니다. 세액공제, DC/DB/IRP 차이, 디폴트옵션, 수령 방법 등 제도 관련 질문에 집중하여 답변하세요. 복잡한 개념은 쉬운 예시와 함께 설명하세요.',
  '포트폴리오': '현재 사용자는 자신의 포트폴리오 구성 또는 투자 전략에 대해 질문하고 있습니다. ETF 비중, 소르티노·CVaR 지표, SHAP 설명 등 투자 관련 개념을 설명하세요. 구체적인 수치와 함께 왜 그런 결과가 나왔는지 설명하는 데 집중하세요.',
};

const EXAMPLE_QS = {
  '제도 Q&A': [
    'IRP와 연금저축 차이가 뭔가요?',
    '세액공제 최대로 받으려면 얼마 넣어야 해요?',
    '디폴트옵션이 뭔가요?',
    '퇴직금을 IRP로 받으면 세금이 어떻게 되나요?',
  ],
  '포트폴리오': [
    '원리금보장형 100%가 왜 비효율적인가요?',
    'CVaR이 뭔가요?',
    'SHAP으로 ETF 비중을 어떻게 설명하나요?',
    '금리 인상기에는 어떤 전략이 좋나요?',
  ],
};

// ─── 사용자 진단 결과 → 시스템 프롬프트 주입 문자열 ─────────────
function buildPersonaContext(ctx) {
  if (!ctx) return '';
  const { persona, A, yStar, riskScore, timeScore, capitalScore, jobScore, familyScore,
          cvar95, cvar99, sortino, shap, slices } = ctx;

  const pct  = (v) => `${Math.round((v ?? 0) * 100)}%`;
  const f1   = (v) => (v != null) ? v.toFixed(1) : '-';
  const f2   = (v) => (v != null) ? v.toFixed(2) : '-';

  const topSlices = (slices || [])
    .slice().sort((a, b) => b.weight - a.weight).slice(0, 5)
    .map((s) => `${s.name} ${pct(s.weight)}`).join(', ');

  const shapLines = (shap || []).slice(0, 4)
    .map((s) => `- ${s.var}: ${s.impact >= 0 ? '+' : ''}${f1(s.impact)}%p`).join('\n');

  return `
============================================================
[사용자 개인 진단 결과 — 이 대화 전용 데이터]
============================================================
■ 페르소나: ${persona?.name ?? ''}
■ 위험회피계수(A): ${f2(A)}
■ 위험자산 비중(y*): ${pct(yStar)} (법적 상한 70% 이내)
■ 종합 리스크 점수: ${pct(riskScore)}
   - 시간 여력: ${pct(timeScore)}
   - 자금 여력: ${pct(capitalScore)}
   - 직업 안정성: ${pct(jobScore)}
   - 가족 부양 부담: ${pct(familyScore)}

■ 리스크 지표 (Historical Simulation, 2016~2025 분기 기반)
   - 일반적 나쁜 상황 분기 손실 (CVaR 95%): ${f1(cvar95)}%
   - 극단적 상황 분기 손실 (CVaR 99%): ${f1(cvar99)}%
   - 소르티노 비율: ${f2(sortino)}

■ XAI 요인 기여도 (위험자산 비중 결정에 대한 각 요인 기여)
${shapLines}

■ 포트폴리오 주요 구성 (상위 5개)
${topSlices}
============================================================
위 수치는 현재 사용자의 실제 진단 결과입니다.
"내 y*가 왜 이래요?", "내 CVaR이 얼마예요?", "왜 이 페르소나가 됐나요?" 같은 질문에 위 데이터를 직접 인용하여 구체적으로 설명하세요.
제도 Q&A 탭에서도 이 사용자의 상황(페르소나·소득·리스크)에 맞게 예시를 제시하세요.
`;
}

// ─── API 호출 — 로컬 프록시 서버 경유 (localhost:8000) ──────────
const PROXY_URL = '/api/chat';

async function callOpenAI(apiKey, tab, history, personaContext, onChunk, onDone, onError) {
  const personaCtxStr = buildPersonaContext(personaContext);
  const systemPrompt = SYSTEM_BASE + personaCtxStr + '\n\n' + TAB_CONTEXT[tab];
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
  ];

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      onError(err.detail || `서버 오류 (${res.status})`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') { onDone(full); return; }
        try {
          full += JSON.parse(data).delta || '';
          onChunk(full);
        } catch {}
      }
    }
    onDone(full);
  } catch (e) {
    onError('챗봇 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  }
}

// ─── AI 답변 렌더러 — 첫 줄 강조 + 줄바꿈 처리 ─────────────────
function renderAIMessage(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length <= 1) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>;
  }
  return (
    <div>
      <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8, lineHeight: 1.5 }}>
        {lines[0]}
      </div>
      {lines.slice(1, lines.length - 1).map((l, i) => (
        <div key={i} style={{ color: 'var(--text)', lineHeight: 1.6, marginBottom: 2 }}>{l}</div>
      ))}
      {lines.length > 1 && (
        <div style={{ color: 'var(--text-2)', marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
          {lines[lines.length - 1]}
        </div>
      )}
    </div>
  );
}

// ─── ChatModal 컴포넌트 ────────────────────────────────────────
function ChatModal({ open, onClose, personaContext }) {
  const [tab, setTab] = useStateC('제도 Q&A');
  const [histories, setHistories] = useStateC({ '제도 Q&A': [], '포트폴리오': [] });
  const [input, setInput] = useStateC('');
  const [streaming, setStreaming] = useStateC('');
  const [loading, setLoading] = useStateC(false);
  const bottomRef = useRefC(null);

  useEffectC(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [histories, streaming]);

  // 포트폴리오 탭: personaContext 있으면 개인화 예시 질문 생성
  // ※ 훅은 반드시 early return 전에 호출해야 함
  const exampleQs = useMemoC(() => {
    if (tab === '포트폴리오' && personaContext?.yStar != null) {
      const { persona, yStar, cvar99 } = personaContext;
      return [
        `내 위험자산 비중이 ${Math.round(yStar * 100)}%인 이유가 뭔가요?`,
        `분기 최대 손실 ${(cvar99 ?? 0).toFixed(1)}%가 위험한 수준인가요?`,
        `${persona?.name ?? '내 페르소나'}는 어떤 투자 성향인가요?`,
        '내 포트폴리오에서 가장 비중이 큰 자산은 뭔가요?',
      ];
    }
    return EXAMPLE_QS[tab];
  }, [tab, personaContext]);

  if (!open) return null;

  const msgs = histories[tab];

  async function send(text) {
    if (!text.trim() || loading) return;

    const userMsg = { role: 'user', content: text };
    const newHistory = [...msgs, userMsg];
    setHistories(h => ({ ...h, [tab]: newHistory }));
    setInput('');
    setLoading(true);
    setStreaming('');

    await callOpenAI(
      null, tab, newHistory, personaContext,
      (chunk) => setStreaming(chunk),
      (full) => {
        setHistories(h => ({
          ...h,
          [tab]: [...newHistory, { role: 'assistant', content: full }],
        }));
        setStreaming('');
        setLoading(false);
      },
      (err) => {
        setHistories(h => ({
          ...h,
          [tab]: [...newHistory, { role: 'assistant', content: `❌ ${err}` }],
        }));
        setStreaming('');
        setLoading(false);
      }
    );
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      background: 'rgba(0,0,0,0.45)',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        height: '85%', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
        animation: 'slideUp 0.28s ease-out',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '16px 18px 12px', borderBottom: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>💬 AI 상담사</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 1 }}>문서 기반 · 투자 권유 아님</div>
          </div>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: '50%', background: 'var(--bg)',
            border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--text-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        {/* 탭 */}
        <div style={{
          display: 'flex', padding: '10px 18px 0', gap: 8, flexShrink: 0,
        }}>
          {['제도 Q&A', '포트폴리오'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--brand)' : 'var(--bg)',
              color: tab === t ? '#fff' : 'var(--text-2)',
              transition: 'all 0.15s',
            }}>{t}</button>
          ))}
          {msgs.length > 0 && (
            <button onClick={() => setHistories(h => ({ ...h, [tab]: [] }))} style={{
              marginLeft: 'auto', padding: '6px 10px', borderRadius: 20,
              fontSize: 11, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--text-3)',
            }}>초기화</button>
          )}
        </div>

        {/* 메시지 영역 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* 예시 질문 */}
          {msgs.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginBottom: 2 }}>자주 묻는 질문</div>
              {exampleQs.map(q => (
                <button key={q} onClick={() => send(q)} style={{
                  textAlign: 'left', padding: '9px 13px', borderRadius: 10,
                  background: 'var(--bg)', border: '1px solid var(--line)',
                  fontSize: 13, color: 'var(--text)', cursor: 'pointer',
                  lineHeight: 1.4,
                }}>{q}</button>
              ))}
            </div>
          )}

          {/* 채팅 메시지 */}
          {msgs.map((m, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%', padding: '10px 13px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: m.role === 'user' ? 'var(--brand)' : 'var(--bg)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                fontSize: 13, lineHeight: 1.55,
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              }}>
                {m.role === 'assistant' ? renderAIMessage(m.content) : m.content}
              </div>
            </div>
          ))}

          {/* 스트리밍 중인 메시지 */}
          {streaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                maxWidth: '80%', padding: '10px 13px',
                borderRadius: '16px 16px 16px 4px',
                background: 'var(--bg)', color: 'var(--text)',
                fontSize: 13, lineHeight: 1.55,
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
              }}>
                {renderAIMessage(streaming)}
                <span style={{ display: 'inline-block', animation: 'blink 1s step-end infinite', marginLeft: 2 }}>▌</span>
              </div>
            </div>
          )}

          {/* 로딩 (스트리밍 시작 전) */}
          {loading && !streaming && (
            <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 7, height: 7, borderRadius: '50%', background: 'var(--brand)',
                  animation: `bounce 1s ${i * 0.15}s infinite`,
                }}/>
              ))}
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* 입력창 */}
        <div style={{
          padding: '10px 18px 20px', borderTop: '1px solid var(--line)',
          display: 'flex', gap: 8, flexShrink: 0,
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder={`${tab} 관련 질문을 입력하세요`}
            disabled={loading}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12, fontSize: 14,
              border: '1.5px solid var(--line)', outline: 'none',
              background: loading ? 'var(--bg)' : '#fff',
              color: 'var(--text)',
            }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{
            width: 42, height: 42, borderRadius: 12, border: 'none',
            background: loading || !input.trim() ? 'var(--line)' : 'var(--brand)',
            color: '#fff', fontSize: 18, cursor: loading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s', flexShrink: 0,
          }}>↑</button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── FloatingChatButton ────────────────────────────────────────
function FloatingChatButton({ personaContext }) {
  const [open, setOpen] = useStateC(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="AI 상담사 열기"
        style={{
          position: 'absolute', bottom: 80, right: 14, zIndex: 9998,
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--brand), #7B61FF)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(75,158,255,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
          animation: 'floatIn 0.4s 0.6s both',
        }}
      >
        💬
      </button>
      <ChatModal open={open} onClose={() => setOpen(false)} personaContext={personaContext} />
      <style>{`
        @keyframes floatIn {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}

Object.assign(window, { FloatingChatButton, ChatModal });
