# 곰도리 — 재현용 프롬프트 기록

호주 자동차 애프터마켓(부품 온라인 판매) 마케팅 대시보드 **곰도리**를 처음부터 다시 만들 때 쓰는 프롬프트 모음입니다.
실제로 진행한 순서대로 정리했고, 단계마다 확정된 결정, 겪은 문제와 해결, 완료 기준을 함께 적었습니다.

- 같은 결과를 얻으려면 **0단계 컨텍스트를 붙인 채로 1~9단계를 순서대로** 넣습니다.
- 한 번에 만들려면 맨 아래 **통합 프롬프트**를 씁니다.
- 결과물: npm 워크스페이스 TypeScript 모노레포, GitHub Pages에서 API 없이 동작하는 3D 대시보드.

---

## 0단계 · 공통 컨텍스트 (모든 프롬프트 앞에 붙임)

```text
[컨텍스트]
- 도메인: 호주 자동차 애프터마켓 부품 온라인 판매 가게의 마케팅. 가게 이름은 가상("DEMO PARTS STORE").
- 독자: 마케팅 담당자. 주간 콘텐츠 기획 회의 전에 "어떤 부품을, 어떤 차종 고객에게 홍보해도 되는가"를 정한다.
- 실제 데이터가 없으므로 부품은 결정적(seeded) 합성 데이터로 만든다. 부품 브랜드 이름은 실제 판매 브랜드를
  빌려도 되지만 품번·GTIN·가격·적용 차량은 모두 합성이며, 화면과 문서에 합성이라고 밝힌다.
- 시장 정보(SNS 벤치마크, 경쟁사 패턴)는 가상 예시 수치와 가상 브랜드("대형 소매 A", "제조사 J" 등)로 만든다.
- 마케팅 운영 원칙(이 대시보드의 판단 규칙):
  · 부품마다 근거 등급 A(원문 확인)/B(보고값)/U(미확인)/H(가설), 자산 권리 own/licensed/unknown,
    판매 상태 active/hold/draft/discontinued(+hold 사유)를 둔다.
  · "콘텐츠 준비" = 판매중 ∧ 근거 A ∧ 권리 확인. HOLD·단종·권리 미확인 부품은 게시 승인 불가.
  · 콘텐츠 단계 게이트: G0 아이디어 → G1 제작 검수 → G2 게시 승인 → 게시됨 → G3 학습 평가(7일/28일 지표).
  · 판단 지표는 반응 수가 아니라 적격 문의와 상품 방문, 그리고 투입 시간당 적격 문의.
- 언어: UI와 문서는 한국어, 코드·주석은 영어.
```

---

## 1단계 · 시장·경쟁 인텔리전스 대시보드 (프로토타입)

```text
호주 자동차 부품 애프터마켓 마케팅용 대시보드를 만들어 주세요. 용도는 "시장·경쟁 인텔리전스"입니다.
수치는 모두 가상 예시이며 화면에 "예시 데이터"라고 표기합니다.

포함할 것
- 헤드라인: IG 9월 게시물 반응 중앙값(40)이 FB(20)의 몇 배인지(2.0배) + 한 줄 시사점
  ("초기 시험은 IG 캐러셀·Reels와 FB 설명 이미지, 판단 기준은 적격 문의와 상품 방문")
- KPI 타일: IG/FB 반응 중앙값, 분기 게시 수 중앙값(FB 30 / IG 28), 벤치마크 계정 수(FB 150 / IG 100), 현재 결정
- 형식별 반응 막대(플랫폼 안에서만 비교):
  IG Reels 58, Carousel 47, Image 24 / FB Photo 19, Reels 15, Link 11 (FB Live 35는 표본이 적어 순위 제외)
- 경쟁 패턴 표(운영 유형 필터 4종: 대형 소매·인지도 / 온라인 설명→상품 / 정비업체 관계·업무 / 제조사 근거·선택 도구),
  가상 브랜드 14행(대형 소매 A~C, 온라인 전문몰 D(조회 3,200/1,500), 해외 전문몰 E·F, 도매 G·H, 교육 채널 I, 제조사 J~M),
  열: 브랜드·지역(AU/Global)·운영 유형·관찰 패턴·시사점·조회수
- 채널 계획: FB+IG 우선 시험, YouTube 우선 시험, SEO/GEO 병행, LinkedIn·TikTok 조건부, 유료 광고 보류
- 실행 게이트 G0~G3 표(Go/Hold 규칙, 상태)
```

