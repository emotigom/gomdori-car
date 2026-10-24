import { useEffect, useState } from 'react';
import { compact, n0 } from '../ui/fmt.ts';

/** Animate 0 → 1 once after mount, so every chart "powers up" when its screen opens. */
function useGrow(delay = 0) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setK(1);
    const t = setTimeout(() => setK(1), 60 + delay);
    return () => clearTimeout(t);
  }, [delay]);
  return k;
}

export function HBarChart({ rows, format = (v) => compact.format(v), max: maxIn }: { rows: { label: string; value: number; color?: string; sub?: string }[]; format?: (v: number) => string; max?: number }) {
  const k = useGrow();
  const max = maxIn ?? Math.max(1, ...rows.map((r) => r.value));
  const ticks = [0.25, 0.5, 0.75, 1];
  return (
    <div className="hbar">
      <div className="hbar-grid" aria-hidden>
        {ticks.map((t) => (
          <span key={t} style={{ left: `${t * 100}%` }}>
            <em>{format(max * t)}</em>
          </span>
        ))}
      </div>
      {rows.map((r, i) => (
        <div className="hbar-row" key={r.label + i} style={{ ['--c' as string]: r.color ?? 'var(--cyan)' }}>
          <span className="hbar-l" title={r.sub}>{r.label}</span>
          <span className="hbar-t">
            <span className="hbar-f" style={{ width: `${(r.value / max) * 100 * k}%`, transitionDelay: `${i * 18}ms` }} />
          </span>
          <span className="hbar-v num">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ parts, label, size = 168 }: { parts: { label: string; value: number; color: string }[]; label: string; size?: number }) {
  const k = useGrow(120);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const r = size / 2 - 14;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <figure className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${parts.map((p) => `${p.label} ${((p.value / total) * 100).toFixed(1)}%`).join(', ')}`}>
        <circle cx={size / 2} cy={size / 2} r={r + 9} className="donut-ring" />
        <circle cx={size / 2} cy={size / 2} r={r} className="donut-track" />
        {parts.map((p) => {
          const len = (p.value / total) * C * k;
          const off = -acc * k;
          acc += (p.value / total) * C;
          return (
            <circle
              key={p.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth={14}
              strokeDasharray={`${Math.max(0, len - 2)} ${C}`}
              strokeDashoffset={off}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              className="donut-seg"
            />
          );
        })}
        <text x="50%" y="47%" textAnchor="middle" className="donut-big">
          {((parts[0]!.value / total) * 100).toFixed(1)}%
        </text>
        <text x="50%" y="60%" textAnchor="middle" className="donut-small">
          {parts[0]!.label}
        </text>
      </svg>
      <figcaption>
        <b>{label}</b>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label} <em className="num">{n0.format(p.value)}</em>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Radar: one axis per vehicle system, value normalised to the largest. */
export function Radar({ axes, compare, size = 340 }: { axes: { label: string; value: number; color: string }[]; compare?: number[]; size?: number }) {
  const k = useGrow(80);
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 52;
  const max = Math.max(1, ...axes.map((a) => a.value), ...(compare ?? []));
  const pt = (i: number, f: number) => {
    const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2;
    return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f] as const;
  };
  const poly = axes.map((a, i) => pt(i, (a.value / max) * k).join(',')).join(' ');
  return (
    <svg className="radar" viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={axes.map((a) => `${a.label} ${a.value}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={axes.map((_, i) => pt(i, f).join(',')).join(' ')} className="radar-web" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1);
        const [lx, ly] = pt(i, 1.2);
        return (
          <g key={a.label}>
            <line x1={cx} y1={cy} x2={x} y2={y} className="radar-axis" />
            <text x={lx} y={ly} textAnchor={lx < cx - 4 ? 'end' : lx > cx + 4 ? 'start' : 'middle'} dominantBaseline="middle" className="radar-label" fill={a.color}>
              {a.label}
            </text>
          </g>
        );
      })}
      {compare && <polygon points={compare.map((v, i) => pt(i, (v / max) * k).join(',')).join(' ')} className="radar-fill compare" />}
      <polygon points={poly} className="radar-fill" />
      {axes.map((a, i) => {
        const [x, y] = pt(i, (a.value / max) * k);
        return <circle key={a.label} cx={x} cy={y} r={3.5} fill={a.color} className="radar-dot" />;
      })}
    </svg>
  );
}

export function Columns({ groups, height = 200 }: { groups: { label: string; bars: { label: string; value: number; color: string }[] }[]; height?: number }) {
  const k = useGrow(60);
  const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.value)));
  return (
    <div className="cols" style={{ height }}>
      {groups.map((g) => (
        <div key={g.label} className="cols-g">
          <div className="cols-bars">
            {g.bars.map((b) => (
              <div key={b.label} className="cols-bar" title={`${g.label} ${b.label}: ${b.value}`}>
                <em className="num" style={{ bottom: `calc(${(b.value / max) * 100 * k}% + 4px)` }}>{b.value}</em>
                <span style={{ height: `${(b.value / max) * 100 * k}%`, background: b.color }} />
              </div>
            ))}
          </div>
          <b>{g.label}</b>
        </div>
      ))}
    </div>
  );
}

export function Gauge({ value, label, sub }: { value: number; label: string; sub: string }) {
  const k = useGrow(200);
  const a0 = Math.PI * 0.8;
  const sweep = Math.PI * 1.4;
  const r = 70;
  const arc = (f: number) => {
    const a = a0 + sweep * f;
    return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r];
  };
  const [sx, sy] = arc(0);
  const [ex, ey] = arc(1);
  const [vx, vy] = arc(Math.min(1, value * k));
  const large = sweep * value * k > Math.PI ? 1 : 0;
  return (
    <figure className="gauge">
      <svg viewBox="0 0 200 170" width="100%" style={{ maxWidth: 240 }}>
        <path d={`M${sx},${sy} A${r},${r} 0 1 1 ${ex},${ey}`} className="gauge-track" />
        <path d={`M${sx},${sy} A${r},${r} 0 ${large} 1 ${vx},${vy}`} className="gauge-val" />
        <text x="100" y="104" textAnchor="middle" className="gauge-big">
          {(value * 100).toFixed(1)}%
        </text>
        <text x="100" y="126" textAnchor="middle" className="gauge-small">
          {label}
        </text>
      </svg>
      <figcaption className="faint">{sub}</figcaption>
    </figure>
  );
}
