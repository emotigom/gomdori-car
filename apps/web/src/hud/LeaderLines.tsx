import { useEffect, useRef } from 'react';
import { SYSTEMS } from '../three/systems.ts';
import { frame, hud, useHud } from './store.ts';
import { n0 } from '../ui/fmt.ts';

const LABEL_W = 214;
const LABEL_H = 48;

/**
 * Long leader lines from each system on the car to a part list card at the
 * screen edges. Positions are written straight to the DOM every frame from the
 * anchors the scene projects (no React render per frame).
 */
export function LeaderLines() {
  const view = useHud((s) => s.view);
  const coverage = useHud((s) => s.coverage);
  const samples = useHud((s) => s.samples);
  const hovered = useHud((s) => s.hovered);
  const selected = useHud((s) => s.selected);
  const svg = useRef<SVGSVGElement>(null);
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const paths = useRef<Record<string, SVGPathElement | null>>({});
  const dots = useRef<Record<string, SVGCircleElement | null>>({});

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = hud.get();
      const show = s.view === 'hangar' && (frame.xray > 0.55 || s.selected !== null);
      if (svg.current) svg.current.style.opacity = show ? '1' : '0';
      const W = frame.width;
      const H = frame.height;
      const top = 96;
      const bottom = H - 262;
      const leftX = Math.min(330, W * 0.26);
      const rightX = W - LABEL_W - 28;
      const items = SYSTEMS.map((d) => ({ d, a: frame.anchors[d.id] })).filter((x) => x.a);
      // balance the two columns: the left-most half of the anchors go to the left column
      const byX = [...items].sort((p, q) => p.a!.x - q.a!.x);
      const half = Math.ceil(byX.length / 2);
      const left = byX.slice(0, half).sort((p, q) => p.a!.y - q.a!.y);
      const right = byX.slice(half).sort((p, q) => p.a!.y - q.a!.y);
      const place = (col: typeof items, side: 'l' | 'r') => {
        const n = col.length;
        if (!n) return;
        const gap = Math.min(LABEL_H + 12, (bottom - top) / n);
        const block = gap * n;
        const mid = col.reduce((acc, x) => acc + x.a!.y, 0) / n;
        const y0 = Math.max(top, Math.min(bottom - block, mid - block / 2));
        col.forEach((x, i) => {
          const el = labels.current[x.d.id];
          const p = paths.current[x.d.id];
          const dot = dots.current[x.d.id];
          const ly = y0 + i * gap;
          const lx = side === 'l' ? leftX : rightX;
          if (el) {
            el.style.transform = `translate(${lx}px, ${ly}px)`;
            el.dataset.side = side;
            el.style.visibility = show ? 'visible' : 'hidden';
          }
          const cy = ly + 18;
          const edge = side === 'l' ? lx + LABEL_W : lx;
          const elbow = side === 'l' ? edge + 36 : edge - 36;
          const ax = x.a!.x;
          const ay = x.a!.y;
          if (p) p.setAttribute('d', `M${ax.toFixed(1)},${ay.toFixed(1)} L${elbow.toFixed(1)},${cy.toFixed(1)} L${edge.toFixed(1)},${cy.toFixed(1)}`);
          if (dot) {
            dot.setAttribute('cx', ax.toFixed(1));
            dot.setAttribute('cy', ay.toFixed(1));
          }
        });
      };
      place(left, 'l');
      place(right, 'r');
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (view !== 'hangar') return null;
  const focus = hovered ?? selected;

  return (
    <div className="leaders" aria-hidden={false}>
      <svg ref={svg} className="leaders-svg">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {SYSTEMS.map((d) => (
          <g key={d.id} className={`leader ${focus === d.id ? 'on' : focus ? 'dim' : ''}`} style={{ ['--c' as string]: d.color }}>
            <path ref={(el) => void (paths.current[d.id] = el)} filter="url(#glow)" />
            <circle ref={(el) => void (dots.current[d.id] = el)} r={3.5} />
          </g>
        ))}
      </svg>
      {SYSTEMS.map((d) => {
        const n = coverage?.[d.id];
        const list = samples[d.id] ?? [];
        return (
          <div
            key={d.id}
            ref={(el) => void (labels.current[d.id] = el)}
            className={`leader-card ${focus === d.id ? 'on' : focus ? 'dim' : ''}`}
            style={{ ['--c' as string]: d.color, width: LABEL_W }}
            onMouseEnter={() => hud.set({ hovered: d.id })}
            onMouseLeave={() => hud.set({ hovered: null })}
            onClick={() => hud.set({ selected: hud.get().selected === d.id ? null : d.id })}
            role="button"
            tabIndex={0}
          >
            <div className="lc-top">
              <span className="lc-code">{d.code}</span>
              <b>{d.ko}</b>
              <span className="lc-n">{n === undefined ? <i className="skel skel-num" /> : n0.format(n)}</span>
            </div>
            <div className="lc-list">
              {list.length ? list.slice(0, 2).map((p) => <span key={p.id}>{p.name}</span>) : coverage ? <span className="faint">적용 부품 없음</span> : <i className="skel skel-line" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