결정: 이 단계의 데이터는 이후 `packages/core/src/insights.ts`(시장 정보 예시 데이터)가 됩니다.

---

## 2단계 · 100만 부품 확장 구조로 리팩터 (로컬-first · 엣지 · 멀티클라우드)

```text
이것을 베이스로, 수많은 부품 데이터가 들어갈 수 있는 구조로 리팩터해 주세요. 기본은 웹 대시보드이지만
100만 개 이상의 부품 DB를 연결할 수 있을 만큼 확장성이 좋아야 합니다. 최종적으로
멀티클라우드 + 엣지 네이티브 + 온디바이스 + 로컬-first 구조가 될 것입니다. 배포는 나중에 합니다.

스택과 범위
- TypeScript 모노레포 + React(Vite). API는 Hono(런타임 무관: Node / Cloudflare Workers / Deno / Bun).
- "동작하는 프로토타입": 100만 건 합성 생성기로 실제 구동·측정까지. 결과물은 git 커밋이 있는 저장소.

설계 요구
1. packages/core — 도메인 타입(Part, Fitment, Vehicle, Brand, Category), 단일 쿼리 계약 PartQuery
   (q, brand, category, status, evidence, rights, vehicle/make/model/year, inStock, sort, limit, cursor),
   포트(PartsReader/Writer/ChangeFeed), HLC + ULID, 시장 정보 예시 데이터(insights).
   부품 필드: status+holdReason, evidence(A/B/U/H), rights(own/licensed/unknown), MPN과 내부 SKU 분리,
   fitment별 근거 URL, 차량 drive_side(LHD/RHD).
2. packages/sql — SQLite 방언 하나로 모든 노드를 지원:
   SqlExecutor(all/run/exec/transaction) 어댑터 = node:sqlite, Cloudflare D1, libSQL/Turso, (웹) sqlite-wasm.
   스키마: rid INTEGER PK + id(ULID) UNIQUE, (필터, 정렬키, id) 복합 인덱스,
   FTS5 contentless + prefix 인덱스(품번은 원형과 구두점 제거형 둘 다 색인), fitments WITHOUT ROWID,
   changes 변경 로그, applied_mutations(멱등), stats_cache. OFFSET 금지, keyset 커서만. count는 10,000 상한.
3. packages/sync — 범위(scope: 카테고리/브랜드/제조사/전체) 스냅샷 페이지 + changesSince + push.
   기기 쪽 SyncClient: 같은 스키마의 로컬 SQLite, outbox, 행 단위 LWW(HLC), mutation id 멱등.
4. apps/api — /api/parts, /api/parts/count, /api/parts/:id(/fitments), /api/stats, /api/brands,
   /api/categories, /api/vehicles/makes|models, /api/insights, PATCH /api/parts/:id,
   /sync/snapshot|changes|push, /health. CDN용 s-maxage 캐시 헤더, Server-Timing.
5. apps/web — 데이터 라우터 HybridSource: 복제된 범위가 쿼리를 덮으면 기기, 아니면 엣지, 엣지 실패 시 기기.
   기기 쪽은 Web Worker + sqlite-wasm(OPFS SAH pool). 탭: 카탈로그 개요 / 부품 탐색(가상 스크롤 + 커서,
   상세 드로어에서 상태·근거·권리 수정) / 시장 인텔리전스 / 기기·동기화.
6. tools/seed — 결정적 100만 부품 + 약 220만 fitment 생성기, tools/seed/bench.ts 지연 측정.

완료 기준
- 100만 건에서 대부분의 필터·정렬 조회 p50 ≈ 1ms, 50번째 커서 페이지도 1페이지와 같은 비용.
- 테스트: 범위 복제, 오프라인 수정 → 푸시 → 원격 수정 pull → 수렴, stale 거부, 멱등 재푸시, 커서 완전성.
- docs/ARCHITECTURE.md에 토폴로지·측정값·확장 경로.
```

