import { useEffect, useState } from 'react';
import { data } from '../data/index.ts';
import { accountBenchmarks, formatBenchmarks } from '@gomdori/core';
import { Columns, Donut, Gauge, HBarChart, Radar } from '../hud/charts.tsx';
import { systemOfCategory } from '../hud/controller.ts';
import { hud, useHud } from '../hud/store.ts';
import { SYSTEM_BY_ID, SYSTEMS } from '../three/systems.ts';
import { compact, n0, pct } from '../ui/fmt.ts';

const TABS = [
  { id: 'catalogue', ko: '카탈로그 전력', en: 'CATALOGUE' },
  { id: 'vehicle', ko: '내 차 적용', en: 'VEHICLE' },
  { id: 'gates', ko: '품질 게이트', en: 'QUALITY' },
  { id: 'market', ko: '시장 신호', en: 'MARKET' },
] as const;

/** Post-game score screen: every catalogue number as a chart, one tab per question. */
export function Analysis() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('catalogue');
  const stats = useHud((s) => s.stats);
  const coverage = useHud((s) => s.coverage);
  const g = useHud((s) => s.garage);
  const [cmp, setCmp] = useState<Record<string, number> | null>(null);

  return (
    <section className="sheet frame" aria-label="분석">
      <div className="sheet-head">
        <div>
          <h1>분석</h1>
          <p className="faint">
            {stats ? `${n0.format(stats.total)}개 부품 · 스냅샷 ${new Date(stats.computedAt).toLocaleString('ko-KR')}` : '집계를 불러오는 중…'}
          </p>
        </div>
        <div className="subtabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="subtab" onClick={() => setTab(t.id)}>
              {t.ko}
              <small>{t.en}</small>
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <div className="chart-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="panel">
              <i className="skel skel-title" />
              <i className="skel skel-block" />
            </div>
          ))}
        </div>
      ) : tab === 'catalogue' ? (
        <div className="chart-grid" key="catalogue">
          <div className="panel span2">
            <h3>카테고리별 부품 수</h3>
            <p className="note">색은 차량 계통. 막대에 커서를 올리면 상위 그룹이 보입니다.</p>
            <HBarChart
              rows={stats.byCategory.slice(0, 22).map((c) => {
                const sys = systemOfCategory(c.id);
                return { label: c.name, value: c.count, color: sys ? SYSTEM_BY_ID[sys]!.color : undefined, sub: sys ? SYSTEM_BY_ID[sys]!.ko : '' };
              })}
            />
          </div>
          <div className="panel">
            <h3>브랜드 상위 15</h3>
            <p className="note">롱테일 분포 · 상위 3개가 {pct(stats.byBrand.slice(0, 3).reduce((a, b) => a + b.count, 0), stats.total)}</p>
            <HBarChart rows={stats.byBrand.slice(0, 15).map((b, i) => ({ label: b.name, value: b.count, color: i < 3 ? 'var(--cyan)' : 'var(--steel)' }))} />
          </div>
          <div className="panel">
            <h3>계통별 카탈로그 규모</h3>
            <p className="note">13개 계통 합계</p>
            <HBarChart
              rows={SYSTEMS.map((d) => ({
                label: d.ko,
                color: d.color,
                value: stats.byCategory.filter((c) => systemOfCategory(c.id) === d.id).reduce((a, c) => a + c.count, 0),
              })).sort((a, b) => b.value - a.value)}
            />
          </div>
        </div>
      ) : tab === 'vehicle' ? (
        <div className="chart-grid" key="vehicle">
          <div className="panel">
            <h3>
              {g.make} {g.model} {g.year ?? ''} · 계통 레이더
            </h3>
            <p className="note">계통별 적용 부품 수 (가장 많은 계통 = 바깥 링)</p>
            {coverage ? <Radar axes={SYSTEMS.map((d) => ({ label: d.ko, value: coverage[d.id] ?? 0, color: d.color }))} compare={cmp ? SYSTEMS.map((d) => cmp[d.id] ?? 0) : undefined} /> : <i className="skel skel-block" />}
            <ComparePicker onCoverage={setCmp} />
          </div>
          {cmp && coverage && (
            <div className="panel span3">
              <h3>두 차량 계통별 차이</h3>
              <p className="note">내 차 − 비교 차량 · 양수면 내 차에 맞는 부품이 더 많음</p>
              <div className="diff-grid">
                {SYSTEMS.map((d) => {
                  const a = coverage[d.id] ?? 0;
                  const b = cmp[d.id] ?? 0;
                  const max = Math.max(1, ...SYSTEMS.map((x) => Math.abs((coverage[x.id] ?? 0) - (cmp[x.id] ?? 0))));
                  const diff = a - b;
                  return (
                    <div key={d.id} className="diff-row" style={{ ['--c' as string]: d.color }}>
                      <span>{d.ko}</span>
                      <span className="diff-track">
                        <i className={diff >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(diff) / max) * 50}%` }} />
                      </span>
                      <span className="num r">{diff > 0 ? '+' : ''}{n0.format(diff)}</span>
                      <span className="num r faint">{n0.format(a)} / {n0.format(b)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="panel">
            <h3>계통별 적용 부품</h3>
            <p className="note">클릭하면 격납고에서 해당 계통을 엽니다</p>
            {coverage ? (
              <div className="clickrows">
                <HBarChart rows={SYSTEMS.map((d) => ({ label: d.ko, value: coverage[d.id] ?? 0, color: d.color })).sort((a, b) => b.value - a.value)} format={(v) => n0.format(Math.round(v))} />
                <div className="chips" style={{ marginTop: 12 }}>
                  {SYSTEMS.map((d) => (
                    <button key={d.id} className="chip" onClick={() => hud.set({ view: 'hangar', selected: d.id })}>
                      {d.ko}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <i className="skel skel-block" />
            )}
          </div>
        </div>
      ) : tab === 'gates' ? (
        <div className="chart-grid" key="gates">
          <div className="panel">
            <h3>Gate 0 통과율</h3>
            <p className="note">판매중 · 근거 A · 권리 확인된 부품의 비율</p>
            <Gauge value={(stats.contentReady ?? 0) / stats.total} label="콘텐츠 준비" sub={`${n0.format(stats.contentReady ?? 0)} / ${n0.format(stats.total)}`} />
          </div>
          <div className="panel donuts span2">
            <Donut
              label="근거 등급"
              parts={[
                { label: 'A 원문확인', value: stats.byEvidence.A ?? 0, color: 'var(--green)' },
                { label: 'B 보고값', value: stats.byEvidence.B ?? 0, color: 'var(--cyan)' },
                { label: 'U 미확인', value: stats.byEvidence.U ?? 0, color: 'var(--steel)' },
                { label: 'H 가설', value: stats.byEvidence.H ?? 0, color: 'var(--amber)' },
              ]}
            />
            <Donut
              label="자산 권리"
              parts={[
                { label: '미확인', value: stats.byRights.unknown ?? 0, color: 'var(--amber)' },
                { label: '라이선스', value: stats.byRights.licensed ?? 0, color: 'var(--cyan)' },
                { label: '자체 제작', value: stats.byRights.own ?? 0, color: 'var(--green)' },
              ]}
            />
            <Donut
              label="판매 상태"
              parts={[
                { label: '판매중', value: stats.byStatus.active ?? 0, color: 'var(--green)' },
                { label: '초안', value: stats.byStatus.draft ?? 0, color: 'var(--steel)' },
                { label: 'HOLD', value: stats.byStatus.hold ?? 0, color: 'var(--amber)' },
                { label: '단종', value: stats.byStatus.discontinued ?? 0, color: 'var(--red)' },
              ]}
            />
          </div>
          <div className="panel span3">
            <h3>게이트를 막는 요인</h3>
            <p className="note">한 부품이 여러 요인에 걸릴 수 있습니다</p>
            <HBarChart
              rows={[
                { label: '자산 권리 미확인', value: stats.byRights.unknown ?? 0, color: 'var(--amber)' },
                { label: '근거 A 미달', value: stats.total - (stats.byEvidence.A ?? 0), color: 'var(--steel)' },
                { label: '판매중 아님', value: stats.total - (stats.byStatus.active ?? 0), color: 'var(--steel)' },
                { label: 'HOLD (제품 진실성)', value: stats.byStatus.hold ?? 0, color: 'var(--red)' },
              ]}
            />
          </div>
        </div>
      ) : (
        <div className="chart-grid" key="market">
          <div className="panel span2">
            <h3>형식별 게시물 반응 중앙값</h3>
            <p className="note">예시 데이터(가상) · 플랫폼 안에서만 비교 · FB Live 제외</p>
            <Columns
              height={230}
              groups={['Reels', 'Carousel', 'Image', 'Photo', 'Link'].map((fmt) => ({
                label: fmt,
                bars: formatBenchmarks
                  .filter((b) => b.format === fmt && !b.excluded)
                  .map((b) => ({ label: b.platform, value: b.medianInteractions, color: b.platform === 'Instagram' ? 'var(--cyan)' : 'var(--steel)' })),
              })).filter((g2) => g2.bars.length)}
            />
            <div className="legend-row">
              <span><i style={{ background: 'var(--cyan)' }} /> Instagram</span>
              <span><i style={{ background: 'var(--steel)' }} /> Facebook</span>
            </div>
          </div>
          <div className="panel">
            <h3>플랫폼 벤치마크</h3>
            <p className="note">계정 수 · 분기 게시 중앙값 · 9월 반응 중앙값</p>
            <HBarChart
              format={(v) => (Number.isInteger(v) ? n0.format(v) : v.toFixed(1))}
              rows={accountBenchmarks.flatMap((a) => [
                { label: `${a.platform} 9월 반응`, value: a.interactionsSepMedian, color: a.platform === 'Instagram' ? 'var(--cyan)' : 'var(--steel)' },
                { label: `${a.platform} 분기 게시`, value: a.postsQ3Median, color: a.platform === 'Instagram' ? 'var(--cyan)' : 'var(--steel)' },
              ])}
            />
            <p className="note" style={{ marginTop: 10 }}>
              IG 반응 중앙값은 FB의 {(accountBenchmarks[1].interactionsSepMedian / accountBenchmarks[0].interactionsSepMedian).toFixed(1)}배. 판단 기준은 반응이 아니라 적격 문의입니다.
            </p>
          </div>
        </div>
      )}
      <p className="sheet-foot faint">합성 카탈로그 기준 · 수치는 {compact.format(stats?.total ?? 0)} 부품 스냅샷</p>
    </section>
  );
}

/** Second vehicle for the radar overlay: same coverage query, aggregated per system. */
function ComparePicker({ onCoverage }: { onCoverage: (c: Record<string, number> | null) => void }) {
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void data.run(null, (s) => s.makes()).then((r) => setMakes(r.value)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!make) return setModels([]);
    void data.run(null, (s) => s.models(make)).then((r) => setModels(r.value)).catch(() => {});
  }, [make]);
  useEffect(() => {
    if (!make || !model) return onCoverage(null);
    setBusy(true);
    const q = { make, model };
    void data
      .run(q, (s) => s.coverage(q))
      .then((r) => {
        const cov: Record<string, number> = {};
        for (const row of r.value) {
          const sys = systemOfCategory(row.categoryId);
          if (sys) cov[sys] = (cov[sys] ?? 0) + row.count;
        }
        onCoverage(cov);
      })
      .finally(() => setBusy(false));
  }, [make, model]);
  return (
    <div className="compare">
      <span className="lbl">비교 차량</span>
      <select aria-label="비교 제조사" className="select" value={make} onChange={(e) => { setMake(e.target.value); setModel(''); }}>
        <option value="">선택</option>
        {makes.map((m) => <option key={m}>{m}</option>)}
      </select>
      <select aria-label="비교 모델" className="select" value={model} disabled={!make} onChange={(e) => setModel(e.target.value)}>
        <option value="">모델</option>
        {models.map((m) => <option key={m}>{m}</option>)}
      </select>
      {busy ? <span className="faint">불러오는 중…</span> : model ? <span className="legend-row"><span><i style={{ background: 'var(--amber)' }} /> 비교</span><span><i style={{ background: 'var(--cyan)' }} /> 내 차</span></span> : null}
    </div>
  );
}
