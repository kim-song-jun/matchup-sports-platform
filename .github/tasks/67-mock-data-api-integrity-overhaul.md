# Task 67 — Mock Data / API / DB / Frontend Integrity Overhaul

Owner: project-director -> tech-planner -> backend-api-dev ⟂ backend-data-dev ⟂ backend-integration-dev ⟂ frontend-ui-dev ⟂ frontend-data-dev -> backend-review ⟂ frontend-review -> QA
Date drafted: 2026-04-14
Status: Planning
Priority: P0 (blocking realistic UX validation + release confidence)

---

## 1. Context

사용자 요청 원문 (2026-04-14):
> "지금 보면 우리의 목데이터를 넣는 로직이 있는데, 그 목데이터가 크게 데이터가 양이 많거나 의미있거나 실제 테스팅 할정도의 (ui/ux, 사용성 등) 데이터는 아닌것같아. 또한 api 구조나, db 구조 그리고 frontend에서 호출하는 부분도 모두 검증이 필요해. 이걸 아주 면밀하게 고려해서, 계획을 세우고 진행해보자."

### 1.1 Prior work (keep, do not repeat)

- **Task 47 (Completed)** — `apps/api/prisma/seed-mocks.ts` + `mock-data-catalog.ts` + `SeedSyncState` checksum-gated deploy sync. 현재 12 users / 10 venues / 10 teams / 11 matches / 8 lessons / 10 listings / 8 mercenary / 6 team matches / 6 badges + 로컬 `public/mock/profile/profile-XX.svg`를 제공한다.
- **Task 34** — user surface honest data contracts (프로필 허위 데이터 제거).
- **Task 51** — frontend API contract audit.
- **Task 52** — backend API contract audit.
- **Task 66** — E2E screenshot audit remediation (진행 중, 이 task에서 드러난 빈 페이지들을 Task 67 데이터로 채워 마무리).

Task 67은 Task 47을 **대체하지 않고 확장**한다. 중복 사용자/팀/매치 레코드 생성은 금지. canonical natural-key catalog (`mock-data-catalog.ts`)를 확장하는 방식으로 새 도메인을 추가한다.

### 1.2 Audit evidence (2026-04-14 explore 결과)

| 영역 | 증거 | 문제 |
|------|------|------|
| Seed coverage | `apps/api/prisma/seed.ts` 1527L, `seed-mocks.ts` 기준 dataset | chat rooms 1 / chat messages 1, payments 1, reviews 1, notifications 1, tournaments 2, team match applications 1, lesson ticket ownership 0. 11 종목 중 7종만 시드. admin role user 0. team manager/member 역할 시드 0. 빈 팀/빈 venue/페이지네이션 케이스 없음. |
| MSW drift | `apps/web/src/test/msw/handlers.ts` 427L, 40+ routes, enum 드리프트 4곳 (line 24/75/89/121) — `'SOCCER'` vs schema `soccer` 혼용 | marketplace / lessons / payments / reviews / venues / chat messages / settlements / reports 핸들러 **전혀 없음**. 이 도메인을 쓰는 Vitest suite는 실제로 네트워크가 비워져 있거나 ad-hoc mock에 의존 |
| Frontend 타입 | `apps/web/src/types/api.ts` 1100+ 라인, `sportType: string` (enum 미적용) 28곳, `teamConfig: Record<string, unknown>` 2곳 | DB enum(lowercase)과 비계약. 프론트에서 무효한 값 전달 가능, 백엔드 DTO 검증이 최종 방어선. `Record<string, unknown>`는 Core Principle 4 위반 가능성 |
| Guard 분포 | 22 controllers, `JwtAuthGuard` + `AdminGuard` + `@CurrentUser` 총 102회 | marketplace order cancel, settlement view, admin dispute view 등 일부 mutation 검증 공백 (Task 52 미종결분 포함) |
| Unit/integration mock | 28 spec files, fixture factory는 `apps/api/test/fixtures/` 있음 | `*.spec.ts` 내부 inline mock이 제각각, `sportType` string literal, `as unknown as` 단언 다수. schema 변경 시 silent drift 위험 |
| Pagination / empty states | matches cursor, team-matches cursor 등 존재 | dataset이 작아서 cursor roundtrip, "empty 팀", "reviews 없음" 스크린 미커버 |
| Notification/push | `WebPushService` VAPID graceful disable 완료 | seed 후 알림 inbox 비어 있어 `/notifications` 빈 상태만 노출 |

