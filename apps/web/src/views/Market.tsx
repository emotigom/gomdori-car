import { useState } from 'react';
import { INSIGHTS_AS_OF, accountBenchmarks, channelPlan, competitorPatterns, formatBenchmarks, gates } from '@gomdori/core';
import { Bars } from '../ui/Bars.tsx';
import { n0 } from '../ui/fmt.ts';

const STATUS_PILL: Record<string, string> = { '우선 시험': 'good', 병행: 'good', 조건부: 'warn', 보류: 'mute', '승인 대기': 'warn', 미착수: 'mute' };

export function Market() {
  const models = ['전체', ...new Set(competitorPatterns.map((c) => c.model))];
  const [model, setModel] = useState('전체');
  const ig = accountBenchmarks.find((a) => a.platform === 'Instagram')!;
  const fb = accountBenchmarks.find((a) => a.platform === 'Facebook')!;
  const fmt = (p: 'Instagram' | 'Facebook') =>
    formatBenchmarks
      .filter((f) => f.platform === p && !f.excluded)
      .sort((a, b) => b.medianInteractions - a.medianInteractions)
      .map((f) => ({ label: f.format, value: f.medianInteractions }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>시장 인텔리전스</h1>
          <p>
            Instagram 게시물 반응 중앙값은 Facebook의 <b>{(ig.interactionsSepMedian / fb.interactionsSepMedian).toFixed(1)}배</b>입니다. 초기 시험은 IG 캐러셀·Reels와
            FB 설명 이미지로 시작하고, 판단 기준은 반응이 아니라 적격 문의와 상품 방문으로 둡니다.
          </p>
        </div>
        <span className="served">{INSIGHTS_AS_OF} · 가상 수치·가상 브랜드</span>
      </div>

      <div className="tiles">
        <div className="tile"><div className="k">IG 9월 반응 중앙값</div><div className="v">{ig.interactionsSepMedian}</div><div className="s">예시 {ig.accounts}개 프로필</div></div>
        <div className="tile"><div className="k">FB 9월 반응 중앙값</div><div className="v">{fb.interactionsSepMedian}</div><div className="s">예시 {fb.accounts}개 페이지</div></div>
        <div className="tile"><div className="k">분기 게시 수 중앙값</div><div className="v">{fb.postsQ3Median} / {ig.postsQ3Median}</div><div className="s">FB / IG · 예시 분기</div></div>
        <div className="tile warn"><div className="k">현재 결정</div><div className="v" style={{ fontSize: 18 }}>G0 준비</div><div className="s">시험 콘텐츠 2건 기획 중</div></div>
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Instagram · 형식별 반응 중앙값</h2>
          <p className="note">예시 데이터 · 플랫폼 안에서만 비교</p>
          <Bars rows={fmt('Instagram')} />
        </section>
        <section className="card">
          <h2>Facebook · 형식별 반응 중앙값</h2>
          <p className="note">Live는 표본이 적어 순위에서 제외 (예시)</p>
          <Bars rows={fmt('Facebook')} />
        </section>
      </div>

      <section className="card">
        <h2>경쟁 구조: 고객에게 요구하는 다음 행동</h2>
        <p className="note">운영 유형별 가상 예시입니다. 실제 브랜드·실적이 아닙니다.</p>
        <div className="chips" style={{ marginBottom: 12 }}>
          {models.map((m) => <button key={m} className="chip" aria-pressed={m === model} onClick={() => setModel(m)}>{m}</button>)}
        </div>
        <div className="scroll-x">
          <table className="t">
            <thead><tr><th>브랜드</th><th>지역</th><th>운영 유형</th><th>관찰 패턴</th><th>시사점</th><th style={{ textAlign: 'right' }}>조회수</th></tr></thead>
            <tbody>
              {competitorPatterns.filter((c) => model === '전체' || c.model === model).map((c, i) => (
                <tr key={c.brand + i}>
                  <td><b>{c.brand}</b></td><td>{c.region}</td><td className="muted">{c.model}</td><td>{c.pattern}</td><td>{c.takeaway}</td>
                  <td className="r">{c.views ? n0.format(c.views) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2">
        <section className="card">
          <h2>채널 계획 (시험 가설)</h2>
          <p className="note">질문 → 근거 → 상품/선택 경로를 먼저 시험합니다.</p>
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>#</th><th>채널</th><th>역할</th><th>판정 KPI</th><th>상태</th></tr></thead>
              <tbody>
                {channelPlan.map((c) => (
                  <tr key={c.channel}><td className="r">{c.order}</td><td><b>{c.channel}</b></td><td>{c.role}</td><td className="muted">{c.kpi}</td><td><span className={`pill ${STATUS_PILL[c.status]}`}>{c.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <h2>실행 게이트</h2>
          <p className="note">제작 승인과 게시 승인은 다릅니다. 광고비는 별도 승인.</p>
          <div className="scroll-x">
            <table className="t">
              <thead><tr><th>게이트</th><th>항목</th><th>Go / Hold 규칙</th><th>상태</th></tr></thead>
              <tbody>
                {gates.map((g) => (
                  <tr key={g.id}><td className="mono">{g.id}</td><td><b>{g.name}</b></td><td className="muted">{g.rule}</td><td><span className={`pill ${STATUS_PILL[g.status]}`}>{g.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