겪은 문제와 해결 (재현 시 미리 반영)
- Node `--experimental-strip-types`는 TS parameter properties를 지원하지 않음 → 필드를 명시 선언.
- 카테고리 + 가격순: `(category_id, price_cents, id)` 인덱스로 34ms → 0.5ms.
- 제조사만 지정한 차량 필터: 흔한 제조사는 `EXISTS`, 드문 제조사는 `IN`.
- 기기 스냅샷 적재: `PRAGMA defer_foreign_keys = ON`, `INSERT OR REPLACE` 대신 `ON CONFLICT DO UPDATE`.
- OPFS 적재 속도: 첫 복제 때 보조 인덱스·FTS 트리거를 끄고(bulk mode) 끝에 한 번에 생성, `json_each` 일괄 삽입.
- Windows 경로: `new URL(...).pathname` 대신 `fileURLToPath`.

---

## 3단계 · 3D 환경 전환 (스타크래프트2 분위기)

```text
3D 환경으로 전환해 주세요. 최적화는 신경 쓰지 말고, 로그인 없이, full 3D에 가까운 환경으로.
디자인은 스타크래프트2(RTS 커맨드 콘솔) 분위기만 참고하고 원작의 그림·로고·폰트·캐릭터는 쓰지 않습니다.
UI, UX, FX, 광원, 재질, 전환효과, 렌더링, 스켈레톤, 로딩화면까지 단계별로 git 커밋을 나눠 주세요.

핵심 인터랙션
- 대시보드 중앙에 "내 차"가 받침대 위에서 자동 회전. 드래그로 회전, 휠로 줌.
- 마우스를 올리면 X-ray로 변하고(앞에서 뒤로 스캔), 부품 목록이 긴 리더 라인으로 연결되어 뜸.
- 통계는 모두 그래프로.

S1 three + @react-three/fiber + drei + postprocessing. API·기기 모두에 /api/coverage(차량별 카테고리 부품 수)와 /api/vehicles.
S2 절차적 차량 + 스켈레톤: 차체 6종(Ute/SUV/Sedan/Hatch/Wagon/Coupe) 파라미터 치수(carSpec), 옆면 실루엣 압출 + 휠 아치,
   유리, Ute 적재함, 스포크 휠. 레이어 4개: shell / xray / skeleton(섀시·액슬) / systems(13계통 내부 부품).
   13계통 = 엔진·냉각·벨트호스·점화·필터·전장·오일유체·브레이크·서스펜션·조향·구동계·조명·와이퍼,
   각각 앵커 좌표·색·단축키(E C B I F Q O K S R D L W).
S3 재질·광원: 클리어코트 도장(6색), 크롬, 고무, 유리, Lightformer 환경광(HDR 다운로드 없음), 키·림 라이트,
   광선 기둥, 반사 받침대 + 회전 눈금 링, 홀로그램 그리드 바닥, 언더글로우.
S4 X-ray·리더 라인: uSweep 유니폼 하나가 도장·유리 알파(onBeforeCompile)와 프레넬 셸을 함께 제어.
   앵커를 매 프레임 화면 좌표로 투영해 DOM 직접 갱신, 라벨은 좌우 컬럼 균형 배치(계통 코드·적용 수·대표 부품 2개).
   계통 선택 → 카메라 이동, 하단 정보 패널에 적용 부품 → 상세 드로어.
S5 FX: Bloom, 색수차, 스캔라인, 그레인, 비네트, ACES 톤매핑, 파티클, 핫스팟 펄스.
S6 HUD: 상단 자원 바(부품·내 차 적용·콘텐츠 준비·HOLD) + 탭, 좌측 "내 차" 패널(제조사·모델·연식·도장),
   하단 콘솔 = 미니맵 + 정보 패널 + 5×3 커맨드 카드. 분석 탭: 카테고리/브랜드 막대, 계통 레이더,
   콘텐츠 준비 게이지, 근거·권리·상태 도넛, 시장 형식별 컬럼.
S7 로딩·전환: 5단계 로딩 화면, 탭 전환 플래시, 스켈레톤 자리표시, ?2d 모드(WebGL 없이 HUD만).
S8 검증·문서.
```