### 1.3 Key decision drivers

- **Principle 1 (Tech Debt)**: enum/typing/guard drift는 범위 내면 모두 같은 task에서 해결.
- **Principle 4 (Mock discipline)**: schema ↔ inline mock ↔ MSW handler ↔ seed ↔ canonical catalog 5중 드리프트 구조를 단일 소스로 수렴시켜야 재발 방지.
- **Principle 5 (No silent skipping)**: "MSW 핸들러는 다음에"식 이연 금지. 사용자 요청이 "API 구조/DB 구조/프론트 호출 모두 검증"이므로 scope 축소는 silent drop.

---

## 2. Goal

1. **Mock dataset**을 UX/사용성 검증이 실제로 가능한 수준으로 깊고 다양하게 확장한다 (종목 11종 전부, 상태 전이 전부, 빈/가득/페이지네이션/경계 케이스 포함).
2. **DB ↔ API DTO ↔ 프론트 타입 ↔ MSW ↔ inline unit mock**의 5중 소스를 하나의 SSoT로 수렴한다 (`SportType` enum · `teamConfig` 등 JSON 필드 DTO화 · 공유 fixture factory).
3. **22 controllers 전부** 보안/권한/ownership/ 페이지네이션 감사를 수행하고 drift는 이 task 안에서 해소한다.
4. **프론트엔드 호출 경로**(Axios + React Query + Zustand)가 타입 기준으로 compile-fail-fast하게 만들고, MSW 핸들러는 프론트 단위테스트가 실제 백엔드 계약과 동일한 응답을 받도록 한다.
5. Task 66 E2E screenshot 미커버 화면(chat detail, payment history, review list, settlement, admin dispute 등)을 데이터로 채운다.

---

## 3. Original Conditions (checkboxes, derived verbatim from user ask)

원문의 조건이 설계 → 구현 → 검증 전 단계에 살아있도록 분해한다.

### 3.1 "목데이터 양/의미/사용성이 부족하다"
- [ ] 11 종목 전부에 최소 1건 이상의 user sport profile / match / team / mercenary / lesson / listing 시드
- [ ] 매치 상태 전부 (`recruiting` / `confirmed` / `full` / `in_progress` / `completed` / `cancelled`) 시드
- [ ] 결제 상태 전부 (`pending` / `completed` / `refunded` / `partial_refunded` / `failed`) 시드
- [ ] 팀 역할 3종 (`owner` / `manager` / `member`) 전부 시드 + admin role user 1명 이상
- [ ] 팀 매칭 신청서 (applications) 다건, `pending` / `approved` / `rejected` 상태 분산
- [ ] 용병 신청서 다건, `pending` / `accepted` / `rejected` / `cancelled` 상태 분산
- [ ] 레슨 ticket (1회/다회/기간권) + 보유 ticket ownership + 출석 기록 시드
- [ ] 채팅 rooms 10+ (1:1 / 팀 / 팀매치 linked), 각 room 10+ messages (페이지네이션 검증 가능)
- [ ] 리뷰 시드 — venue reviews, match reviews, team trust evaluations (6항목) 모두
- [ ] 뱃지 시드 — 획득/진행중/미획득 3상태 유저별 분산
- [ ] 알림 시드 — 읽음/안읽음 / 타입별 (match / team_match / chat / payment / lesson / admin) 전부
- [ ] 분쟁 / 정산 시드 — admin 화면 렌더링 최소량 (open / in_review / resolved)
- [ ] 토너먼트 시드 — 진행중/완료/예정 각 1건 이상
- [ ] 빈 상태 재현용 fixture: 빈 팀 1개, 경기 없는 venue 1개, 신청 없는 mercenary 1건
- [ ] Cursor 페이지네이션 경계 테스트용: 한 도메인 20+ 레코드 (최소 matches / listings / chat messages)

