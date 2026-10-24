# Architecture

목표: 100만 개 이상 부품 카탈로그를 웹 대시보드에서 다루되, 최종적으로
**멀티클라우드 + 엣지 네이티브 + 온디바이스 + 로컬-first** 구조로 배포한다.

## 핵심 결정 한 줄씩

| 결정 | 이유 |
|---|---|
| **모든 노드가 같은 SQLite 스키마** | 클라우드(node:sqlite / libSQL), 엣지(D1 / libSQL), 브라우저(sqlite-wasm + OPFS)가 같은 SQL을 실행 → 쿼리 코드 1벌 |
| **`SqlExecutor` 포트 4개 메서드** | `all / run / exec / transaction`만 구현하면 어떤 SQLite 계열 엔진도 붙는다 |
| **하나의 쿼리 계약 `PartQuery`** | UI는 데이터가 엣지에서 왔는지 기기에서 왔는지 모른다 (`HybridSource`가 라우팅) |
| **Keyset 페이지네이션만** | OFFSET은 깊이에 비례해 느려진다. 커서는 50페이지째도 1페이지와 같은 비용 |
| **복합 인덱스 `(필터, 정렬키, id)`** | 필터+정렬 조합에서 메모리 정렬 없음 |
| **FTS5 contentless + prefix 인덱스** | 텍스트 사본 없이 품번 타입-어헤드. 품번은 원형과 구두점 제거형 둘 다 색인 |
| **ULID id + HLC 시계** | 어느 기기든 오프라인에서 id 발급·쓰기 순서 결정. 중앙 조정자 불필요 |
| **변경 로그 + 범위(scope) 복제** | 기기는 필요한 범위(카테고리·브랜드·제조사)만 내려받고 이후 변경분만 당김 |
| **행 단위 LWW(HLC)** | 서버와 기기가 같은 규칙으로 병합 → 수렴 보장, 푸시는 mutation id로 멱등 |
| **상한 있는 카운트** | 1M 행 필터의 정확한 count는 대시보드의 고전적 함정. 10,000까지 정확, 이후 `10,000+` |

## 토폴로지

```
            ┌────────────── 클라우드 원본 (쓰기의 최종 기록) ──────────────┐
            │  node:sqlite (VM/컨테이너, 아무 클라우드)  또는  libSQL 기본 리전 │
            │  parts · fitments · vehicles · changes(변경 로그)             │
            └───────────────┬───────────────────────────────┬──────────────┘
                 복제(libSQL replicas / D1)            /sync/changes
                            │                               │
   ┌────────── 엣지 API (Hono, 런타임 무관) ──────────┐       │
   │ Cloudflare Workers · Deno Deploy · Bun · Node    │       │
   │ /api/*  읽기 + CDN 캐시 헤더   /sync/* 동기화      │◄──────┘
   └───────────────┬──────────────────────────────────┘
                   │ HTTP (fetch)
   ┌───────────────▼──────────── 브라우저 / 기기 ────────────────────────┐
   │ HybridSource ─┬─ EdgeSource (전역·완전)                              │
   │               └─ DeviceSource → Web Worker                         │
   │                    sqlite-wasm + OPFS · 같은 스키마 · outbox · HLC  │
   └────────────────────────────────────────────────────────────────────┘
```

## 3D 프레젠테이션 계층 (apps/web)

