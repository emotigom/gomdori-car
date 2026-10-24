import type { PartRow } from '@gomdori/core';
import { garageQuery } from './controller.ts';
import { csv, download, save } from './persist.ts';
import { hud, useHud } from './store.ts';
import { toast } from './toast.tsx';
import { aud, n0, RIGHTS_KO, STATUS_KO } from '../ui/fmt.ts';

/**
 * Work order ("작업 지시서"): a parts list for one job on the garage vehicle.
 * Lines are warned when a part is on HOLD, out of stock or lacks a fitment
 * source — the same product-truth rules the content board uses.
 */
const GST = 0.1;

hud.subscribe(() => save('order', hud.get().order));

export function addToOrder(part: PartRow, qty = 1) {
  const s = hud.get();
  const i = s.order.findIndex((l) => l.part.id === part.id);
  const order = i >= 0 ? s.order.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l)) : [...s.order, { part, qty, addedAt: Date.now() }];
  hud.set({ order });
  toast(`작업 지시서에 추가 · ${part.name}`, part.status === 'hold' ? 'warn' : 'ok');
}

function setQty(id: string, qty: number) {
  hud.set((s) => ({ order: qty <= 0 ? s.order.filter((l) => l.part.id !== id) : s.order.map((l) => (l.part.id === id ? { ...l, qty } : l)) }));
}

export function lineWarnings(p: PartRow): string[] {
  const w: string[] = [];
  if (p.status === 'hold') w.push(`HOLD${p.holdReason ? ` · ${p.holdReason}` : ''}`);
  if (p.status === 'discontinued') w.push('단종');
  if (p.stock <= 0) w.push('재고 없음');
  if (p.fitmentCount === 0) w.push('적용 차량 근거 없음');
  return w;
}

function totals() {
  const sub = hud.get().order.reduce((a, l) => a + l.part.priceCents * l.qty, 0);
  return { sub, gst: Math.round(sub * GST), total: Math.round(sub * (1 + GST)) };
}

function exportCsv() {
  const q = garageQuery();
  const rows: (string | number | null)[][] = [['차량', `${q.make} ${q.model} ${q.year ?? ''}`.trim()], [], ['SKU', 'MPN', '부품명', '브랜드', '카테고리', '수량', '단가(AUD)', '금액(AUD)', '상태', '근거', '권리', '경고']];
  for (const l of hud.get().order)
    rows.push([l.part.sku, l.part.mpn, l.part.name, l.part.brand, l.part.category, l.qty, (l.part.priceCents / 100).toFixed(2), ((l.part.priceCents * l.qty) / 100).toFixed(2), STATUS_KO[l.part.status] ?? l.part.status, l.part.evidence, RIGHTS_KO[l.part.rights] ?? l.part.rights, lineWarnings(l.part).join(' / ')]);
  const t = totals();
  rows.push([], ['소계', '', '', '', '', '', '', (t.sub / 100).toFixed(2)], ['GST 10%', '', '', '', '', '', '', (t.gst / 100).toFixed(2)], ['합계', '', '', '', '', '', '', (t.total / 100).toFixed(2)]);
  download(`gomdori-work-order-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows));
  toast('작업 지시서를 CSV로 내보냈습니다', 'ok');
}

async function copyText() {
  const q = garageQuery();
  const t = totals();
  const lines = [`[곰도리 작업 지시서] ${q.make} ${q.model} ${q.year ?? ''}`.trim(), ...hud.get().order.map((l) => `- ${l.part.sku} ${l.part.name} ×${l.qty} = ${aud(l.part.priceCents * l.qty)}`), `합계 ${aud(t.total)} (GST 포함)`];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('지시서 내용을 복사했습니다', 'ok');
  } catch {
    toast('클립보드에 복사할 수 없습니다', 'bad');
  }
}

export function OrderButton() {
  const n = useHud((s) => s.order.reduce((a, l) => a + l.qty, 0));
  return (
    <button className={`res order-btn ${n ? 'has' : ''}`} onClick={() => hud.set((s) => ({ orderOpen: !s.orderOpen }))} title="작업 지시서 (O 대신 Shift+O)">
      <i className="res-gem" />
      <span className="res-v">{n}</span>
      <span className="res-k">작업 지시서</span>
    </button>
  );
}

export function OrderPanel() {
  const open = useHud((s) => s.orderOpen);
  const order = useHud((s) => s.order);
  const g = useHud((s) => s.garage);
  if (!open) return null;
  const t = totals();
  const warned = order.filter((l) => lineWarnings(l.part).length).length;
  return (
    <aside className="orderpanel frame" aria-label="작업 지시서">
      <div className="frame-title">
        <span>작업 지시서</span>
        <small>WORK ORDER</small>
        <span className="grow" />
        <button className="hbtn sm" onClick={() => hud.set({ orderOpen: false })}>
          닫기
        </button>
      </div>
      <div className="op-vehicle">
        {g.make} {g.model} {g.year ?? ''} · {order.length}개 품목{warned ? <b className="warn"> · 확인 필요 {warned}</b> : null}
      </div>
      <div className="op-lines">
        {!order.length && <p className="faint op-empty">부품 상세나 정보 패널의 + 버튼으로 담으세요.</p>}
        {order.map((l) => {
          const w = lineWarnings(l.part);
          return (
            <div key={l.part.id} className={`op-line ${w.length ? 'warned' : ''}`}>
              <button className="op-name" onClick={() => hud.set({ openPart: l.part })}>
                <span className="mono faint">{l.part.sku}</span>
                <span className="ell">{l.part.name}</span>
                {w.map((x) => (
                  <span key={x} className="op-warn">{x}</span>
                ))}
              </button>
              <div className="op-qty">
                <button aria-label="수량 줄이기" onClick={() => setQty(l.part.id, l.qty - 1)}>−</button>
                <span className="num">{l.qty}</span>
                <button aria-label="수량 늘리기" onClick={() => setQty(l.part.id, l.qty + 1)}>+</button>
              </div>
              <span className="num r">{aud(l.part.priceCents * l.qty)}</span>
            </div>
          );
        })}
      </div>
      <dl className="op-total">
        <dt>소계</dt>
        <dd className="num">{aud(t.sub)}</dd>
        <dt>GST 10%</dt>
        <dd className="num">{aud(t.gst)}</dd>
        <dt>합계</dt>
        <dd className="num big">{aud(t.total)}</dd>
      </dl>
      <div className="op-actions">
        <button className="hbtn sm" disabled={!order.length} onClick={exportCsv}>CSV 내보내기</button>
        <button className="hbtn sm" disabled={!order.length} onClick={() => void copyText()}>텍스트 복사</button>
        <button className="hbtn sm" disabled={!order.length} onClick={() => { hud.set({ order: [] }); toast('지시서를 비웠습니다'); }}>비우기</button>
      </div>
      <p className="faint op-note">품목 {n0.format(order.reduce((a, l) => a + l.qty, 0))}개 · 이 브라우저에 저장됩니다</p>
    </aside>
  );
}