### 3.2 "API 구조 검증"
- [ ] 22 controllers 전수 audit (auth / users / matches / team-matches / teams / mercenary / marketplace / lessons / chat / payments / settlements / reviews / venues / badges / notifications / disputes / admin / uploads / reports / tournaments / user-blocks / health)
- [ ] 모든 mutation 엔드포인트 `JwtAuthGuard` + ownership/membership 검증 확인
- [ ] 모든 관리자 엔드포인트 `AdminGuard` 확인
- [ ] `Record<string, unknown>` / `any` 남은 DTO 전부 전용 DTO class로 전환 (`@ValidateNested`)
- [ ] 모든 list 엔드포인트 cursor/offset 규칙 통일 (`?cursor=` + `limit ?? 20`)
- [ ] 응답 envelope `{ status, data, timestamp }` 일관성 확인
- [ ] 에러 코드 `DOMAIN_CODE` 포맷 일관성 (`MATCH_NOT_FOUND`류)
- [ ] Swagger decorator 누락 controller 0개

### 3.3 "DB 구조 검증"
- [ ] `schema.prisma` enum ↔ 실제 시드 값 1:1 (`sportType` 대소문자 혼용 제거)
- [ ] 고아 외래키 0건 (seed-mocks 실행 후 DB integrity query)
- [ ] N+1 가능 쿼리 경로 감사 (matches list, team-matches list, chat rooms list, marketplace listings list) — `include` 누락 / 무제한 include 양쪽 점검
- [ ] 인덱스 누락 컬럼 점검 (`@@index([sportType, status])` 이미 있는 모델 외 list 쿼리 주 필터)
- [ ] Cascade 정책 점검 (user 탈퇴 시 team membership / chat participant 처리)

### 3.4 "프론트엔드 호출 검증"
- [ ] `apps/web/src/types/api.ts`의 `sportType: string` 28곳 → `SportType` union literal 타입 적용
- [ ] `teamConfig: Record<string, unknown>` → 전용 TeamConfig 타입
- [ ] `apps/web/src/lib/api.ts` / `hooks/use-api.ts` Axios call signature가 server DTO와 타입-일치
- [ ] MSW handler 40+ route 전량 재작성: marketplace / lessons / payments / reviews / venues / chat messages / settlements / reports / admin / disputes / tournaments 커버
- [ ] MSW enum drift 4건 수정 (SOCCER → soccer)
- [ ] Vitest suite 19개 재실행, 모두 초록
- [ ] E2E 14 specs 재실행, 모두 초록 (seed-mocks 확장 반영)

### 3.5 "면밀하게 계획"
- [ ] Task 문서에 Phase / Wave / 병렬 분할 명시
- [ ] 각 phase에 acceptance criteria + validation command 명시
- [ ] Risk/dependency/ambiguity log 유지
- [ ] Task 47 / 51 / 52 / 66 범위와 겹치는 부분 명시적으로 구분

---

## 4. Scope Decision — **옵션 C 채택**

| 옵션 | 범위 | 공수 | 선택? |
|------|------|------|------|
| A | Seed 재설계만 | 1~2일 | No — "API/DB/프론트 모두 검증" 요구 silent drop |
| B | Seed + MSW + 타입 정합성 | 3~5일 | No — 22 controllers 감사 제외는 요청 범위 축소 |
| **C** | **B + 22 controllers 보안/페이지네이션/DTO 감사 + 공유 fixture factory 확장** | **5~7일** | **Yes** |

### 근거
- 사용자 원문: "api 구조나, db 구조 그리고 frontend에서 호출하는 부분도 **모두** 검증"이 명시 → 옵션 A/B는 Principle 5 (No ambiguous skipping) 위반.
- Principle 1 (Tech Debt — Never Defer)에 따라 scope 내 발견된 enum drift / `Record<string, unknown>` / MSW gap은 같은 task에서 해결. 별도 티켓 이연 금지.
- Task 47 기반 catalog가 이미 idempotent/checksum-gated 라 확장 비용이 선형. 옵션 C의 추가 공수는 controllers 감사(2일)와 MSW 재작성(1일)로 예측 가능.

