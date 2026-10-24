import { useMemo, useState } from 'react';
import type { PartRow } from '@gomdori/core';
import { data } from '../data/index.ts';
import { HBarChart } from '../hud/charts.tsx';
import {
  canEnter,
  CHANNELS,
  CHECK_KO,
  CLUSTERS,
  evaluate,
  exportContentCsv,
  FORMATS,
  moveCard,
  newCard,
  STAGES,
  toLinked,
  updateCard,
  type ContentCard,
  type Metrics,
  type Stage,
} from '../hud/content.ts';
import { hud, useHud } from '../hud/store.ts';
import { toast } from '../hud/toast.tsx';
import { SYSTEM_BY_ID, SYSTEMS } from '../three/systems.ts';
import { compact, n0, RIGHTS_KO, STATUS_KO } from '../ui/fmt.ts';

const CH_COLOR: Record<string, string> = { Facebook: '#4a7dff', Instagram: '#ff5aa8', YouTube: '#ff4f4f', 'SEO/GEO': '#5dff8a', LinkedIn: '#4fd8ff', TikTok: '#e8f6ff' };

/** Content planning board: kanban by Stage gate + experiment KPIs. */
export function ContentBoard() {
  const cards = useHud((s) => s.content);
  const openId = useHud((s) => s.contentOpen);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const open = cards.find((c) => c.id === openId) ?? null;

  const kpi = useMemo(() => {
    const live = cards.filter((c) => c.stage === 'published' || c.stage === 'learned');
    const m = (c: ContentCard) => (c.metrics.d28.reach ? c.metrics.d28 : c.metrics.d7);
    const sum = (k: keyof Metrics) => live.reduce((a, c) => a + m(c)[k], 0);
    const byChannel = CHANNELS.map((ch) => {
      const cs = live.filter((c) => c.channel === ch);
      const hrs = cs.reduce((a, c) => a + m(c).hours, 0);
      const inq = cs.reduce((a, c) => a + m(c).inquiries, 0);
      return { label: ch, value: hrs ? inq / hrs : 0, color: CH_COLOR[ch] };
    }).filter((r) => r.value > 0);
    const blocked = cards.filter((c) => evaluate(c).blockers.length).length;
    return { live: live.length, reach: sum('reach'), inquiries: sum('inquiries'), visits: sum('visits'), hours: sum('hours'), byChannel, blocked };
  }, [cards]);

  return (
    <div className="content-view">
      <div className="sheet-head">
        <div>
          <h1>콘텐츠 기획</h1>
          <p className="faint">고객 질문 → 근거 → 자체 제작 → CTA 검수 → 학습. HOLD·권리 미확인 부품이 연결된 카드는 게시 승인(G2)으로 넘어갈 수 없습니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="hbtn sm" onClick={() => newCard()}>+ 새 카드</button>
          <button className="hbtn sm" onClick={exportContentCsv}>CSV 내보내기</button>
        </div>
      </div>

      <div className="tiles">
        <div className="tile"><div className="k">카드</div><div className="v">{cards.length}</div><div className="s">게시·학습 {kpi.live}</div></div>
        <div className={`tile ${kpi.blocked ? 'warn' : 'good'}`}><div className="k">차단된 카드</div><div className="v">{kpi.blocked}</div><div className="s">HOLD·단종·권리</div></div>
        <div className="tile"><div className="k">도달 (게시분)</div><div className="v">{compact.format(kpi.reach)}</div><div className="s">28일 우선, 없으면 7일</div></div>
        <div className="tile good"><div className="k">적격 문의</div><div className="v">{n0.format(kpi.inquiries)}</div><div className="s">상품 방문 {n0.format(kpi.visits)}</div></div>
        <div className="tile"><div className="k">투입 시간</div><div className="v">{n0.format(kpi.hours)}h</div><div className="s">시간당 문의 {kpi.hours ? (kpi.inquiries / kpi.hours).toFixed(2) : '—'}</div></div>
      </div>

      <div className="kanban">
        {STAGES.map((st) => {
          const col = cards.filter((c) => c.stage === st.id);
          const blockedDrop = dragId ? canEnter(cards.find((c) => c.id === dragId)!, st.id) : null;
          return (
            <section
              key={st.id}
              className={`kb-col ${over === st.id ? (blockedDrop ? 'deny' : 'over') : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(st.id);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id) moveCard(id, st.id);
                setOver(null);
                setDragId(null);
              }}
            >
              <header>
                <span className="kb-gate">{st.gate}</span>
                <b>{st.ko}</b>
                <span className="kb-n">{col.length}</span>
                <small>{st.note}</small>
              </header>
              <div className="kb-cards">
                {col.map((c) => {
                  const e = evaluate(c);
                  const sys = c.systemId ? SYSTEM_BY_ID[c.systemId] : null;
                  return (
                    <article
                      key={c.id}
                      className={`kb-card ${openId === c.id ? 'open' : ''} ${e.blockers.length ? 'blocked' : ''}`}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/plain', c.id);
                        setDragId(c.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => hud.set({ contentOpen: c.id })}
                      style={{ ['--c' as string]: sys?.color ?? 'var(--cyan)' }}
                    >
                      <div className="kc-top">
                        <span className="kc-ch" style={{ color: CH_COLOR[c.channel] }}>{c.channel}</span>
                        <span className="faint">{c.format}</span>
                        {sys && <span className="kc-sys">{sys.ko}</span>}
                      </div>
                      <h4>{c.title}</h4>
                      <div className="kc-foot">
                        <span className="faint">{c.cluster}</span>
                        <span className="grow" />
                        {e.blockers.length ? <span className="pill bad">차단 {e.blockers.length}</span> : <span className="pill good">통과</span>}
                        {e.warnings.length ? <span className="pill warn">경고 {e.warnings.length}</span> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="chart-grid">
        <div className="panel">
          <h3>채널별 시간당 적격 문의</h3>
          <p className="note">게시·학습 단계 카드의 입력 지표 기준. 원칙: 도달당 비용보다 적격 수요당 투입 시간을 봅니다.</p>
          {kpi.byChannel.length ? <HBarChart rows={kpi.byChannel} format={(v) => v.toFixed(2)} /> : <p className="faint">게시된 카드에 지표(문의 수·투입 시간)를 입력하면 여기에 비교가 나타납니다.</p>}
        </div>
      </div>

      {open && <CardEditor card={open} />}
    </div>
  );
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function CardEditor({ card }: { card: ContentCard }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PartRow[]>([]);
  const e = evaluate(card);
  const set = (patch: Partial<ContentCard>) => updateCard(card.id, patch);
  const setMetric = (w: 'd7' | 'd28', k: keyof Metrics, v: string) => set({ metrics: { ...card.metrics, [w]: { ...card.metrics[w], [k]: num(v) } } });
  const search = async () => {
    if (q.trim().length < 2) return;
    const r = await data.run(null, (s) => s.list({ q, limit: 8 }));
    setHits(r.value.items);
  };
  const idx = STAGES.findIndex((s) => s.id === card.stage);

  return (
    <>
      <div className="drawer-back" onClick={() => hud.set({ contentOpen: null })} />
      <aside className="drawer card-editor" role="dialog" aria-label="콘텐츠 카드">
        <div className="ce-head">
          <span className="kb-gate">{STAGES[idx]!.gate}</span>
          <b>{STAGES[idx]!.ko}</b>
          <span className="grow" />
          <button className="btn" disabled={idx === 0} onClick={() => moveCard(card.id, STAGES[idx - 1]!.id)}>← 이전 단계</button>
          <button className="btn primary" disabled={idx === STAGES.length - 1} onClick={() => moveCard(card.id, STAGES[idx + 1]!.id)}>다음 단계 →</button>
          <button className="btn" onClick={() => hud.set({ contentOpen: null })}>닫기</button>
        </div>
        <label className="field">
          <span className="lbl">고객 질문 (콘텐츠 제목)</span>
          <textarea id="ce-title" className="input" rows={2} value={card.title} onChange={(ev) => set({ title: ev.target.value })} />
        </label>
        <div className="row2">
          <label className="field"><span className="lbl">질문 클러스터</span>
            <select id="ce-cluster" className="select" value={card.cluster} onChange={(ev) => set({ cluster: ev.target.value as ContentCard['cluster'] })}>{CLUSTERS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span className="lbl">차량 계통</span>
            <select id="ce-sys" className="select" value={card.systemId ?? ''} onChange={(ev) => set({ systemId: ev.target.value || null })}><option value="">없음</option>{SYSTEMS.map((d) => <option key={d.id} value={d.id}>{d.ko}</option>)}</select></label>
          <label className="field"><span className="lbl">채널</span>
            <select id="ce-ch" className="select" value={card.channel} onChange={(ev) => set({ channel: ev.target.value as ContentCard['channel'] })}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span className="lbl">형식</span>
            <select id="ce-fmt" className="select" value={card.format} onChange={(ev) => set({ format: ev.target.value as ContentCard['format'] })}>{FORMATS.map((c) => <option key={c}>{c}</option>)}</select></label>
        </div>

        <section>
          <h3 className="ce-h">게이트 검수</h3>
          {e.blockers.map((b) => <div key={b} className="ce-flag bad">차단 · {b}</div>)}
          {e.warnings.slice(0, 6).map((w) => <div key={w} className="ce-flag warn">{w}</div>)}
          {!e.blockers.length && !e.warnings.length && <div className="ce-flag good">모든 검수 통과 — 게시 승인 요청 가능</div>}
          <div className="ce-checks">
            {(Object.keys(CHECK_KO) as (keyof ContentCard['checks'])[]).map((k) => (
              <label key={k}>
                <input type="checkbox" checked={card.checks[k]} onChange={(ev) => set({ checks: { ...card.checks, [k]: ev.target.checked } })} /> {CHECK_KO[k]}
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 className="ce-h">연결 부품 (CTA 도착지)</h3>
          {card.parts.map((p) => (
            <div key={p.id} className="ce-part">
              <span className="mono faint">{p.sku}</span>
              <span className="ell">{p.name}</span>
              <span className={`pill ${p.status}`}>{STATUS_KO[p.status]}</span>
              <span className={`pill ${p.evidence}`}>{p.evidence}</span>
              <span className={`pill ${p.rights}`}>{RIGHTS_KO[p.rights]}</span>
              <button className="row-add" title="연결 해제" onClick={() => set({ parts: card.parts.filter((x) => x.id !== p.id) })}>×</button>
            </div>
          ))}
          <div className="ce-search">
            <input id="ce-q" className="input" placeholder="부품 검색해서 연결 (품번·이름)" value={q} onChange={(ev) => setQ(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && void search()} />
            <button className="btn" onClick={() => void search()}>검색</button>
          </div>
          {hits.map((p) => (
            <button
              key={p.id}
              className="ce-hit"
              onClick={() => {
                if (card.parts.some((x) => x.id === p.id)) return;
                set({ parts: [...card.parts, toLinked(p)] });
                toast(`연결 · ${p.sku}`, p.status === 'hold' ? 'warn' : 'ok');
              }}
            >
              <span className="mono faint">{p.sku}</span> <span className="ell">{p.name}</span> <span className={`pill ${p.status}`}>{STATUS_KO[p.status]}</span>
            </button>
          ))}
        </section>

        <section>
          <h3 className="ce-h">실험 지표</h3>
          <table className="t ce-metrics">
            <thead><tr><th></th><th>도달</th><th>저장·공유</th><th>적격 문의</th><th>상품 방문</th><th>투입 시간</th></tr></thead>
            <tbody>
              {(['d7', 'd28'] as const).map((w) => (
                <tr key={w}>
                  <th>{w === 'd7' ? '7일' : '28일'}</th>
                  {(['reach', 'saves', 'inquiries', 'visits', 'hours'] as const).map((k) => (
                    <td key={k}><input id={`m-${w}-${k}`} className="input num" inputMode="numeric" value={card.metrics[w][k] || ''} placeholder="0" onChange={(ev) => setMetric(w, k, ev.target.value)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: 11.5 }}>같은 경과일·채널·목적끼리 비교하세요. 반응 수치를 적격 수요로 해석하지 않습니다.</p>
        </section>

        <label className="field">
          <span className="lbl">메모</span>
          <textarea id="ce-note" className="input" rows={3} value={card.note} onChange={(ev) => set({ note: ev.target.value })} />
        </label>
        <button
          className="btn"
          onClick={() => {
            hud.set((s) => ({ content: s.content.filter((c) => c.id !== card.id), contentOpen: null }));
            toast('카드를 삭제했습니다');
          }}
        >
          카드 삭제
        </button>
      </aside>
    </>
  );
}
