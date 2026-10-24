import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Brand, Category, EvidenceGrade, FitmentRow, PartQuery, PartRow, PartStatus, RightsStatus } from '@gomdori/core';
import { data } from '../data/index.ts';
import { hud } from '../hud/store.ts';
import { addToOrder } from '../hud/order.tsx';
import { csv, download } from '../hud/persist.ts';
import { toast } from '../hud/toast.tsx';
import { planContent } from '../hud/content.ts';
import { aud, EVIDENCE_KO, n0, RIGHTS_KO, STATUS_KO } from '../ui/fmt.ts';

const PAGE = 200;
const STATUSES: PartStatus[] = ['active', 'hold', 'draft', 'discontinued'];
const EVIDENCE: EvidenceGrade[] = ['A', 'B', 'U', 'H'];
const RIGHTS: RightsStatus[] = ['own', 'licensed', 'unknown'];

function toggle<T>(xs: T[] | undefined, x: T): T[] | undefined {
  const s = new Set(xs ?? []);
  if (s.has(x)) s.delete(x);
  else s.add(x);
  return s.size ? [...s] : undefined;
}

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function Explorer() {
  const [text, setText] = useState('');
  const [f, setF] = useState<PartQuery>(() => {
    const preset = hud.get().preset;
    if (preset) hud.set({ preset: null });
    return { sort: 'id', ...(preset ?? {}) };
  });
  const q = useDebounced(text, 180);
  const query = useMemo<PartQuery>(() => ({ ...f, q: q || undefined, limit: PAGE }), [f, q]);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);

  const [rows, setRows] = useState<PartRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ by: 'edge' | 'device'; ms: number; partial: boolean } | null>(null);
  const [count, setCount] = useState<{ count: number; capped: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<PartRow | null>(null);
  const gen = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void data.run(null, (s) => s.brands()).then((r) => setBrands(r.value));
    void data.run(null, (s) => s.categories()).then((r) => setCats(r.value));
    void data.run(null, (s) => s.makes()).then((r) => setMakes(r.value));
  }, []);

  useEffect(() => {
    if (!f.make) return setModels([]);
    void data.run(null, (s) => s.models(f.make!)).then((r) => setModels(r.value));
  }, [f.make]);

  // New query → first page + bounded count, in parallel.
  useEffect(() => {
    const my = ++gen.current;
    scroller.current?.scrollTo({ top: 0 });
    setLoading(true);
    setErr(null);
    const t0 = performance.now();
    data
      .run(query, (s) => s.list(query))
      .then((r) => {
        if (my !== gen.current) return;
        setRows(r.value.items);
        setCursor(r.value.nextCursor);
        setMeta({ by: r.by, ms: r.by === 'device' ? r.value.tookMs : Math.round(performance.now() - t0), partial: r.partial });
      })
      .catch((e: Error) => my === gen.current && setErr(e.message))
      .finally(() => my === gen.current && setLoading(false));
    setCount(null);
    data.run(query, (s) => s.count(query)).then((r) => my === gen.current && setCount(r.value)).catch(() => {});
  }, [query]);

  const loadMore = useCallback(() => {
    if (!cursor || loading) return;
    const my = gen.current;
    setLoading(true);
    data
      .run(query, (s) => s.list({ ...query, cursor }))
      .then((r) => {
        if (my !== gen.current) return;
        setRows((prev) => [...prev, ...r.value.items]);
        setCursor(r.value.nextCursor);
      })
      .finally(() => my === gen.current && setLoading(false));
  }, [cursor, loading, query]);

  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 40, overscan: 12 });
  const items = v.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? 0;
  useEffect(() => {
    if (lastIndex >= rows.length - 40) loadMore();
  }, [lastIndex, rows.length, loadMore]);

  const reset = () => {
    setText('');
    setF({ sort: 'id' });
  };

  const onSaved = (row: PartRow) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    setSel(row);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>부품 탐색</h1>
          <p>품번·이름·GTIN·브랜드로 찾고 차량 조건으로 좁힙니다. 결과는 커서로 이어 불러오므로 100만 건 중 어느 위치든 같은 속도로 열립니다.</p>
        </div>
      </div>
      <div className="explorer">
        <aside className="filters card" aria-label="필터">
          <div className="field">
            <label htmlFor="q">검색</label>
            <input id="q" className="input search" placeholder="예: CUK2939, brake pads, 9310…" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cat">카테고리</label>
            <select id="cat" className="select" value={(f.categoryId?.length ?? 0) > 1 ? 'multi' : (f.categoryId?.[0] ?? '')} onChange={(e) => e.target.value !== 'multi' && setF({ ...f, categoryId: e.target.value ? [Number(e.target.value)] : undefined })}>
              <option value="">전체</option>
              {(f.categoryId?.length ?? 0) > 1 && <option value="multi">격납고에서 고른 계통 ({f.categoryId!.length}개 카테고리)</option>}
              {cats.filter((c) => c.parentId !== null).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="brand">브랜드</label>
            <select id="brand" className="select" value={f.brandId?.[0] ?? ''} onChange={(e) => setF({ ...f, brandId: e.target.value ? [Number(e.target.value)] : undefined })}>
              <option value="">전체</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="lbl">차량 적용</span>
            <select aria-label="제조사" className="select" value={f.make ?? ''} onChange={(e) => setF({ ...f, make: e.target.value || undefined, model: undefined, year: undefined })}>
              <option value="">제조사 전체</option>
              {makes.map((m) => <option key={m}>{m}</option>)}
            </select>
            <div className="row2">
              <select aria-label="모델" className="select" disabled={!f.make} value={f.model ?? ''} onChange={(e) => setF({ ...f, model: e.target.value || undefined })}>
                <option value="">모델</option>
                {models.map((m) => <option key={m}>{m}</option>)}
              </select>
              <input aria-label="연식" className="input" inputMode="numeric" placeholder="연식" disabled={!f.make} value={f.year ?? ''}
                onChange={(e) => { const y = Number(e.target.value); setF({ ...f, year: y > 1900 && y < 2100 ? y : undefined }); }} />
            </div>
          </div>
          <div className="field">
            <span className="lbl">상태</span>
            <div className="chips">{STATUSES.map((s) => <button key={s} className="chip" aria-pressed={!!f.status?.includes(s)} onClick={() => setF({ ...f, status: toggle(f.status, s) })}>{STATUS_KO[s]}</button>)}</div>
          </div>
          <div className="field">
            <span className="lbl">근거 등급</span>
            <div className="chips">{EVIDENCE.map((s) => <button key={s} className="chip" aria-pressed={!!f.evidence?.includes(s)} onClick={() => setF({ ...f, evidence: toggle(f.evidence, s) })}>{s}</button>)}</div>
          </div>
          <div className="field">
            <span className="lbl">자산 권리</span>
            <div className="chips">{RIGHTS.map((s) => <button key={s} className="chip" aria-pressed={!!f.rights?.includes(s)} onClick={() => setF({ ...f, rights: toggle(f.rights, s) })}>{RIGHTS_KO[s]}</button>)}</div>
          </div>
          <div className="field">
            <label htmlFor="sort">정렬</label>
            <select id="sort" className="select" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as PartQuery['sort'] })}>
              <option value="id">등록순</option>
              <option value="updated_desc">최근 수정</option>
              <option value="price_asc">가격 낮은순</option>
              <option value="price_desc">가격 높은순</option>
            </select>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={!!f.inStock} onChange={(e) => setF({ ...f, inStock: e.target.checked || undefined })} /> 재고 있는 부품만
          </label>
          <button className="btn" onClick={reset}>필터 초기화</button>
        </aside>

        <section className="card table-card">
          <div className="result-head">
            <span className="num"><b>{count ? `${n0.format(count.count)}${count.capped ? '+' : ''}` : '…'}</b> 건</span>
            <span className="faint num">{n0.format(rows.length)}건 표시</span>
            <span className="grow" />
            <button
              className="btn"
              disabled={!rows.length}
              onClick={() => {
                const head = ['SKU', 'MPN', 'GTIN', '부품명', '브랜드', '카테고리', '상태', 'HOLD 사유', '근거', '권리', '가격(AUD)', '재고', '적용 차량 수'];
                download(
                  `gomdori-parts-${new Date().toISOString().slice(0, 10)}.csv`,
                  csv([head, ...rows.map((r) => [r.sku, r.mpn, r.gtin, r.name, r.brand, r.category, STATUS_KO[r.status], r.holdReason, r.evidence, RIGHTS_KO[r.rights], (r.priceCents / 100).toFixed(2), r.stock, r.fitmentCount])]),
                );
                toast(`표시된 ${rows.length.toLocaleString()}행을 CSV로 내보냈습니다`, 'ok');
              }}
            >
              CSV
            </button>
            {meta && (
              <span className={`served ${meta.by}`}>
                {meta.by === 'device' ? '이 기기' : '엣지'} · {meta.ms}ms{meta.partial ? ' · 오프라인(일부)' : ''}
              </span>
            )}
          </div>
          {err && <div className="banner">불러오지 못했습니다: {err}</div>}
          <div className="vt" ref={scroller}>
            <div className="vt-head">
              <span>SKU</span><span>부품명</span><span>브랜드</span><span>카테고리</span><span>상태</span><span>근거</span><span>권리</span><span className="r">가격</span><span className="r">재고</span>
            </div>
            <div style={{ height: v.getTotalSize(), position: 'relative' }}>
              {items.map((it) => {
                const r = rows[it.index]!;
                return (
                  <div key={r.id} className={`vt-row${sel?.id === r.id ? ' sel' : ''}`} style={{ transform: `translateY(${it.start}px)` }}
                    onClick={() => setSel(r)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(r)}>
                    <span className="mono">{r.sku}</span>
                    <span>{r.name}</span>
                    <span>{r.brand}</span>
                    <span className="muted">{r.category}</span>
                    <span><span className={`pill ${r.status}`}>{STATUS_KO[r.status]}</span></span>
                    <span><span className={`pill ${r.evidence}`}>{r.evidence}</span></span>
                    <span><span className={`pill ${r.rights}`}>{RIGHTS_KO[r.rights]}</span></span>
                    <span className="r mono">{aud(r.priceCents)}</span>
                    <span className="r mono">{r.stock}</span>
                  </div>
                );
              })}
            </div>
            {!loading && !rows.length && !err && <div className="empty">조건에 맞는 부품이 없습니다. 필터를 줄여 보세요.</div>}
          </div>
        </section>
      </div>
      {sel && <PartDrawer part={sel} query={query} onClose={() => setSel(null)} onSaved={onSaved} />}
    </>
  );
}