### Out of scope (명시적 배제)
- 새 기능 추가 (신규 도메인, 신규 화면). 이 task는 **기존 기능의 데이터/타입/권한 품질 복구**에 한정.
- Production seed policy 변경 — Task 47의 `DEPLOY_SYNC_MOCK_DATA` contract 유지.
- 디자인/UI 토큰 재설계 — Task 45 / 58 / 59 / 62 / 63 영역.
- 실제 vendor (Toss / 카카오 OAuth) 통합 테스트 — 기존 sandbox 수준 유지.

---

## 5. Phase Breakdown

**총 5 phase · 예상 5~7 working days.** 각 phase 간 명확한 gate가 있어 중단/재개 가능.

### Phase 0 — Baseline Audit & Contract Freeze (0.5d, 순차)
- Owner: tech-planner + backend-review
- Deliverable: `.github/tasks/67-baseline-audit.md` 부록 (controllers 22개 × guards/DTO/pagination 표, enum drift 지점 전수, MSW gap 지점 전수)
- Gate: Priority Matrix 확정 → Phase 1 분기

### Phase 1 — Schema/Type SSoT (1d, 병렬 가능)
- 1A **backend-data-dev**: `schema.prisma` enum 정제, 누락 인덱스 / cascade 추가, migration 1건 (`67_mock_integrity`)
- 1B **backend-api-dev**: `Record<string, unknown>` → 전용 DTO 전환 (teamConfig / rule json / venue meta 등), `filter.limit ?? 20` 통일
- 1C **frontend-data-dev**: `apps/web/src/types/api.ts`의 `sportType: string` → `SportType` 타입, `teamConfig` 타입. shared `@/types/sport` 도입
- Shared file owner 충돌 방지: `types/api.ts`는 1C 전담, `schema.prisma`는 1A 전담. 1B는 `*.dto.ts` 새 파일 위주

### Phase 2 — Canonical Mock Dataset Expansion (1.5d, 병렬 가능)
> 주의: `backend-integration-dev` 에이전트는 이 프로젝트에 없음 (team-config.md 명시). 통합 도메인 시드는 `backend-data-dev`가 흡수.
- 2A **backend-data-dev**: `mock-data-catalog.ts` 확장 — 11종목 전부, 매치 상태 전부, 결제 상태 전부, 팀 역할 전부, admin user 1, 빈 팀 1, 빈 venue 1, 토너먼트 3
- 2B **backend-data-dev**: chat rooms 12 + messages 200 (room 당 10~30, cursor 경계), notifications 50 (read/unread, 타입 8종), payment rows 15 (상태 5종 분산), reviews 30 (venue / match / team trust 6항목), badges user 분산
- 2C **backend-data-dev**: lesson tickets + ticket ownership + attendance 시드, team match applications 다건 상태 분산, mercenary applications 다건 상태 분산
- 2D **backend-data-dev**: dispute 3건 (open/in_review/resolved), settlement 5건
> Phase 2는 단일 에이전트가 순차로 4개 sub-task 진행 (같은 catalog 파일 쓰므로 병렬 불가). 혹은 catalog를 도메인 파일로 분할 후 각 파일 owner 분리하여 병렬.
- Gate: `pnpm db:seed:mocks` 실행 후 DB integrity query 통과 + Task 47 checksum-gated rerun idempotent

### Phase 3 — Controller/Guard Audit & Fix (1.5d, 병렬 가능)
- 3A **backend-api-dev**: marketplace / payments / settlements / disputes / admin controller 감사 + 누락 guard 추가 + pagination 통일
- 3B **backend-api-dev**: matches / team-matches / teams / mercenary / lessons / chat controller 감사 (이미 통과된 것 많음, diff만 패치)
- 3C **backend-api-dev**: reviews / venues / notifications / uploads / reports / tournaments / user-blocks / health controller 감사
> 3A/3B/3C는 서로 다른 controller 파일들을 담당하므로 병렬 3 에이전트 spawn 가능.
- 검증: 각 controller에 대응하는 `*.spec.ts`에 권한 실패 시나리오 최소 1건 추가 (unauth / wrong user / wrong role)

