import { useEffect, useState } from 'react';
import type { CatalogueStats } from '@gomdori/core';
import { data } from '../data/index.ts';
import { Bars, Stack } from '../ui/Bars.tsx';
import { ago, compact, n0, pct } from '../ui/fmt.ts';

export function Overview() {
  const [s, setS] = useState<CatalogueStats | null>(null);
  const [by, setBy] = useState<'edge' | 'device'>('edge');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    data
      .run(null, (src) => src.stats())
      .then((r) => {
        setS(r.value);
        setBy(r.by);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  if (err) return <div className="banner">카탈로그 통계를 불러오지 못했습니다 ({err}). API 서버(`npm run dev:api`)가 실행 중인지 확인하세요.</div>;
  if (!s) return <div className="empty">카탈로그 통계를 불러오는 중…</div>;

  const hold = s.byStatus.hold ?? 0;
  const unknownRights = s.byRights.unknown ?? 0;
  const evidenceA = s.byEvidence.A ?? 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>카탈로그 개요</h1>
          <p>
            콘텐츠에 쓸 수 있는 부품은 전체의 <b>{pct(s.contentReady ?? 0, s.total)}</b>입니다. 판매중이면서 근거 A등급이고 자산 권리가 확인된 부품만
            Gate 0을 통과합니다. 나머지는 권리·근거 확인이 먼저입니다.
          </p>
        </div>
        <span className={`served ${by}`}>{by === 'device' ? '이 기기' : '엣지'} · 스냅샷 {ago(s.computedAt)}</span>
      </div>

      <div className="tiles">
        <div className="tile"><div className="k">전체 부품</div><div className="v">{compact.format(s.total)}</div><div className="s">{n0.format(s.total)} SKU</div></div>
        <div className="tile good"><div className="k">콘텐츠 준비 완료</div><div className="v">{compact.format(s.contentReady ?? 0)}</div><div className="s">판매중 · 근거 A · 권리 확인</div></div>
        <div className="tile warn"><div className="k">HOLD (제품 진실성)</div><div className="v">{compact.format(hold)}</div><div className="s">{pct(hold, s.total)} · 규격/적용 충돌</div></div>
        <div className="tile warn"><div className="k">자산 권리 미확인</div><div className="v">{pct(unknownRights, s.total)}</div><div className="s">{n0.format(unknownRights)}개 · SNS 재사용 불가</div></div>
        <div className="tile"><div className="k">근거 A 등급</div><div className="v">{pct(evidenceA, s.total)}</div><div className="s">제조사 원문 확인</div></div>
        <div className="tile"><div className="k">차량 적용(fitment)</div><div className="v">{compact.format(s.fitments)}</div><div className="s">차량 {n0.format(s.vehicles)}종</div></div>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>카테고리별 부품 수</h2>
          <p className="note">상위 14개 · 콘텐츠 질문 클러스터를 고를 때 재고 폭이 넓은 카테고리부터</p>
          <Bars rows={s.byCategory.slice(0, 14).map((c) => ({ label: c.name, value: c.count }))} format={(v) => compact.format(v)} />
        </section>
        <section className="card">
          <h2>근거 등급과 자산 권리</h2>
          <p className="note">근거 A/B/U/H 등급과 권리 상태를 부품 단위로 추적</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Stack
              parts={[
                { label: 'A 원문확인', value: s.byEvidence.A ?? 0, color: 'var(--teal)' },
                { label: 'B 보고값', value: s.byEvidence.B ?? 0, color: 'var(--muted-bar)' },
                { label: 'U 미확인', value: s.byEvidence.U ?? 0, color: 'var(--line-2)' },
                { label: 'H 가설', value: s.byEvidence.H ?? 0, color: 'var(--amber)' },
              ]}
            />
            <Stack
              parts={[
                { label: '자체 제작', value: s.byRights.own ?? 0, color: 'var(--teal)' },
                { label: '라이선스', value: s.byRights.licensed ?? 0, color: 'var(--muted-bar)' },
                { label: '미확인', value: s.byRights.unknown ?? 0, color: 'var(--amber)' },
              ]}
            />
            <Stack
              parts={[
                { label: '판매중', value: s.byStatus.active ?? 0, color: 'var(--teal)' },
                { label: '초안', value: s.byStatus.draft ?? 0, color: 'var(--muted-bar)' },
                { label: 'HOLD', value: s.byStatus.hold ?? 0, color: 'var(--amber)' },
                { label: '단종', value: s.byStatus.discontinued ?? 0, color: 'var(--red)' },
              ]}
            />
          </div>
        </section>
        <section className="card">
          <h2>브랜드별 부품 수</h2>
          <p className="note">상위 12개 브랜드</p>
          <Bars rows={s.byBrand.slice(0, 12).map((b) => ({ label: b.name, value: b.count }))} format={(v) => compact.format(v)} />
        </section>
      </div>
    </>
  );
}