겪은 문제와 해결
- 헤드리스(SwiftShader)에서는 CSS 애니메이션이 멈춤 → 시작 상태를 `opacity:0` 대신 transform/filter로(멈춰도 보이게). 검증은 `?2d`와 3D 스크린샷을 나눠서.
- 큰 시트의 `backdrop-filter`는 소프트웨어 GPU에서 누락 → 불투명 그라디언트.

---

## 4단계 · Windows 실행 + 정적 배포 + 이름 변경

```text
Windows PowerShell에서 pnpm이 없고 npm은 "Unsupported URL Type workspace:" 오류가 납니다.
정적 호스팅에 바로 배포되게 바꾸고, 대시보드 이름을 "곰도리"로 바꿔 주세요.

변경
- pnpm → npm workspaces, workspace:* 대신 "*", 버전 고정.
- 정적 배포에는 API가 없으므로 로컬-first 폴백: 부팅 때 /health 확인 → 실패하면 기기 모드로 고정하고,
  워커가 @gomdori/demo 생성기로 합성 부품 60,000개(?demo=N)를 sqlite-wasm/OPFS에 만들어 저장.
  로딩 화면에 진행률, 상단에 "기기 · 데모". 나중에 VITE_API_BASE를 넣으면 자동으로 엣지 모드.
- @gomdori/demo: 결정적 생성기 + loadDemoCatalogue(any SqlExecutor). ULID 시간을 i에 비례(순차 쓰기).
- COOP/COEP 헤더 불필요(SAH pool VFS).
- 이름: 탭 제목·엠블럼(육각 배지 안의 곰 얼굴 SVG를 직접 그림)·로딩 제목을 "곰도리".
```

완료 기준: 새 폴더에서 `npm install` → `npm run build`, `dist`만 정적 서버로 띄워 데모 카탈로그 생성 → 새로고침 후 유지.

---

## 5단계 · 3D 연출 · HUD · 마케팅 기능 업그레이드 (최적화 없이, 단계별)

```text
이 소스로 아직 최적화하지 말고 최대한 업그레이드해 주세요.
단계별 커밋으로 3D 연출 → 인터랙션·HUD → 데이터·마케팅 기능 순서로 전부 진행합니다.
```

- U1 3D: 분해 뷰(V), 조명 프리셋 4종(1–4: 격납고·석양·경보·쇼룸 — 배경·안개·환경·블룸·그리드 색 일괄), 사진 모드(P, HUD 숨김·PNG 캡처), 자동 회전 시 바퀴 회전, 차체 디테일.
- U2 HUD: Ctrl/⌘+K 명령 팔레트(명령 + 실시간 부품 검색), 작업 지시서(적용·HOLD·단종·재고 경고, GST 10%, CSV), WebAudio 효과음, 토스트, 두 차량 레이더 비교, 탐색 결과 CSV.
- U3 마케팅: 콘텐츠 탭 — 5단계 칸반(G0→G1→G2→게시→G3), 드래그 이동 시 게이트 규칙(HOLD·단종·권리 미확인 차단, 체크리스트 4항목, G3 전 지표 필요), 카드 편집기(연결 부품·7/28일 지표), 채널별 시간당 적격 문의 차트, CSV. 시험 A/B 카드 기본 포함.

## 6단계 · 남은 UI/UX/FX 강화

```text
아직 하지 못한 UI/UX/FX나 효과가 있다면 더 작업해 주시고, 강화를 부탁해요.
```

- U5 장면 FX: X-RAY 스윕을 따라가는 스캔 시트, 선택 시 바닥 충격파 + 데이터 기둥 + 카메라 펀치, 궤도 링, 전조등(H), 부팅 후 카메라 플라이인, 30초 무입력 시 쇼케이스 모드.
- U6 UI/UX: 설정(,), 조작법(?/F1), 첫 방문 5단계 투어(`?notour`로 생략), 계통 툴팁(더블클릭 → 부품 탐색), 숫자 카운트업, 커스텀 커서, 앰비언스 사운드, 팔레트 최근 부품.