### Phase 4 — MSW Handlers + Unit Test Fixture Consolidation (1d, 병렬 가능)
- 4A **frontend-data-dev**: MSW handler 전수 재작성 (40+ → 60+), enum drift 해소, 도메인별 파일 분할 (`handlers/marketplace.ts` 등)
- 4B **frontend-data-dev**: 공유 fixture factory `apps/web/src/test/fixtures/` 도입 (페르소나·mock match 등), 기존 inline mock을 factory로 수렴
- 4C **backend-api-dev**: `apps/api/test/fixtures/` 확장 — 모든 phase 2 도메인에 대해 빌더 추가, inline mock에서 factory 호출로 이주
- Gate: `cd apps/web && pnpm test` 19 suites 초록, `cd apps/api && pnpm test` 22 suites 초록

### Phase 5 — Integration, E2E, Review, QA (1~1.5d, 순차 안에서 부분 병렬)
- 5A Integration: `pnpm --filter api test:integration` 4 suites 초록
- 5B E2E: `cd e2e && npx playwright test` 14 specs 초록. Task 66 미커버 화면 screenshot 확보
- 5C **backend-review + frontend-review** 병렬 리뷰 (Critical=0 gate)
- 5D QA 4명 병렬 시나리오 (qa-beginner/regular/power/uiux) — 확장 seed로 실제 UX 검증
- 5E docs-writer: README / DESIGN_DOCUMENT_MAP / CLAUDE.md 업데이트 (새 fixture / MSW 구조 / 권한 매트릭스)

---

## 6. User Scenarios (이 변경으로 가능해지는 것)

1. **QA가 "페이지네이션 경계"를 실제로 테스트할 수 있다** — matches 20+, chat messages 200+, listings 20+에서 cursor 2회 roundtrip.
2. **디자이너가 다크/라이트 × 11 종목 × 상태 6종 카드를 한 seed로 스크린샷할 수 있다** (Task 66 완성).
3. **개발자가 프론트에서 `sportType: 'SOCCER'` 같은 잘못된 값을 작성하면 `tsc`가 바로 실패한다** (SSoT 수렴).
4. **Admin 화면이 실제로 렌더링된다** — 현재 admin dispute/settlement 페이지가 0건으로 빈 상태만 보이는 문제 해소.
5. **Vitest 실행 시 모든 도메인이 MSW를 거친다** — chat detail / lesson / marketplace 테스트가 ad-hoc mock 없이 실행.
6. **보안 감사 결과가 task 문서에 기록되어** Phase 1-5 이후 재감사 시 diff만 보면 된다.

---

## 7. Priority Matrix

| 우선순위 | 항목 | Phase | 근거 |
|---------|------|-------|------|
| **P0** | MSW enum drift 4건 수정 | 4A | 현재 테스트가 잘못된 값으로 통과 중 — 거짓 초록 |
| **P0** | `types/api.ts` `sportType` 유니온화 | 1C | 컴파일-레벨 SSoT의 출발점 |
| **P0** | 11종목 전부 시드 | 2A | 사용자 요청의 핵심 — "실제 테스팅 할 정도" |
| **P0** | 매치/결제 상태 전부 시드 | 2A·2B | 상태 전이 UX 검증 불가 해소 |
| **P0** | 22 controllers guard/ownership 감사 | 3A·3B·3C | Principle 3 보안 |
| **P1** | Chat rooms/messages 볼륨 확장 | 2B | cursor 페이지네이션 + Task 66 |
| **P1** | `Record<string, unknown>` DTO 전환 | 1B | Principle 4 |
| **P1** | 공유 fixture factory (api + web) | 4B·4C | 재발 방지 |
| **P1** | Admin dispute/settlement 시드 | 2D | admin UX 검증 |
| **P1** | Notifications 50건, 타입 8종 | 2B | Task 12 delivery 완성 |
| **P2** | Cascade 정책 전수 점검 | 1A | 리스크 낮지만 Principle 4 |
| **P2** | 인덱스 보강 | 1A | 현재 병목 없으나 선제 대응 |
| **P2** | Swagger decorator 누락 보강 | 3A·3B·3C | API 문서 품질 |

