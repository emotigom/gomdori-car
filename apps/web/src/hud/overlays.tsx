import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SYSTEMS } from '../three/systems.ts';
import { PRESETS } from '../three/presets.ts';
import { startShowcase } from './attract.tsx';
import { Icon } from './icons.tsx';
import { load, save } from './persist.ts';
import { DEFAULT_SETTINGS, hud, useHud, type Settings } from './store.ts';
import { toast } from './toast.tsx';
import { isIntegrated, resolveTier } from '../three/quality.ts';

const TIER_KO = { high: '높음', medium: '보통', low: '낮음' } as const;
function gpuLabel() {
  return `${isIntegrated() ? '내장 그래픽' : '외장 그래픽'} → ${TIER_KO[resolveTier('auto').id]}`;
}

/**
 * U6 overlays: settings, hotkey help, first-visit tour, and the glue that
 * persists settings / recent parts and applies UI scale + reduced motion.
 */

let installed = false;
export function installOverlays() {
  if (installed) return;
  installed = true;
  let prev = hud.get();
  const apply = () => {
    const st = hud.get().settings;
    document.documentElement.style.setProperty('--ui-scale', String(st.uiScale));
    document.documentElement.classList.toggle('reduce-motion', st.reducedMotion);
  };
  apply();
  hud.subscribe(() => {
    const s = hud.get();
    const was = prev;
    prev = s; // update first: the sets below re-enter this listener
    if (s.settings !== was.settings) {
      save('settings', s.settings);
      apply();
    }
    if (s.openPart && s.openPart !== was.openPart) {
      const recent = [s.openPart, ...s.recent.filter((p) => p.id !== s.openPart!.id)].slice(0, 8);
      hud.set({ recent });
      save('recent', recent);
    }
    // first visit: start the tour once the boot screen has lifted
    if (s.booted && !was.booted && !load('tour-done', false) && !new URLSearchParams(location.search).has('notour')) {
      setTimeout(() => hud.get().view === 'hangar' && hud.set({ tour: 0 }), 3400);
    }
  });
  addEventListener('keydown', (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest?.('input, select, textarea')) return;
    if (e.key === '?' || e.key === 'F1') {
      e.preventDefault();
      hud.set((s) => ({ helpOpen: !s.helpOpen, settingsOpen: false }));
    } else if (e.key === ',') hud.set((s) => ({ settingsOpen: !s.settingsOpen, helpOpen: false }));
    else if (e.key === 'Escape') {
      // close the top-most layer only (the part drawer and palette handle their own Esc)
      const s = hud.get();
      if (s.tour !== null) {
        save('tour-done', true);
        hud.set({ tour: null });
      } else if (s.helpOpen || s.settingsOpen) hud.set({ helpOpen: false, settingsOpen: false });
      else if (s.openPart || s.paletteOpen) return;
      else if (s.contentOpen) hud.set({ contentOpen: null });
      else if (s.orderOpen) hud.set({ orderOpen: false });
    }
  });
}

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  hud.set((s) => ({ settings: { ...s.settings, [k]: v } }));
}

/* ------------------------------------------------------------------ settings */

function Toggle({ k, label, note }: { k: keyof Settings; label: string; note?: string }) {
  const v = useHud((s) => s.settings[k]) as boolean;
  return (
    <label className="st-row">
      <span>
        {label}
        {note && <small>{note}</small>}
      </span>
      <button role="switch" aria-checked={v} className={`switch ${v ? 'on' : ''}`} onClick={() => setSetting(k, !v as never)}>
        <i />
      </button>
    </label>
  );
}