## 7단계 · 내장그래픽에서 X-RAY 차량이 검게 보임

```text
배포 후 첫 화면에서 X-RAY 차량이 검게 안 보입니다. 내장그래픽 노트북으로 확인했어요.
```

- 원인: X-RAY 프레넬 `pow(1 - abs(dot(normalize(n), normalize(v))), 2.2)`에서 반올림으로 밑이 아주 작은 음수가 되면 Intel/ANGLE 드라이버는 NaN을 내고, Bloom이 NaN 픽셀을 번지게 해 셸 전체가 검게 보임.
- 해결: `normalize` 대신 `v / max(length(v), 1e-5)`, `pow(clamp(x, 0, 1), k)`. `atan(0,0)`·`fwidth()=0` 방어. 로딩 화면이 걷히기 전에 `renderer.compileAsync`로 셰이더 미리 컴파일.

## 8단계 · 점검 수정

```text
더 고쳐야 할 부분이 있다면 고쳐 줄래요?
```

- 1280~1600px 노트북에서 탭이 자원 바에 밀려 안 보임 → 폭별로 자원 타일 축소·숨김, 1500px 미만 영문 탭 라벨 숨김.
- 높이 768px에서 하단 콘솔이 잘림 → 콘솔 그리드 행을 콘솔 높이로 고정(`grid-template-rows: minmax(0, 100%)`), 820px 미만 콘솔 196px.
- 휴대폰: 상단 바를 흐름에 두고 탭을 별도 가로 스크롤 줄로.
- Ctrl+K가 브레이크(K)까지 선택 → Ctrl/⌘/Alt 조합은 계통 단축키 무시.
- `?2d`에서 쇼케이스가 안 꺼짐 → 입력 감지를 3D 리그 밖으로 이동. Esc는 맨 위 레이어만 닫기.
- 렌더링 품질 자동/높음/보통/낮음: 내장·모바일 GPU면 자동으로 보통(DPR ≤1.5, MSAA 2, 그림자 1024, 반사 512), 낮음은 반사 바닥 없음.

## 9단계 · 과제 제출용 공개 저장소 (GitHub Pages)

```text
과제로 GitHub 공개 저장소에 올려 Pages에서 뜨게 하려고 합니다.
가게 이름과 시장 정보는 가상 예시로 바꾸고, 기능과 화면은 그대로 둬 주세요.
```

- 가게 이름 → "DEMO PARTS STORE", 패키지 범위 `@gomdori/*`, 시장 정보의 수치·경쟁사 → 가상 예시(0단계 기준).
- 새 git 기록으로 시작(이전 기록을 공개하지 않음), `package-lock.json` 포함(`npm ci`).
- `apps/web/vite.config.ts`: `base = process.env.VITE_BASE ?? '/'`.
- `.github/workflows/pages.yml`: push(main) → `npm ci` → `npm test` → `VITE_BASE=/<저장소>/`(`<계정>.github.io` 저장소면 `/`)로 빌드 → `upload-pages-artifact`(apps/web/dist) → `deploy-pages`.
- 저장소 Settings → Pages → Source를 **GitHub Actions**로.
- 결과 요약은 `docs/DASHBOARD.md`.

---

## 통합 프롬프트 (한 번에 재현)

