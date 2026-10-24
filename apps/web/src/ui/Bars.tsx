import { n0 } from './fmt.ts';

export function Bars({ rows, accentFirst = true, format = (v: number) => n0.format(v) }: {
  rows: { label: string; value: number; note?: string }[];
  accentFirst?: boolean;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars" role="list">
      {rows.map((r, i) => (
        <div className="bar-row" role="listitem" key={r.label + i} title={r.note}>
          <span className="lab">{r.label}</span>
          <span className="track"><span className={`fill${accentFirst && i === 0 ? ' accent' : ''}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="val">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Stack({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <div>
      <div className="stack" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts.map((p) => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label}><i style={{ background: p.color }} />{p.label} <span className="num">{((p.value / total) * 100).toFixed(1)}%</span></span>
        ))}
      </div>
    </div>
  );
}