```
src/three/carSpec.ts    차체 타입(Ute/SUV/Sedan/Hatch/Wagon/Coupe)별 치수 — vehicles.body 컬럼에서 선택
src/three/buildCar.ts   절차적 차량: shell(도장·유리·타이어) / xray(프레넬 홀로그램) / skeleton(섀시) / systems(13계통)
src/three/materials.ts  클리어코트 도장, 크롬, 유리 + 스윕 컷(onBeforeCompile), X-ray 셰이더
src/three/systems.ts    13계통 = 카탈로그 상위 카테고리 그룹. 위치 앵커·색·단축키
src/three/Scene.tsx     Lightformer 환경광, 키/림 라이트, 광선 기둥, 반사 받침대, 파티클, 카메라 리그, 후처리
src/hud/store.ts        DOM HUD ↔ WebGL 공용 상태 (프레임 단위 값은 React 밖의 `frame` 객체)
src/hud/LeaderLines.tsx 앵커 화면 투영 → 좌우 균형 컬럼 라벨, 매 프레임 DOM 직접 갱신
src/hud/controller.ts   차량 → /api/coverage(계통별 적용 수) + 계통별 샘플 부품
src/three/presets.ts    조명 프리셋 4종(배경·안개·환경·라이트·블룸·그리드 색)
src/hud/persist.ts      localStorage(gomdori: 접두사, try/catch) + CSV 다운로드
src/hud/order.tsx       작업 지시서: 적용·HOLD·단종·재고 경고, GST 합계, CSV
src/hud/Palette.tsx     Ctrl/⌘+K 명령 팔레트 + 부품 검색(data.run → HybridSource)
src/hud/content.ts      콘텐츠 카드 모델 + 게이트 규칙(evaluate/canEnter)
src/views/Content.tsx   5단계 칸반·카드 편집기·채널별 시간당 적격 문의
src/hud/sound.ts        WebAudio 합성 효과음·앰비언스(파일 없음), toast.tsx 알림
src/three/fx.tsx        스캔 시트·선택 충격파/데이터 기둥·궤도 링·전조등 (store/frame만 읽음)
src/hud/attract.tsx     무입력 쇼케이스 모드(상태 저장 → 순환 → 복원)
src/hud/overlays.tsx    설정(localStorage)·조작법·투어·CountUp, UI 배율/동작 줄이기 적용
```

- **X-RAY 스캔**: 하나의 `uSweep` 값이 도장·유리 알파와 홀로그램 셸을 동시에 제어해 앞→뒤로 벗겨지는 스캔이 됩니다. 새 차량 생성·부팅 시에는 반대로 칠해지는 "물질화" 연출.
- **데이터 연결**: 계통 카운트는 `GET /api/coverage?make&model&year`(엣지 또는 기기 SQLite, 같은 `HybridSource` 라우팅).
- **실제 3D 모델 교체**: `buildCar`는 `{root, shell, xray, systems, anchors}`만 반환하면 되므로, 나중에 glTF 차량 모델을 불러와 같은 형태로 감싸면 HUD·리더 라인·X-RAY가 그대로 동작합니다.
- **최적화 보류 항목**(요청에 따라): 반사 바닥 해상도, 그림자 맵 2048, 멀티샘플 4, 백드롭 블러. 저사양 대응 시 `?2d` 또는 이 값들부터 낮춥니다.

## 패키지

```
packages/core   도메인 타입, PartQuery 계약, 포트, HLC/ULID, 시장 인텔리전스 기준 데이터
packages/sql    SQLite 스키마·마이그레이션, SqlPartsRepository, 어댑터(node / D1 / libSQL)
packages/sync   동기화 프로토콜, 서버 스냅샷, 기기용 SyncClient, fetch 전송
apps/api        Hono 앱 + Node 엔트리 + Workers 엔트리(템플릿)
apps/web        React 대시보드, 기기 워커(sqlite-wasm/OPFS), 쿼리 라우터
tools/seed      결정적 합성 카탈로그 생성기(기본 1M) + 벤치마크
```

## 데이터 모델과 마케팅 리스크의 연결

부품 마케팅에서 흔한 실패 지점 네 가지를 부품 단위 필드로 만들었다.

| 리스크 | 필드 / 기능 |
|---|---|
| Product truth (MPN·GTIN·규격 충돌, LHD/RHD) | `status = 'hold'` + `hold_reason`, `vehicles.drive_side`, MPN과 내부 SKU 분리 |
| Asset rights | `rights = own / licensed / unknown` |
| 근거 등급 A/B/U/H | `evidence` |
| Journey integrity | fitment별 `source_url` (적용 근거 원문) |
| Gate 0 통과 후보 | `contentReady` = 판매중 ∧ 근거 A ∧ 권리 확인 |