```text
[목표] "곰도리" — 호주 자동차 애프터마켓 부품 온라인 판매 가게(가상: DEMO PARTS STORE)의
마케팅 담당자가 주간 콘텐츠 회의 전에 보는 3D 부품·마케팅 대시보드를 만든다.
부품은 결정적 합성 데이터, 시장 정보는 가상 예시 데이터(0단계의 수치)로 만들고 화면에 표기한다.

[판단 규칙] 부품마다 근거 A/B/U/H, 권리 own/licensed/unknown, 상태 active/hold/draft/discontinued.
콘텐츠 준비 = 판매중 ∧ 근거 A ∧ 권리 확인. 콘텐츠 칸반 G0→G1→G2→게시→G3, HOLD·단종·권리 미확인은 G2 불가.

[구조] npm workspaces TypeScript 모노레포 (Node 22.13+, workspace: 프로토콜 금지, 버전 고정, package-lock 포함)
- packages/core: 타입, PartQuery(keyset 커서만), 포트, HLC/ULID, 시장 정보 예시 데이터
- packages/sql: SQLite 스키마(복합 인덱스, FTS5 contentless+prefix, changes 로그, stats_cache),
  리포지토리, 어댑터 node:sqlite / D1 / libSQL, bulk-load
- packages/sync: 범위 스냅샷·변경 로그·push, 기기 SyncClient(outbox, HLC LWW, 멱등)
- packages/demo: 결정적 생성기 + loadDemoCatalogue
- apps/api: Hono + Node 엔트리(첫 실행 시 5만 건) + Workers 엔트리 템플릿
- apps/web: React + Vite, three/R3F/drei/postprocessing, HybridSource, sqlite-wasm OPFS 워커,
  API가 없으면 브라우저에서 6만 건 데모 생성
- tools/seed: 100만 건 seed + bench
- .github/workflows/pages.yml: 테스트 → VITE_BASE=/<저장소>/ 빌드 → GitHub Pages 배포

[화면] 스타크래프트2 분위기의 RTS 커맨드 콘솔(원작 자산 미사용), 다크 테마, 로그인 없음
- 격납고: 차체 6종 절차적 차량이 반사 받침대에서 회전, 드래그·휠, 호버 시 앞→뒤 X-ray 스캔,
  13계통 리더 라인 카드, 계통 선택 시 카메라 이동·정보 패널·부품 드로어, 미니맵, 5×3 커맨드 카드, 단축키
- 상단 KPI: 총 부품 · 내 차 적용 · 콘텐츠 준비 · HOLD · 작업 지시서
- 분석: 카탈로그 전력 / 내 차 적용(레이더 + 차량 비교) / 품질 게이트(게이지·도넛·막는 요인) / 시장 신호
- 부품: 100만 건 탐색기(검색·필터·가상 스크롤·커서·CSV)
- 콘텐츠: 게이트 규칙을 강제하는 칸반 + 7/28일 지표 + 채널별 시간당 적격 문의 + CSV
- 시장 정보: 가상 경쟁 패턴·채널 계획·게이트 / 기기: 범위 복제·오프라인·동기화
- 연출: 5단계 로딩, 전환 플래시, 분해 뷰, 조명 4종, 사진 모드, 전조등, 스캔 시트, 충격파, 궤도 링,
  플라이인, 쇼케이스 모드 / UX: 명령 팔레트, 작업 지시서, 설정(렌더링 품질 자동 포함), 조작법, 투어, 툴팁,
  효과음·앰비언스, ?2d 모드
- 셰이더는 NaN 안전하게(clamp 후 pow, 0 길이 normalize 방어), 1280~1600px·768px 높이·휴대폰 레이아웃 확인

[진행] 단계별 git 커밋, 단계마다 스크린샷으로 확인.

[완료 기준]
- npm test(7개) · npm run typecheck · npm run build 통과
- 100만 건 bench: 대부분 조회 p50 ≈ 1ms
- dist만 정적으로(하위 경로 /<저장소>/ 포함) 띄워도 데모 카탈로그로 전 화면 동작, 새로고침 후 유지
- README에 실행법·Pages 배포 순서, docs/ARCHITECTURE.md에 구조·측정값, docs/DASHBOARD.md에 독자·KPI·차트·인사이트
```

---

## 확인 명령

```bash
npm install                 # 또는 npm ci
npm test                    # 7개 테스트
npm run typecheck
npm run build               # → apps/web/dist
npm run dev                 # API 없이 데모 모드 → http://localhost:5173
npm run seed && npm run dev:api   # 100만 건 서버 모드 (다른 터미널에서 npm run dev:web)
npm run bench               # 지연 측정
VITE_BASE=/gomdori/ npm run build # Pages 하위 경로 빌드 확인
```