export function PartDrawer({ part, query, onClose, onSaved }: { part: PartRow; query: PartQuery; onClose: () => void; onSaved: (r: PartRow) => void }) {
  const [fit, setFit] = useState<FitmentRow[] | null>(null);
  const [status, setStatus] = useState(part.status);
  const [reason, setReason] = useState(part.holdReason ?? '');
  const [rights, setRights] = useState(part.rights);
  const [evidence, setEvidence] = useState(part.evidence);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setFit(null);
    void data.run(query, (s) => s.fitments(part.id)).then((r) => setFit(r.value)).catch(() => setFit([]));
    setStatus(part.status);
    setReason(part.holdReason ?? '');
    setRights(part.rights);
    setEvidence(part.evidence);
    setMsg(null);
  }, [part.id]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const dirty = status !== part.status || reason !== (part.holdReason ?? '') || rights !== part.rights || evidence !== part.evidence;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const { row, by } = await data.update(part.id, { status, holdReason: status === 'hold' ? reason || null : null, rights, evidence }, query);
      if (row) onSaved(row);
      setMsg(by === 'device' ? '이 기기에 저장했습니다. 온라인이 되면 자동으로 동기화됩니다.' : '저장했습니다.');
    } catch (e) {
      setMsg(`저장하지 못했습니다: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={part.name}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="mono faint">{part.sku} · {part.id}</div>
            <h2>{part.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'start' }}>
            <button className="btn primary" onClick={() => addToOrder(part)}>+ 작업 지시서</button>
            <button className="btn" onClick={() => planContent(part)}>콘텐츠 기획</button>
            <button className="btn" onClick={onClose} aria-label="닫기">닫기</button>
          </div>
        </div>
        {part.status === 'hold' && part.holdReason && <div className="hold-box"><b>HOLD</b> · {part.holdReason}</div>}
        <dl className="kv">
          <dt>제조사 품번(MPN)</dt><dd className="mono">{part.mpn}</dd>
          <dt>GTIN</dt><dd className="mono">{part.gtin ?? '—'}</dd>
          <dt>브랜드 / 카테고리</dt><dd>{part.brand} · {part.category}</dd>
          <dt>가격 / 재고</dt><dd className="num">{aud(part.priceCents)} AUD · {part.stock}개</dd>
          <dt>근거 / 권리</dt><dd>{EVIDENCE_KO[part.evidence]} · {RIGHTS_KO[part.rights]}</dd>
          <dt>마지막 변경</dt><dd className="mono faint">{part.hlc}</dd>
        </dl>

        <section className="card" style={{ padding: 14 }}>
          <h2 style={{ fontSize: 14 }}>게시 검수</h2>
          <p className="note">상태·근거·권리를 바꾸면 이 기기에 먼저 저장되고, 다른 기기와는 최신 변경 우선(HLC)으로 합쳐집니다.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="row2">
              <div className="field"><label htmlFor="st">상태</label>
                <select id="st" className="select" value={status} onChange={(e) => setStatus(e.target.value as PartStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_KO[s]}</option>)}</select></div>
              <div className="field"><label htmlFor="ev">근거</label>
                <select id="ev" className="select" value={evidence} onChange={(e) => setEvidence(e.target.value as EvidenceGrade)}>{EVIDENCE.map((s) => <option key={s} value={s}>{EVIDENCE_KO[s]}</option>)}</select></div>
            </div>
            <div className="field"><label htmlFor="rt">자산 권리</label>
              <select id="rt" className="select" value={rights} onChange={(e) => setRights(e.target.value as RightsStatus)}>{RIGHTS.map((s) => <option key={s} value={s}>{RIGHTS_KO[s]}</option>)}</select></div>
            {status === 'hold' && (
              <div className="field"><label htmlFor="hr">HOLD 사유</label>
                <input id="hr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: LHD/RHD 적용 조건 미확인" /></div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? '저장 중…' : '저장'}</button>
              {msg && <span className="muted" style={{ fontSize: 12.5 }}>{msg}</span>}
            </div>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14, marginBottom: 8 }}>차량 적용 {fit ? `(${fit.length})` : ''}</h2>
          {!fit ? <div className="faint">불러오는 중…</div> : !fit.length ? <div className="faint">등록된 적용 차량이 없습니다. 적용 근거 없이 호환성을 주장하지 마세요.</div> : (
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>제조사·모델</th><th>연식</th><th>엔진</th><th>핸들</th><th>위치</th><th>근거</th></tr></thead>
                <tbody>
                  {fit.map((x) => (
                    <tr key={`${x.vehicleId}-${x.position}`}>
                      <td>{x.vehicle.make} {x.vehicle.model}</td>
                      <td className="num">{x.vehicle.yearFrom}–{x.vehicle.yearTo}</td>
                      <td>{x.vehicle.engine}</td>
                      <td><span className={`pill ${x.vehicle.driveSide === 'LHD' ? 'warn' : 'mute'}`}>{x.vehicle.driveSide}</span></td>
                      <td>{x.position || '—'}</td>
                      <td>{x.sourceUrl ? <span className="pill good">원문</span> : <span className="pill warn">없음</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </aside>
    </>
  );
}