---

## 8. Risks & Dependencies

| 리스크 | 영향 | 완화책 |
|-------|------|--------|
| Enum literal 변경이 기존 storage(JWT/session)와 충돌 | Auth 재발급 | Phase 1A migration은 enum 타입 자체를 바꾸지 않음 — 이미 lowercase. 변경은 프론트 타입/MSW 한정 |
| seed-mocks 확장이 checksum-gated rerun 로직과 어긋남 | deploy sync 실패 | Task 47 catalog version bump (`catalogVersion: 3`) 후 DB state key 재계산 |
| 22 controllers 감사 중 의도된 "public" 엔드포인트를 실수로 인증 가드 추가 | public 페이지 붕괴 | Phase 0에 public 엔드포인트 화이트리스트 먼저 확정 (health / auth/login / auth/register / public venues 조회 등) |
| `types/api.ts`의 `sportType: string` 28곳을 literal union으로 좁히면 기존 호출 측 깨짐 | 대량 lint fail | Phase 1C에서 호출 측까지 같은 커밋에 수정. `as SportType` cast 금지 (Principle 1) |
| MSW 핸들러 전수 재작성이 Vitest suite 초록 유지를 깨뜨림 | 회귀 | Phase 4A는 handler 파일만 추가하고 기존 handler는 점진 이전 → suite 단위 초록 확인 후 old handler 제거 |
| E2E가 확장 seed에 맞춰 깨짐 | 14 specs 다량 실패 | Phase 5B에 확장 seed 가정한 selector 수정 포함. E2E는 persona-based dev-login이므로 seed ID 의존은 제한적 |
| 22 controllers × 감사 체크리스트가 시간 초과 | phase 3 지연 | 기존 통과 모듈(matches/teams/team-matches — Task 10/17/23/24/35에서 이미 hardened)은 diff만 재확인, 감사 시간을 marketplace/payments/settlements/disputes/admin/reports에 집중 |
| Dependency: Task 66 E2E screenshot 미커버분이 Task 67 seed 없이 마감 불가 | Task 66 블락 | Task 66 잔여 screenshot은 Task 67 Phase 2 완료 후로 재스케줄 (오늘 문서 상단에 명시) |
| Frontend `teamConfig: Record<string, unknown>` 전환 시 사용처 찾기 | 숨은 런타임 파싱 | `grep -r "teamConfig"` 후 각 소비처에 전용 파서 주입 |

---

## 9. Acceptance Criteria (측정 가능)

### 데이터 볼륨
- seed-mocks 실행 후:
  - users ≥ 20 (11종목 커버 + admin 1 + 빈 팀 소유자 1)
  - sport profiles ≥ 25 (11종목 전부)
  - teams ≥ 12 (빈 팀 1 포함)
  - matches ≥ 20 (상태 6종 전부)
  - team-matches ≥ 10 (상태 분산)
  - team match applications ≥ 15 (pending/approved/rejected)
  - mercenary posts ≥ 15 + applications ≥ 20
  - listings ≥ 20 + orders ≥ 10 (상태 분산)
  - lessons ≥ 12 + ticket plans ≥ 18 + ticket ownership ≥ 20 + attendance ≥ 30
  - chat rooms ≥ 12 + messages ≥ 200
  - reviews ≥ 30 (venue + match + team trust)
  - notifications ≥ 50 (타입 8종 + read/unread)
  - payments ≥ 15 (상태 5종 전부)
  - disputes ≥ 3 / settlements ≥ 5 / tournaments ≥ 3

### 타입/컨트랙트
- `apps/web/src/types/api.ts`에 `Record<string, unknown>` grep 결과 **0건** (JSON 필드 모두 전용 타입)
- `apps/web/src/types/api.ts`에 `sportType: string` grep 결과 **0건** (전부 `SportType`)
- `apps/api/src/**/*.dto.ts`에 `@Body() ... : any` grep 결과 **0건**
- MSW handler enum drift (`'SOCCER'`) grep 결과 **0건**
- MSW handler route 수 ≥ 60, 도메인별 파일 분할 완료

