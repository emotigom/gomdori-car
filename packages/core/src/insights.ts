/**
 * Market-intelligence baseline — ILLUSTRATIVE SAMPLE DATA.
 *
 * Every number and every brand below is fictional (가상 예시). It exists so the
 * market screen has something realistic-looking to chart; it is not drawn from
 * any real study, company or account. A live source (Meta Graph, GA4, a shop
 * platform) would replace the matching block via an `InsightsSource` adapter.
 */

export const INSIGHTS_AS_OF = '예시 데이터';

export interface FormatBenchmark {
  platform: 'Instagram' | 'Facebook';
  format: string;
  medianInteractions: number;
  excluded?: string;
}

export const formatBenchmarks: FormatBenchmark[] = [
  { platform: 'Instagram', format: 'Reels', medianInteractions: 58 },
  { platform: 'Instagram', format: 'Carousel', medianInteractions: 47 },
  { platform: 'Instagram', format: 'Image', medianInteractions: 24 },
  { platform: 'Facebook', format: 'Photo', medianInteractions: 19 },
  { platform: 'Facebook', format: 'Reels', medianInteractions: 15 },
  { platform: 'Facebook', format: 'Link', medianInteractions: 11 },
  { platform: 'Facebook', format: 'Live', medianInteractions: 35, excluded: '표본이 너무 적어 순위 제외 (예시)' },
];

export const accountBenchmarks = [
  { platform: 'Facebook', accounts: 150, postsQ3Median: 30, interactionsSepMedian: 20 },
  { platform: 'Instagram', accounts: 100, postsQ3Median: 28, interactionsSepMedian: 40 },
] as const;

export type OperatingModel = '대형 소매·인지도' | '온라인 설명→상품' | '정비업체 관계·업무' | '제조사 근거·선택 도구';

export interface CompetitorPattern {
  brand: string;
  region: 'AU' | 'Global';
  model: OperatingModel;
  pattern: string;
  takeaway: string;
  views?: number;
}

export const competitorPatterns: CompetitorPattern[] = [
  { brand: '대형 소매 A', region: 'AU', model: '대형 소매·인지도', pattern: '모터스포츠 시즌 캠페인', takeaway: '브랜드 이야기와 판매 링크를 목적별로 분리' },
  { brand: '대형 소매 B', region: 'AU', model: '대형 소매·인지도', pattern: '상품·서비스·업체용 광고', takeaway: '광고 목적별 CTA 분업' },
  { brand: '대형 소매 C', region: 'AU', model: '대형 소매·인지도', pattern: '행사·유머 콘텐츠', takeaway: '인지도용. 상품 전환 근거는 약함' },
  { brand: '온라인 전문몰 D', region: 'AU', model: '온라인 설명→상품', pattern: '제품 소개 영상 → 개별 상품', takeaway: '구체 제품은 해당 상품으로 직접 연결', views: 3200 },
  { brand: '온라인 전문몰 D', region: 'AU', model: '온라인 설명→상품', pattern: '정비 교육 영상 → 카테고리', takeaway: '범용 질문은 카테고리·가이드로', views: 1500 },
  { brand: '해외 전문몰 E', region: 'Global', model: '온라인 설명→상품', pattern: '긴 설명 영상 + 키트 링크', takeaway: '링크·상품 조건 유지 체계가 핵심' },
  { brand: '해외 전문몰 F', region: 'Global', model: '온라인 설명→상품', pattern: '차종 영상 → 차량별 카테고리', takeaway: '차종 힌트만으로 적용 여부는 해결되지 않음' },
  { brand: '도매 G', region: 'AU', model: '정비업체 관계·업무', pattern: '거래 계정 개설 광고', takeaway: '광고 약속과 도착 화면이 맞는지 점검 필요' },
  { brand: '도매 H', region: 'Global', model: '정비업체 관계·업무', pattern: '업체용 견적·상담 창구', takeaway: '계정 신청은 첫 거래가 아님' },
  { brand: '교육 채널 I', region: 'Global', model: '정비업체 관계·업무', pattern: '여러 채널에 같은 주제 게시', takeaway: '재활용은 관찰일 뿐, 비용 절감의 증거는 아님' },
  { brand: '제조사 J', region: 'AU', model: '제조사 근거·선택 도구', pattern: '규격·차량 조건 선택 도구', takeaway: '문서가 공개돼 있어도 SNS 재게시 권리는 별개' },
  { brand: '제조사 K', region: 'AU', model: '제조사 근거·선택 도구', pattern: '배터리 선택 도구', takeaway: '선택 도구로 다음 행동 연결' },
  { brand: '제조사 L', region: 'Global', model: '제조사 근거·선택 도구', pattern: '지역별 카탈로그', takeaway: '시장마다 품번이 다를 수 있음 → 데이터 관리' },
  { brand: '제조사 M', region: 'Global', model: '제조사 근거·선택 도구', pattern: '같은 품번인데 규격 표기가 다름', takeaway: '규격 충돌 시 콘텐츠 주장 HOLD' },
];

export const channelPlan = [
  { order: 1, channel: 'Facebook + Instagram', role: '초기 배포 엔진', kpi: 'AU 관련 방문, 저장/공유, 조건 갖춘 문의', status: '우선 시험' },
  { order: 2, channel: 'YouTube', role: '검색형 자산', kpi: '검색 유입, 시청 유지, 상품 이동', status: '우선 시험' },
  { order: 3, channel: 'SEO / GEO', role: '자사 지식 기반', kpi: '검색/인용, 상품 이동', status: '병행' },
  { order: 4, channel: 'LinkedIn', role: 'B2B 조건부', kpi: '적격 업체 → 견적 → 첫 주문', status: '조건부' },
  { order: 5, channel: 'TikTok', role: '조건부 확장', kpi: '추가 노동시간당 적격 신호', status: '조건부' },
  { order: 6, channel: 'Paid ads', role: '트래픽 확대', kpi: '기여이익·계측 확정 후', status: '보류' },
] as const;

export const gates = [
  { id: 'G0', name: '읽기 전용 준비', rule: '충돌/권리 미확인 시 HOLD', status: '승인 대기' },
  { id: 'G1', name: '제작 검수', rule: '주장 범위·자산 허가·정확 링크', status: '미착수' },
  { id: 'G2', name: '게시 승인', rule: '명시 승인 후 게시, 광고비 별도', status: '미착수' },
  { id: 'G3', name: '학습 평가', rule: '7일/28일 지표, 효과 부족 시 보류', status: '미착수' },
] as const;
