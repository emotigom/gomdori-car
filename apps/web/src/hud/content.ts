import type { PartRow } from '@gomdori/core';
import { ulid } from '@gomdori/core';
import { SYSTEMS } from '../three/systems.ts';
import { garageQuery, systemOfCategory } from './controller.ts';
import { csv, download, load, save } from './persist.ts';
import { hud } from './store.ts';
import { toast } from './toast.tsx';

/**
 * Content planning, built on a simple content operating model:
 * question cluster → verified claim → own-made asset → CTA check → learning.
 * Stages map to its Stage gates (G1 production review, G2 publish approval,
 * G3 learning review), and every linked part is checked against the
 * product-truth and asset-rights rules before a card may pass G2.
 */
export type Stage = 'idea' | 'review' | 'approved' | 'published' | 'learned';
export const STAGES: { id: Stage; ko: string; gate: string; note: string }[] = [
  { id: 'idea', ko: '아이디어', gate: 'G0', note: '고객 질문·근거 후보' },
  { id: 'review', ko: '제작 검수', gate: 'G1', note: '주장 범위·자산·링크' },
  { id: 'approved', ko: '게시 승인', gate: 'G2', note: '명시 승인, 광고비 별도' },
  { id: 'published', ko: '게시됨', gate: '—', note: '7일/28일 지표 수집' },
  { id: 'learned', ko: '학습 평가', gate: 'G3', note: '효과 없으면 주제/CTA부터' },
];

export const CLUSTERS = ['MPN·팩·리비전', '차량 적용 조건', '정비·교체 방법', '선택 가이드', '브랜드·모터스포츠'] as const;
export const CHANNELS = ['Facebook', 'Instagram', 'YouTube', 'SEO/GEO', 'LinkedIn', 'TikTok'] as const;
export const FORMATS = ['Carousel', 'Reels', 'Image', 'Video', 'Article', 'Link'] as const;

export interface LinkedPart {
  id: string;
  sku: string;
  name: string;
  status: PartRow['status'];
  evidence: PartRow['evidence'];
  rights: PartRow['rights'];
  fitmentCount: number;
  holdReason: string | null;
}

export interface Metrics {
  reach: number;
  saves: number;
  inquiries: number;
  visits: number;
  hours: number;
}

export interface ContentCard {
  id: string;
  title: string;
  cluster: (typeof CLUSTERS)[number];
  systemId: string | null;
  vehicle: string;
  parts: LinkedPart[];
  channel: (typeof CHANNELS)[number];
  format: (typeof FORMATS)[number];
  stage: Stage;
  checks: { claimSource: boolean; ownAsset: boolean; ctaTested: boolean; fitmentVerified: boolean };
  metrics: { d7: Metrics; d28: Metrics };
  note: string;
  createdAt: number;
  updatedAt: number;
}

export const CHECK_KO: Record<keyof ContentCard['checks'], string> = {
  claimSource: '공식 근거 URL·버전 확인',
  ownAsset: '자체 제작 자산 (또는 권리 확인)',
  ctaTested: 'CTA 문구–URL–모바일 도착 확인',
  fitmentVerified: '차량 적용 조건 확인',
};

const zero = (): Metrics => ({ reach: 0, saves: 0, inquiries: 0, visits: 0, hours: 0 });

function seed(): ContentCard[] {
  const now = Date.now();
  const base = { parts: [], note: '', createdAt: now, updatedAt: now, metrics: { d7: zero(), d28: zero() }, vehicle: '' };
  return [
    {
      ...base,
      id: ulid(now),
      title: '겉보기 이름이 같은데 품번·포장 구성이 다른 이유는?',
      cluster: 'MPN·팩·리비전',
      systemId: 'filters',
      channel: 'Instagram',
      format: 'Carousel',
      stage: 'idea',
      checks: { claimSource: false, ownAsset: true, ctaTested: false, fitmentVerified: false },
      note: '시험 A. 자체 캐러셀 + FB 설명 → 검증된 상품 또는 선택 가이드.',
    },
    {
      ...base,
      id: ulid(now + 1),
      title: '차량 모델명만으로 왜 정확한 부품을 고를 수 없는가?',
      cluster: '차량 적용 조건',
      systemId: 'brakes',
      channel: 'Facebook',
      format: 'Image',
      stage: 'idea',
      checks: { claimSource: false, ownAsset: true, ctaTested: false, fitmentVerified: false },
      note: '시험 B. 차종 조건 체크리스트 + 짧은 영상 → 공식 적용 근거가 확인된 상품 또는 선택 지원.',
    },
  ];
}

let inited = false;
export function initContent() {
  if (inited) return;
  inited = true;
  hud.set({ content: load<ContentCard[] | null>('content', null) ?? seed() });
  hud.subscribe(() => save('content', hud.get().content));
}

export function toLinked(p: PartRow): LinkedPart {
  return { id: p.id, sku: p.sku, name: p.name, status: p.status, evidence: p.evidence, rights: p.rights, fitmentCount: p.fitmentCount, holdReason: p.holdReason };
}