### 보안/API
- 22 controllers 감사 표에 ALL PASS 마크, Ambiguity Log에 예외 기록 없음
- 모든 mutation 엔드포인트 `JwtAuthGuard` 적용 (health/auth/public venues 제외)
- 모든 admin 엔드포인트 `AdminGuard` 적용
- 응답 envelope `{ status, data, timestamp }` 100% 준수

### 테스트
- `cd apps/api && pnpm test` — 22 suites 초록 (+ 권한 fail 케이스 각 controller 1건 이상)
- `cd apps/api && pnpm test:integration` — 4 suites 초록
- `cd apps/web && pnpm test` — 19 suites 초록
- `cd e2e && npx playwright test` — 14 specs 초록
- `pnpm --filter web exec tsc --noEmit` — 0 error
- `pnpm --filter api exec tsc --noEmit` — 0 error
- `pnpm lint` — 0 error

### 재현성
- `pnpm db:seed:mocks` 2회 실행 idempotent (레코드 수 변화 없음)
- `pnpm db:seed:mocks:deploy` checksum skip 동작
- `DEPLOY_SYNC_MOCK_DATA=false`일 때 skip 로그만

---

## 10. Tech Debt Resolved (범위 내 해소 명시)

1. MSW handler `'SOCCER'` 대소문자 drift (4곳)
2. `types/api.ts` `sportType: string` weak typing (28곳)
3. `types/api.ts` `teamConfig: Record<string, unknown>` (2곳)
4. `apps/api/src/**/*.dto.ts`의 잔존 `any` / `Record<string, unknown>` (Phase 0 audit 결과 반영)
5. Seed coverage 구멍 — 4 종목 미시드, 매치 상태 5개 미시드, 결제 상태 4개 미시드, 팀 역할 2개 미시드
6. Task 66 미커버 E2E screenshot (admin / chat detail / payment history / review list)
7. Inline unit mock 산발 — 공유 fixture factory로 수렴
8. Chat messages 1건뿐 — cursor pagination 경계 검증 불가
9. Admin 화면 빈 상태만 렌더 — dispute/settlement 0건
10. `filter.limit || 20` 같은 `||` 기본값 잔존 (있다면) → `??`

---

## 11. Security Notes

### Phase 3 감사 체크리스트 (controller × 행 형태로 baseline audit 문서에 확정)

각 controller에 대해 아래 행 전부 마크:

- [ ] JwtAuthGuard 적용 (public 엔드포인트는 명시적 화이트리스트에만 제외)
- [ ] AdminGuard 적용 (관리자 전용만)
- [ ] `@CurrentUser()`로 userId 추출 후 서비스가 ownership/membership 재검증
- [ ] Mutation 시 Prisma query가 `where: { id, userId }` 또는 membership 조건 포함
- [ ] DTO `class-validator` 데코레이터 누락 없음 (`@IsString` / `@IsEnum(SportType)` / `@IsInt` 등)
- [ ] 중첩 JSON은 전용 DTO + `@ValidateNested() @Type(() => Dto)`
- [ ] 응답에서 `passwordHash` / `refreshToken` / OAuth provider token 제거
- [ ] SQL raw query 0건 또는 파라미터 바인딩 확인
- [ ] 파일 업로드는 size/mime whitelist
- [ ] 에러 응답이 내부 stack/trace를 외부에 노출하지 않음

### Phase 1 추가
- Open Redirect: `sanitizeRedirect()` 적용 지점이 전부인지 grep 재확인
- `dangerouslySetInnerHTML`: 프론트 전수 grep, 허용 지점(랜딩 정적 블록 등) 외 0

### 시크릿
- `.env*` 에 VAPID 키, OAuth secret, Toss secret이 모두 `.env.example` 키만 존재하고 실제 값 미커밋 확인 (seed 확장과 무관하게 재검)

---

## 12. Parallel Work Breakdown (Phase × Agent 매트릭스)

