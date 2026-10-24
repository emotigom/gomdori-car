import { useEffect, useState } from 'react';
import { hud, useHud } from './store.ts';

const TIPS = [
  '차량에 마우스를 올리면 X-RAY 스캔이 차체를 앞에서부터 벗겨냅니다.',
  '단축키 E·C·B·I·F… 로 계통을 바로 선택할 수 있습니다. X는 X-RAY 고정.',
  'HOLD 부품은 규격·적용 조건 충돌이 풀릴 때까지 콘텐츠에 쓰지 않습니다.',
  '기기 탭에서 범위를 내려받으면 오프라인에서도 같은 화면이 동작합니다.',
  '자산 권리가 미확인인 부품의 제조사 이미지는 SNS에 재사용하지 않습니다.',
];

const MIN_MS = 2600;
const PHASE_KO: Record<string, string> = { reference: '· 참조 데이터', parts: '· 부품', index: '· 색인 구축', stats: '· 집계', done: '' };

/** Boot screen: wireframe vehicle drawing itself, staged progress, rotating tips. */
export function Loader() {
  const stages = useHud((s) => s.stages);
  const demo = useHud((s) => s.demo);
  const booted = useHud((s) => s.booted);
  const [t0] = useState(() => performance.now());
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const done = stages.filter((s) => s.done).length;
  const progress = done / stages.length;

  useEffect(() => {
    const id = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 3200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (done < stages.length || leaving) return;
    const wait = Math.max(0, MIN_MS - (performance.now() - t0));
    const a = setTimeout(() => {
      setLeaving(true);
      hud.set({ booted: true });
    }, wait);
    return () => clearTimeout(a);
  }, [done, stages.length, leaving, t0]);

  useEffect(() => {
    if (!leaving) return;
    const b = setTimeout(() => setGone(true), 1100);
    return () => clearTimeout(b);
  }, [leaving]);

  if (gone && booted) return null;
  const current = stages.find((s) => !s.done);

  return (
    <div className={`loader ${leaving ? 'out' : ''}`} role="status" aria-live="polite">
      <div className="loader-art" aria-hidden>
        <div className="loader-rings">
          <i />
          <i />
          <i />
        </div>
        <svg viewBox="-280 -120 560 200" className="loader-car">
          <path pathLength={1} d="M-250,40 L-245,0 L-200,-6 L-140,-8 L-70,-70 L60,-72 L120,-12 L230,-4 L250,20 L248,40 Z" />
          <path pathLength={1} d="M-62,-62 L-40,-12 L104,-12 L54,-64 Z M-10,-64 L-10,-12" />
          <circle pathLength={1} cx="-160" cy="40" r="34" />
          <circle pathLength={1} cx="160" cy="40" r="34" />
          <circle pathLength={1} cx="-160" cy="40" r="14" />
          <circle pathLength={1} cx="160" cy="40" r="14" />
          <path pathLength={1} d="M-200,52 L200,52 M-120,20 L120,20" className="thin" />
        </svg>
        <div className="loader-scan" />
      </div>
      <div className="loader-title">
        <small>DEMO PARTS STORE · PARTS COMMAND</small>
        <h1 className="loader-name">곰도리</h1>
        <p>호주 애프터마켓 부품 인텔리전스 · 차량 13계통 · 엣지 + 온디바이스</p>
      </div>
      <div className="loader-foot">
        <ul className="loader-stages">
          {stages.map((s) => (
            <li key={s.id} className={s.done ? 'done' : s === current ? 'now' : ''}>
              <i />
              {s.label}
            </li>
          ))}
        </ul>
        {demo && demo.phase !== 'done' && (
          <p className="loader-demo">
            API 서버 없이 실행 중 · 이 기기에서 데모 카탈로그 생성 {PHASE_KO[demo.phase] ?? demo.phase}{' '}
            <b className="num">
              {demo.done.toLocaleString()} / {demo.total.toLocaleString()}
            </b>
            <span className="loader-demo-bar">
              <i style={{ width: `${(demo.done / demo.total) * 100}%` }} />
            </span>
          </p>
        )}
        <div className="loader-bar" style={{ ['--p' as string]: progress }}>
          {stages.map((s) => (
            <span key={s.id} className={s.done ? 'on' : ''} />
          ))}
        </div>
        <p className="loader-tip" key={tip}>
          <b>팁</b> {TIPS[tip]}
        </p>
      </div>
    </div>
  );
}