## 측정값 (합성 1,000,000 부품 / 2,225,331 fitment, node:sqlite, 웜 캐시)

`npm run bench` 결과, p50:

| 케이스 | ms |
|---|---|
| 첫 페이지 100행 | 0.5 |
| 카테고리 필터 | 0.6 |
| 브랜드 + HOLD | 2.6 |
| 권리 미확인 ∧ 근거 A | 0.7 |
| 최근 수정순 | 0.5 |
| 카테고리 + 가격순 | 0.5 |
| 텍스트 검색 "brake pads" | ~32 |
| MPN 접두 검색 | 1.7 |
| 차량 id | 1.2 |
| 제조사/모델/연식 | 6.2 |
| 50번째 페이지(커서) | 0.5 |
| 상한 카운트 | 0.4 |

DB 파일 약 870 MB. 브라우저(헤드리스 Chromium, OPFS)에서 25k 부품 범위 복제 약 7초.
초기 복제는 보조 인덱스를 끄고 적재한 뒤 정렬 빌드한다(OPFS에서 10배 빠름).

## 확장 경로

| 단계 | 할 일 |
|---|---|
| 1M → 10M | 넓은 텍스트 검색은 `bm25` 순위 + LIMIT으로 바꾸거나 전용 검색(Typesense/Meilisearch) 어댑터 추가. 통계는 증분 집계 테이블로 |
| 다중 리전 쓰기 | 지금은 단일 원본 + 복제. 필요 시 필드 단위 LWW(필드별 HLC)로 승격 — 프로토콜은 그대로 |
| Postgres 원본 | `SqlExecutor`에 dialect 추가(`?`→`$n`, FTS5→tsvector/pg_trgm). 엣지·기기는 SQLite 유지, 동기화 프로토콜로 연결 |
| 실데이터 | Shopify Admin(상품·변형), 제조사 카탈로그(fitment), GA4/Meta(콘텐츠 성과)를 `tools/ingest/*`로 적재 |
| 인증 | 엣지에서 JWT 검증 후 `PATCH`/`/sync/push` 허용. 범위 복제에 사용자별 권한 필터 |
| 모바일 앱 | 같은 `SyncClient`를 React Native + op-sqlite / Tauri + rusqlite에서 `SqlExecutor`만 바꿔 재사용 |

## 배포 시 체크리스트 (아직 하지 않음)

- 웹 정적 파일을 CDN에 올릴 때 `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` 헤더
- `/api/*`는 `s-maxage` 헤더를 존중하는 CDN 뒤에
- Workers: `apps/api/wrangler.example.toml` 복사 후 D1 생성·스키마 적용(`migrate`), 또는 libSQL 시크릿 설정
- 1M 행 D1 초기 적재는 `wrangler d1 execute --file`로 덤프 분할 업로드

## 정적 배포와 데모 모드

API 없이 배포된 경우(GitHub Pages·Vercel 같은 정적 호스팅) 앱은 부팅 때 `/health`를 확인하고, 응답이 없으면 **로컬-first 경로만으로** 동작합니다.

1. 브라우저 워커가 `@gomdori/demo`의 결정적 생성기로 합성 카탈로그(기본 60,000개)를 만들어 sqlite-wasm/OPFS에 저장합니다.
   Node의 `npm run seed`와 같은 생성기·같은 적재 함수(`loadDemoCatalogue`)라 두 환경의 데이터 모양이 동일합니다.
2. 적재는 보조 인덱스를 끈 채 JSON 배치(`json_each`)로 넣고, id가 오름차순이 되도록 생성해 B-트리에 순차로 쓰입니다.
3. 이후 모든 조회(통계·차량 커버리지·부품 탐색)는 기기 SQLite가 답합니다. 새로고침해도 OPFS에 남아 다시 생성하지 않습니다.

`VITE_API_BASE`가 설정되어 있고 `/health`가 응답하면 기존의 엣지 + 기기 하이브리드 경로로 돌아갑니다.