export function SettingsPanel() {
  const open = useHud((s) => s.settingsOpen);
  const st = useHud((s) => s.settings);
  if (!open) return null;
  return (
    <aside className="settings frame" role="dialog" aria-label="설정">
      <div className="frame-title">
        <span>설정</span>
        <small>OPTIONS</small>
        <span className="grow" />
        <button className="hbtn sm" onClick={() => hud.set({ settingsOpen: false })}>
          닫기
        </button>
      </div>
      <div className="st-body">
        <h4>렌더링 품질</h4>
        <div className="st-row">
          <span>
            품질
            <small>자동: {gpuLabel()}</small>
          </span>
          <div className="seg" role="radiogroup" aria-label="렌더링 품질">
            {([['auto', '자동'], ['high', '높음'], ['medium', '보통'], ['low', '낮음']] as const).map(([v, ko]) => (
              <button key={v} role="radio" aria-checked={st.quality === v} onClick={() => setSetting('quality', v)}>
                {ko}
              </button>
            ))}
          </div>
        </div>
        <h4>그래픽 효과</h4>
        <Toggle k="bloom" label="블룸(빛 번짐)" />
        <Toggle k="chroma" label="색수차" note="렌즈 가장자리 색 번짐" />
        <Toggle k="scanlines" label="스캔라인" />
        <Toggle k="particles" label="부유 입자" />
        <Toggle k="shake" label="카메라 흔들림" note="선택·분해 시 펀치" />
        <h4>모션</h4>
        <Toggle k="reducedMotion" label="동작 줄이기" note="인트로·흔들림·HUD 애니메이션 끔" />
        <Toggle k="attract" label="쇼케이스 자동 시작" note="30초 동안 입력이 없으면" />
        <h4>사운드</h4>
        <label className="st-row">
          <span>효과음 볼륨</span>
          <input type="range" min={0} max={1} step={0.05} value={st.volume} onChange={(e) => setSetting('volume', Number(e.target.value))} aria-label="효과음 볼륨" />
        </label>
        <Toggle k="ambient" label="격납고 앰비언스" note="낮은 공조음" />
        <h4>화면</h4>
        <div className="st-row">
          <span>HUD 크기</span>
          <div className="seg" role="radiogroup" aria-label="HUD 크기">
            {[0.9, 1, 1.1].map((v) => (
              <button key={v} role="radio" aria-checked={st.uiScale === v} onClick={() => setSetting('uiScale', v)}>
                {Math.round(v * 100)}%
              </button>
            ))}
          </div>
        </div>
        <div className="st-actions">
          <button className="hbtn sm" onClick={() => hud.set({ settings: { ...DEFAULT_SETTINGS }, })}>
            기본값으로
          </button>
          <button
            className="hbtn sm"
            onClick={() => {
              save('tour-done', false);
              hud.set({ settingsOpen: false, view: 'hangar', tour: 0 });
            }}
          >
            투어 다시 보기
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------------- help */

const KEYS: [string, string][] = [
  ['드래그 / 휠', '회전 / 확대·축소'],
  ['차량 위 마우스', 'X-RAY 스캔'],
  ['X', 'X-RAY 고정'],
  ['Space', '자동 회전'],
  ['V', '분해 뷰'],
  ['H', '전조등'],
  ['P', '사진 모드 (HUD 숨김, 캡처)'],
  ['1 – 4', `조명: ${Object.values(PRESETS).map((p) => p.ko).join(' · ')}`],
  ['Esc', '선택 해제 · 창 닫기'],
  ['Ctrl/⌘ + K', '명령 팔레트 · 부품 검색'],
  [',', '설정'],
  ['? / F1', '이 도움말'],
];

export function HelpOverlay() {
  const open = useHud((s) => s.helpOpen);
  if (!open) return null;
  return (
    <div className="help-back" onClick={() => hud.set({ helpOpen: false })}>
      <div className="help frame" role="dialog" aria-label="단축키" onClick={(e) => e.stopPropagation()}>
        <div className="frame-title">
          <span>조작법</span>
          <small>CONTROLS</small>
          <span className="grow" />
          <button className="hbtn sm" onClick={() => hud.set({ helpOpen: false })}>
            닫기 <kbd>Esc</kbd>
          </button>
        </div>
        <div className="help-grid">
          <section>
            <h4>격납고</h4>
            <dl>
              {KEYS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h4>계통 단축키</h4>
            <div className="help-sys">
              {SYSTEMS.map((d) => (
                <div key={d.id} style={{ ['--c' as string]: d.color }}>
                  <kbd>{d.hotkey}</kbd>
                  <Icon name={d.id} size={16} />
                  <span>{d.ko}</span>
                </div>
              ))}
            </div>
            <p className="faint">계통 버튼을 더블클릭하면 부품 탐색으로 바로 넘어갑니다.</p>
            <div className="help-actions">
              <button
                className="hbtn sm"
                onClick={() => {
                  hud.set({ helpOpen: false, view: 'hangar', tour: 0 });
                }}
              >
                투어 다시 보기
              </button>
              <button
                className="hbtn sm"
                onClick={() => {
                  hud.set({ helpOpen: false });
                  startShowcase();
                }}
              >
                쇼케이스 시작
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- tour */

const STEPS: { sel: string | null; title: string; body: string }[] = [
  { sel: null, title: '곰도리 격납고에 오신 것을 환영합니다', body: '가운데 차량이 내 차입니다. 마우스를 올리면 X-RAY로 바뀌고, 13개 계통이 부품 목록과 선으로 연결됩니다. 드래그로 돌려 보세요.' },
  { sel: '.garage', title: '내 차 고르기', body: '제조사·모델·연식을 바꾸면 차체 모양과 적용 부품 수가 바로 바뀝니다. 아래에서 조명, 분해 뷰, 전조등, 사진 모드를 켤 수 있습니다.' },
  { sel: '.console-cmd', title: '계통 명령', body: '버튼이나 단축키(E, K, S…)로 계통을 선택하면 카메라가 날아가고 아래 패널에 실제 적용 부품이 나옵니다. 더블클릭은 부품 탐색으로 이동합니다.' },
  { sel: '.navtabs', title: '탭', body: '분석(그래프·차량 비교), 부품(100만 건 탐색), 콘텐츠(게이트가 있는 칸반), 시장 정보, 기기(오프라인 동기화).' },
  { sel: '.resources', title: '작업 지시서 · 명령 팔레트', body: '부품 옆 + 버튼으로 작업 지시서에 담고, Ctrl+K로 어디서든 명령과 부품을 찾습니다. ? 키를 누르면 단축키 전체를 볼 수 있습니다.' },
];

export function Tour() {
  const step = useHud((s) => s.tour);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const cur = step !== null ? STEPS[step] : null;
  useLayoutEffect(() => {
    if (!cur?.sel) return setRect(null);
    const el = document.querySelector(cur.sel);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [cur]);
  useEffect(() => {
    card.current?.querySelector<HTMLButtonElement>('.tour-next')?.focus();
  }, [step]);
  if (step === null || !cur) return null;
  const end = () => {
    save('tour-done', true);
    hud.set({ tour: null });
  };
  const next = () => {
    if (step + 1 >= STEPS.length) {
      end();
      toast('투어 완료 · ? 키로 언제든 조작법을 볼 수 있습니다', 'ok');
    } else hud.set({ tour: step + 1 });
  };
  const pad = 6;
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  // place the card beside the highlighted element, inside the viewport
  let pos: React.CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (hole) {
    const W = 340;
    const right = hole.left + hole.width + 16;
    const left = right + W < innerWidth ? right : Math.max(16, hole.left - W - 16);
    const below = hole.top + hole.height + 16;
    const useBelow = hole.width > innerWidth * 0.4;
    pos = useBelow
      ? { left: Math.min(Math.max(16, hole.left), innerWidth - W - 16), top: below < innerHeight - 220 ? below : Math.max(16, hole.top - 220) }
      : { left, top: Math.min(Math.max(70, hole.top), innerHeight - 240) };
  }
  return (
    <div className="tour" aria-live="polite">
      {hole ? <div className="tour-hole" style={hole} /> : <div className="tour-dim" />}
      <div ref={card} className="tour-card frame" style={pos} role="dialog" aria-label="둘러보기">
        <div className="tour-step">
          {STEPS.map((_, i) => (
            <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />
          ))}
          <span>
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <h3>{cur.title}</h3>
        <p>{cur.body}</p>
        <div className="tour-actions">
          <button className="hbtn sm ghost" onClick={end}>
            건너뛰기
          </button>
          {step > 0 && (
            <button className="hbtn sm" onClick={() => hud.set({ tour: step - 1 })}>
              이전
            </button>
          )}
          <button className="hbtn sm on tour-next" onClick={next}>
            {step + 1 >= STEPS.length ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ count-up */

/** Animated number: eases from the previous value to the new one. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const reduce = useHud((s) => s.settings.reducedMotion);
  useEffect(() => {
    if (reduce) {
      from.current = value;
      return setShown(value);
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      const v = a + (value - a) * e;
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);
  return <>{format(shown)}</>;
}