| Phase | backend-data-dev | backend-api-dev | frontend-data-dev | frontend-ui-dev | infra-devops-dev |
|-------|------------------|------------------|-------------------|------------------|------------------|
| 0 | audit table 작성 지원 | audit table 작성 주도 (backend-review agent 활용) | — | — | — |
| 1 | **1A schema/migration** | **1B DTO 전환** | **1C types/api.ts** | — | — |
| 2 | **2A catalog expand** + **2B chat/notif/payments/reviews** + **2C tickets/apps** + **2D dispute/settlement** (순차 또는 catalog 분할 후 병렬) | — | — | — | — |
| 3 | — | **3A marketplace/payments/settlements/disputes/admin** + **3B matches/teams/team-matches/mercenary/lessons/chat** + **3C reviews/venues/notifications/uploads/reports/tournaments/user-blocks/health** (3 병렬) | — | — | — |
| 4 | — | **4C apps/api/test/fixtures** | **4A MSW handlers** + **4B apps/web/src/test/fixtures** | — | — |
| 5 | — | 리뷰 대응 | 리뷰 대응 | **5B E2E selector fix** | — |

### Shared file 충돌 방지
- `schema.prisma` — 1A 전담
- `types/api.ts` — 1C 전담
- `mock-data-catalog.ts` — 2A 전담 (2B/2C/2D는 새 catalog 파일 또는 섹션 분리)
- `handlers.ts` — 4A 전담, 단 도메인 파일 분할 후 병렬 가능
- `apps/web/src/test/fixtures/` / `apps/api/test/fixtures/` — 파일 단위로 owner 1명

---

## 13. Ambiguity Log

| 날짜 | 항목 | 결정 |
|------|------|------|
| 2026-04-14 | "목데이터 양"을 어디까지 늘릴지 | Acceptance Criteria의 최소 볼륨 수치로 고정 (users≥20, matches≥20, chat messages≥200 등) |
| 2026-04-14 | Task 47과의 중복 회피 | Task 47 `seed-mocks.ts` / catalog 확장 방식 유지, full `seed.ts`는 건드리지 않음 |
| 2026-04-14 | 옵션 A/B/C 중 선택 | 옵션 C — user ask "모두 검증" 준수 (Principle 5) |
| 2026-04-14 | `sportType: string` → literal union 범위 | 프론트 `types/api.ts`만 좁히고 백엔드는 이미 enum이므로 추가 변경 없음. MSW는 literal union 참조 |
| 2026-04-14 | Admin user seeding — 실제 admin 권한 줄지 | Yes — admin role user 1명 + admin 전용 화면 QA를 위한 별도 persona `admin` (이미 test/fixtures/personas.ts에 존재) 시드 재확인 |
| 2026-04-14 | `teamConfig` 구조 | Phase 1B에서 domain 별 shape 재정리. 후보: `{ maxRoster, positions, ruleOverrides }`. 기존 row 마이그레이션은 fill-with-default |

---

## 14. Validation Commands (task 종료 전 반드시 실행)

```bash
# Phase 1
pnpm --filter api exec prisma format
pnpm --filter api exec prisma validate
pnpm --filter api db:migrate
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit

# Phase 2
pnpm --filter api db:seed:mocks
pnpm --filter api db:seed:mocks  # idempotency
DEPLOY_SYNC_MOCK_DATA=false pnpm --filter api db:seed:mocks:deploy  # opt-out
pnpm --filter api db:seed:mocks:deploy  # checksum-gate

# Phase 3
cd apps/api && pnpm test

# Phase 4
cd apps/web && pnpm test
cd apps/api && pnpm test

# Phase 5
cd apps/api && pnpm test:integration
cd e2e && npx playwright test
pnpm lint
```

---

## 15. Handoff

- tech-planner는 본 문서를 받아 Phase 0 baseline audit 부록을 `.github/tasks/67-baseline-audit.md`로 작성 후 Phase 1 분기.
- 빌더 에이전트는 Core Principle 6에 따라 모호함 발견 시 즉시 `BLOCKED: ...` 보고 → 본 문서 Ambiguity Log 갱신 → 재핸드오프.
- 리뷰/QA는 Section 9 Acceptance Criteria를 pass 기준으로 사용.

---

**Status: Planning Approved — Phase 0로 진행 권고**