/** Product-truth and rights rules applied to a card's linked parts and checklist. */
export function evaluate(c: ContentCard): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  for (const p of c.parts) {
    if (p.status === 'hold') blockers.push(`${p.sku} HOLD${p.holdReason ? ` · ${p.holdReason}` : ''}`);
    if (p.status === 'discontinued') blockers.push(`${p.sku} 단종`);
    if (p.rights === 'unknown' && !c.checks.ownAsset) blockers.push(`${p.sku} 자산 권리 미확인`);
    if (p.evidence !== 'A') warnings.push(`${p.sku} 근거 ${p.evidence}등급`);
    if (p.fitmentCount === 0) warnings.push(`${p.sku} 적용 차량 근거 없음`);
  }
  if (!c.parts.length) warnings.push('연결된 부품 없음 (CTA가 홈페이지로 갈 위험)');
  for (const [k, v] of Object.entries(c.checks)) if (!v) warnings.push(`미완료: ${CHECK_KO[k as keyof ContentCard['checks']]}`);
  return { blockers, warnings };
}

/** Moving past G1/G2 needs no blockers and a complete checklist (제작 승인 ≠ 게시 승인). */
export function canEnter(c: ContentCard, stage: Stage): string | null {
  const order = STAGES.map((s) => s.id);
  if (order.indexOf(stage) <= order.indexOf('review')) return null;
  const { blockers } = evaluate(c);
  if (blockers.length) return `차단: ${blockers[0]}`;
  const missing = Object.entries(c.checks).filter(([, v]) => !v);
  if (missing.length) return `체크리스트 미완료: ${CHECK_KO[missing[0]![0] as keyof ContentCard['checks']]}`;
  if (stage === 'learned' && c.metrics.d28.reach === 0 && c.metrics.d7.reach === 0) return '학습 평가 전 7일/28일 지표를 입력하세요';
  return null;
}

export function updateCard(id: string, patch: Partial<ContentCard>) {
  hud.set((s) => ({ content: s.content.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)) }));
}

export function moveCard(id: string, stage: Stage): boolean {
  const c = hud.get().content.find((x) => x.id === id);
  if (!c || c.stage === stage) return false;
  const why = canEnter(c, stage);
  if (why) {
    toast(why, 'bad');
    return false;
  }
  updateCard(id, { stage });
  toast(`${STAGES.find((s) => s.id === stage)!.ko}(으)로 이동 · ${c.title.slice(0, 24)}`, 'ok');
  return true;
}

export function newCard(partial: Partial<ContentCard> = {}): ContentCard {
  const g = garageQuery();
  const card: ContentCard = {
    id: ulid(),
    title: '새 고객 질문',
    cluster: '선택 가이드',
    systemId: null,
    vehicle: `${g.make} ${g.model} ${g.year ?? ''}`.trim(),
    parts: [],
    channel: 'Instagram',
    format: 'Carousel',
    stage: 'idea',
    checks: { claimSource: false, ownAsset: false, ctaTested: false, fitmentVerified: false },
    metrics: { d7: zero(), d28: zero() },
    note: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
  hud.set((s) => ({ content: [card, ...s.content], contentOpen: card.id }));
  return card;
}

/** From a part drawer: start a card about this part on the garage vehicle. */
export function planContent(p: PartRow) {
  const sys = systemOfCategory(p.categoryId);
  const g = garageQuery();
  newCard({
    title: `${p.category}: ${g.make} ${g.model}에 맞는 것을 고르는 법`,
    cluster: '차량 적용 조건',
    systemId: sys,
    parts: [toLinked(p)],
  });
  hud.set({ view: 'content', openPart: null });
  toast('콘텐츠 기획 카드를 만들었습니다', 'ok');
}

export function planSystem(systemId: string) {
  const d = SYSTEMS.find((s) => s.id === systemId)!;
  const g = garageQuery();
  const samples = (hud.get().samples[systemId] ?? []).filter((p) => p.status === 'active').slice(0, 3);
  newCard({ title: `${g.make} ${g.model} ${d.ko} 부품, 무엇을 확인하고 골라야 하나?`, cluster: '선택 가이드', systemId, parts: samples.map(toLinked) });
  hud.set({ view: 'content' });
  toast(`${d.ko} 계통 콘텐츠 카드를 만들었습니다`, 'ok');
}

export function exportContentCsv() {
  const rows: (string | number)[][] = [['ID', '단계', '질문', '클러스터', '계통', '차량', '채널', '형식', '연결 부품', '차단', '경고', '7일 도달', '7일 저장', '7일 적격 문의', '7일 상품 방문', '28일 도달', '28일 저장', '28일 적격 문의', '28일 상품 방문', '투입 시간', '시간당 적격 문의', '메모']];
  for (const c of hud.get().content) {
    const e = evaluate(c);
    const hrs = c.metrics.d28.hours || c.metrics.d7.hours;
    const inq = c.metrics.d28.inquiries || c.metrics.d7.inquiries;
    rows.push([
      c.id, STAGES.find((s) => s.id === c.stage)!.ko, c.title, c.cluster, SYSTEMS.find((s) => s.id === c.systemId)?.ko ?? '', c.vehicle, c.channel, c.format,
      c.parts.map((p) => p.sku).join(' '), e.blockers.join(' / '), e.warnings.join(' / '),
      c.metrics.d7.reach, c.metrics.d7.saves, c.metrics.d7.inquiries, c.metrics.d7.visits,
      c.metrics.d28.reach, c.metrics.d28.saves, c.metrics.d28.inquiries, c.metrics.d28.visits,
      hrs, hrs ? (inq / hrs).toFixed(2) : '', c.note,
    ]);
  }
  download(`gomdori-content-plan-${new Date().toISOString().slice(0, 10)}.csv`, csv(rows));
  toast('콘텐츠 계획을 CSV로 내보냈습니다', 'ok');
}
