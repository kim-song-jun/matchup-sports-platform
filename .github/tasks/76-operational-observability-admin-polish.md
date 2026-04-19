# Task 76 — Operational Observability + Admin Polish

Owners: project-director + tech-planner
Drafted: 2026-04-19
Status: Draft — awaiting confirmation of A1 (chart lib), A2 (alert channel), A3 (refresh cadence)

---

## Context

Task 73 (idempotency sweep, merged 2026-04-19) 로 관리자 재처리가 안전해졌고, Task 74 (웹 푸시 실활성화, merged 2026-04-19) 로 알림 fan-out 이 실제 디바이스까지 도달하기 시작했다. 동시에 Task 70 (마켓플레이스 결제 라이프사이클) 에서 `Dispute`, `DisputeEvent`, `Payout` 도메인과 `/admin/disputes`, `/admin/payouts/*` API 가 정착했지만 **운영 측 시야(visibility)** 가 일부만 채워진 상태다.

현재 한계 요약 (2026-04-19 감사 기준):

1. `apps/web/src/app/admin/dashboard/page.tsx` — 기본 카운터만 표시. 진행 중 매치·대기 결제·분쟁 open·정산 대기를 **한 화면에서 교차 확인하는 화면이 없다**.
2. `apps/web/src/app/admin/disputes/` 목록/상세는 존재하나, **resolve 액션(refund/release/dismiss)은 API 만 뚫려 있고 UI 버튼/모달이 분산**되어 있다 (`dispute-resolve-modal.tsx` 는 Task 70에서 추가됐지만 상세 페이지 흐름이 산만하다는 리뷰 피드백 존재).
3. `apps/api/src/notifications/web-push.service.ts` 의 `web-push failed` 로그는 `Logger.warn` 한 줄뿐 — **집계·임계치 초과 알람이 없다**. Task 74 의 C9 가 "30일 rolling 95% 성공률" 목표만 세웠고, 임계치 초과 시 누가 어떤 채널로 받는지 미정.
4. `apps/web/src/app/admin/payouts/page.tsx` 는 Task 70의 `PayoutBatchBuilder` 기반이지만, 실패(`failed`) payout 재시도 경로 + 주간 집계 차트가 없어 재무팀이 스프레드시트로 역계산하는 상태.

Task 76 은 이 네 개 공백을 "신규 chart lib 도입 없이" 기존 API + Tailwind CSS 기반 시각화로 메운다. 전체 규모는 **Medium (2~3일, ~1,300 LOC)** 로 제한한다.

---

## Goal

1. `/admin/ops` 단일 화면에서 실시간 매치, 대기 결제, 분쟁 open, 정산 대기, 알림 발송 실패 지표를 한눈에 확인
2. 분쟁 상세 페이지에서 resolve 워크플로우(review → resolve) 가 단일 선형 흐름으로 정리됨
3. 웹 푸시 전송 실패가 임계치(5분 Rolling 10건 또는 5% 초과)를 넘으면 외부 알람 채널로 자동 통지
4. `/admin/payouts` 에 실패 payout 재시도 UI + 주간 집계 CSS 막대 차트 추가
5. 기존 chart 라이브러리 없음 → **Tailwind + SVG 인라인 바** 로만 시각화 (A1 결정)

---

## Original Conditions (verbatim)

- [ ] **C1** 신규 백엔드 모듈 `apps/api/src/admin/ops/` 생성 — `admin-ops.module.ts` / `admin-ops.controller.ts` / `admin-ops.service.ts`. 기존 `AdminModule` 에서 import.
- [ ] **C2** `GET /admin/ops/summary` — 단일 응답으로 다음 지표 반환 (모든 count 는 Prisma `count` / `aggregate` 한 번 씩, `Promise.all` 로 병렬 실행):
  - `matchesInProgress` — `Match.status = ongoing` (또는 최근 3시간 내 `scheduledAt` + 미종료)
  - `paymentsPending` — `Payment.status in (pending, processing)` 중 `createdAt > now - 24h`
  - `disputesOpen` — `Dispute.status in (filed, seller_responded, admin_reviewing)`
  - `settlementsPending` — `SettlementRecord.status in (pending, held)` 중 `payoutId is null`
  - `payoutsFailed` — `Payout.status = failed`
  - `pushFailures5m` — 최근 5분 웹 푸시 실패 카운터 (C5 메트릭 스토어 조회)
  - 응답 shape 는 `AdminOpsSummaryDto` (class-validator DTO 불필요, 읽기 전용이므로 plain interface + Swagger `ApiProperty`)
- [ ] **C3** `GET /admin/ops/recent-push-failures?limit=20` — 최근 실패 목록. WebPushFailureLog 테이블 기반 (C5 스키마). PII 제거 — endpoint 마지막 6자만 + userId hash (sha256 8자).
- [ ] **C4** `POST /admin/ops/push-failures/ack` — 운영자가 현재 윈도 실패를 "확인" 처리 (`acknowledgedAt` 타임스탬프 기록). 알람 재트리거 방지용. `AdminGuard` 필수.
- [ ] **C5** Prisma schema 추가 — `WebPushFailureLog { id, userId, subscriptionId, statusCode, errorCode, occurredAt, acknowledgedAt?, endpointSuffix String(6) }` + migration `YYYYMMDD_add_web_push_failure_log`. `WebPushService.sendToUser` 에서 410/404 이외 실패 시 `occurredAt=now()` 로 row 삽입 (fire-and-forget, create 실패 해도 원 flow 중단 금지).
- [ ] **C6** `WebPushAlertService` (`apps/api/src/notifications/web-push-alert.service.ts` 신규) — 5분 Rolling 윈도로 실패 건수·비율 계산. 임계치(10건 OR 5%) 초과 시 외부 채널 (A2 결정 — Slack webhook 또는 logger-only fallback) 통지. `acknowledgedAt` 이 최근 5분 내 존재하면 중복 알람 skip. Cron `@Cron(CronExpression.EVERY_MINUTE)` 또는 on-write-threshold 훅 중 택1 (tech-planner 권장: 매 분 cron, load 낮음).
- [ ] **C7** 프론트엔드 `/admin/ops/page.tsx` 신규 — 5개 KPI 카드 (Matches / Payments / Disputes / Settlements / Pushes) 2x3 그리드 + 최근 푸시 실패 테이블 + 분쟁·정산으로 가는 deep-link. 실시간 갱신은 React Query `refetchInterval: 30_000` (A3 결정, 30초) — 웹소켓 불필요.
- [ ] **C8** `/admin/disputes/[id]/page.tsx` 재배치 — 기존 `dispute-resolve-modal.tsx` 를 상세 페이지 우측 상단 "해결 처리" 버튼으로 통합. status=`filed|seller_responded|admin_reviewing` 에서만 노출. resolve 완료 후 `['admin-dispute', id]` + `['admin-disputes']` + `['admin-ops-summary']` invalidate.
- [ ] **C9** `/admin/payouts/page.tsx` 확장:
  - (a) 실패 payout 섹션 (상단 고정) — `Payout.status = failed` 리스트 + "재대기열로 복원" 버튼 (기존 `useMarkPayoutFailed` 후 재조회 대신 서버에 복원 엔드포인트가 이미 있으면 재사용, 없으면 C10 에서 추가)
  - (b) 주간 집계 시각화 — 최근 4주 payout 합계를 Tailwind `bg-blue-500` + `h-[40px]` 인라인 bar 로 표시. 숫자도 병기 (컬러 only 금지).
- [ ] **C10** 서버 측 `POST /admin/payouts/:id/retry` — 실패 payout 의 settlement 들을 `payoutId=null` 로 재복원하고 `Payout.status=cancelled` 기록 (또는 기존 `mark-failed` 의 재대기열 경로 재사용). Task 70 의 `mark-failed` 가 이미 재대기열 기능을 수행하면 C10 은 신규 엔드포인트 생략하고 프론트에서만 라벨 변경.
- [ ] **C11** Admin Ops realtime push (선택) — `RealtimeGateway` 에 `emitToAdmins(event, payload)` 헬퍼 추가 (admin user room `admin:ops` 조인). `/admin/ops` 방문 시 socket 구독 → push 실패 알람 도착 시 toast. **Wave 2 에 배치** — 코어 5 KPI 카드가 refetchInterval 로 충분하면 C11 생략 가능 (A3 fallback).
- [ ] **C12** 알림 실패 로그 PII guard — `WebPushFailureLog.endpointSuffix` 는 반드시 마지막 6자 slice, 풀 endpoint 저장 금지. `userId` 는 FK 유지하되 외부 webhook payload 에는 sha256 hash 8자만 전달. spec (C13) 에서 검증.
- [ ] **C13** 테스트:
  - `admin-ops.service.spec.ts` — summary aggregation + 각 KPI 카운터
  - `web-push-alert.service.spec.ts` — 임계치 판정 + ack 중복 suppress
  - `admin-ops.e2e-spec.ts` 통합 — `AdminGuard` 차단 + summary shape 검증
  - `admin/ops/page.test.tsx` (Vitest + RTL) — KPI 카드 렌더 + empty state
  - MSW handler: `GET /admin/ops/summary`, `GET /admin/ops/recent-push-failures`, `POST /admin/payouts/:id/retry` (C10 분기 시)
- [ ] **C14** 디자인 일관성 — 모든 신규 카드 `dark:bg-gray-800` / `dark:text-white` / `min-h-[44px]` 터치 타겟 / `aria-label` 완비. `components/ui/empty-state.tsx` 사용 (분쟁 0건, 실패 푸시 0건). chart 라이브러리 추가 금지.

---

## User Scenarios (admin 관점)

### S1 — 아침 운영 체크 (C7)
Ops 담당자가 `/admin/ops` 방문. 한 화면에서 "진행 중 매치 12 / 대기 결제 3 / open 분쟁 2 / 정산 대기 17 / 지난 5분 푸시 실패 4" 확인. 분쟁 카드 클릭 → `/admin/disputes?status=admin_reviewing` 로 이동.

### S2 — 분쟁 resolve 선형 흐름 (C8)
관리자가 `/admin/disputes/[id]` 에서 증빙 메시지 스레드 확인 → 우측 상단 "해결 처리" 버튼 클릭 → `DisputeResolveModal` 오픈 → `action=refund, note="배송 누락 확인"` 제출 → `PATCH /admin/disputes/:id/resolve` 성공 → modal close + 페이지 상태 `resolved` 로 갱신 + `/admin/ops` summary 도 반영.

### S3 — 푸시 실패 급증 알람 (C6)
오후 3시 VAPID endpoint 가 일시 장애 → 5분간 15건 실패 → `WebPushAlertService` 가 Slack webhook 으로 "web push failure burst: 15/5min (threshold 10)" 통지. 담당자가 `/admin/ops` 에서 상세 테이블 확인 → 원인(410 아닌 5xx) 확인 후 ack 처리 → 동일 5분 윈도 안에서는 재알람 suppress.

### S4 — 실패 payout 재시도 (C9/C10)
재무팀이 `/admin/payouts` 상단 "실패 payout (2건)" 섹션에서 원인 확인 (`reason: bank_rejected`) → "재대기열 복원" 클릭 → 연결된 settlements 가 `payoutId=null` 로 복원 + 상단 알림 "2건 재대기 처리됐어요". 이후 주간 집계 bar 에도 반영.

---

## Test Scenarios

### Happy path
- **C2·C7**: summary endpoint 가 5개 KPI 숫자 + pushFailures5m 를 200 내 1초 미만 응답 (병렬 count `Promise.all`)
- **C6**: 5분 윈도 10건 실패 주입 → Slack webhook mock 1회 호출 확인
- **C8**: resolve 모달에서 refund 선택 → Toss cancel 스텁 호출 + Dispute `resolved` + Order `refunded` + event row 기록
- **C9**: failed payout 있는 상태에서 페이지 상단 섹션 렌더 + 재시도 버튼 클릭 → settlements `payoutId=null` 복원 확인

### Edge cases
- **C2**: 모든 KPI 가 0 일 때 카드에 `EmptyState` 아닌 숫자 0 표시 + 라벨. `/admin/ops` 자체 빈 상태는 불가 (관리자는 항상 접근 가능)
- **C5**: 실패 로그 DB insert 실패 (예: 장애) → 원 push 흐름 영향 없음 (fire-and-forget + try/catch swallow)
- **C6**: threshold 미만(예: 9건) → 알람 없음, ack 없음
- **C6**: ack 후 5분 경과 → 동일 burst 재발생 시 알람 재트리거
- **C7**: React Query refetchInterval 이 탭 백그라운드에서 동작 (document hidden 시 일시 정지 OK)
- **C9**: failed payout 0건이면 상단 섹션 숨김. 주간 집계 데이터 부족 시(첫 주) bar 1개만 렌더

### Error cases
- **C4**: 비관리자의 ack 시도 → `AdminGuard` 403
- **C6**: Slack webhook URL 없음 → logger-only fallback, 예외 throw 금지
- **C10**: 이미 `paid` 된 payout retry 시도 → 409 `PAYOUT_NOT_RETRIABLE`
- **C12**: 로그 grep 으로 full endpoint 유출 금지 검증 — spec 에서 `endpointSuffix.length === 6` assert

### Mock / fixture updates
- `apps/api/test/fixtures/ops.ts` 신규 — `createWebPushFailure(userId, statusCode)` factory
- 기존 `apps/api/test/fixtures/payouts.ts` — failed payout factory 확장
- `apps/web/src/test/msw/handlers.ts` — `/admin/ops/*` 3개 핸들러 추가
- `admin-ops.service.spec.ts` inline mock — 5 KPI prisma stub

---

## Parallel Work Breakdown

### Wave 0 (sequential — schema + constants)
- **[backend-data-dev]** `apps/api/prisma/schema.prisma` — `WebPushFailureLog` 모델 추가 + migration 작성 + `pnpm db:migrate` 로컬 검증. `apps/api/src/common/constants/ops.ts` 에 `PUSH_ALERT_WINDOW_MS=5*60_000`, `PUSH_ALERT_COUNT_THRESHOLD=10`, `PUSH_ALERT_RATE_THRESHOLD=0.05` 상수 상수화.

### Wave 1 (parallel — 4 tracks)
- **Track A — backend-api-dev**: `admin-ops.controller.ts` + `admin-ops.service.ts` + DTO. `AdminOpsModule` 를 `AdminModule` 에 주입. Swagger 문서화. `C1–C4`, `C10` (필요 시).
- **Track B — backend-integration-dev**: `WebPushAlertService` 구현 + `WebPushService.sendToUser` 에서 failure log write hook + Slack webhook 연동 (env `OPS_ALERT_WEBHOOK_URL` 없으면 logger-only). `web-push-alert.service.spec.ts`. `C5·C6·C12`. (선택) `RealtimeGateway.emitToAdmins` 헬퍼 추가 = C11.
- **Track C — frontend-ui-dev**: `/admin/ops/page.tsx` + `components/admin/kpi-card.tsx` + `components/admin/push-failure-table.tsx` + `components/admin/weekly-payout-bars.tsx` (Tailwind SVG 막대). `/admin/payouts/page.tsx` 상단 failed 섹션 확장. `/admin/disputes/[id]/page.tsx` resolve 버튼 통합. admin layout 에 `/admin/ops` 네비 추가. `C7·C8·C9·C14`.
- **Track D — frontend-data-dev**: 훅 신규 — `useAdminOpsSummary()`, `useRecentPushFailures()`, `useAckPushFailures()`, `useRetryPayout()` (C10 여부에 따라). `useResolveDispute` 에 `['admin-ops-summary']` invalidate 추가. MSW 핸들러. RTL 테스트.

### Wave 2 (integration)
- `pnpm db:migrate` 실제 실행
- 전체 테스트 + 통합 스위트
- `pnpm test:integration -- admin-ops`
- 수동 브라우저 smoke — `/admin/ops` 5개 KPI 숫자 실제 데이터로 확인, 5분 실패 burst 시뮬레이션으로 Slack webhook fire 확인 (staging)
- 재무팀/운영팀 사용자 인터뷰 — 주간 bar 차트가 의도한 집계인지 확인 (A3 fallback 조정)

---

## Verification & Validation

### Pre-merge checks
```bash
# Backend
cd apps/api
pnpm lint && npx tsc --noEmit && pnpm build
pnpm test                                # admin-ops + web-push-alert spec
pnpm test:integration -- admin-ops       # AdminGuard + summary shape

# Frontend
cd apps/web
npx tsc --noEmit && pnpm lint && pnpm test
pnpm test admin/ops                      # KPI 카드 RTL
```

### Migration 검증
```bash
cd apps/api
pnpm prisma migrate dev --name add_web_push_failure_log --create-only
# 확인 후
pnpm prisma migrate dev
# 롤백 시나리오
pnpm prisma migrate resolve --rolled-back <timestamp>_add_web_push_failure_log
```

### Manual smoke (staging)
1. **C2·C7** — `/admin/ops` 방문 → 5 KPI 카드 모두 숫자 표시 + 30초 후 자동 갱신 (React Query devtools 로 refetch 확인)
2. **C6** — staging 에서 VAPID privateKey 를 의도적으로 잘못된 값으로 변경 → 5분간 요청 발생 → `WebPushAlertService` 가 Slack webhook (또는 logger) 호출 1회
3. **C8** — 분쟁 상세에서 "해결 처리" 버튼 → modal → refund 제출 → modal close + 상태 `resolved` + `/admin/ops` 의 disputesOpen 감소
4. **C9** — admin/payouts 상단 failed 섹션 렌더 (테스트 fixture 주입) → 재시도 클릭 → settlements 재대기열 복원
5. **C12** — `grep -E "endpoint=.{50,}" api.log` → 0 hit (풀 endpoint 누출 없음)

### Post-deploy validation
- 첫 1시간: `/admin/ops` 500/401 에러율 < 0.1%
- 첫 24시간: 푸시 실패 알람 오탐(false positive) 수 수동 집계. 10건 이상이면 threshold 재조정 트리거
- 1주일: 주간 bar 차트 데이터 일치 검증 (`SELECT date_trunc('week', paidAt), SUM(netAmount) FROM payouts WHERE status='paid'` 와 UI 값 일치)

### Rollback plan
- **부분 rollback**: `/admin/ops` 페이지만 숨김 (네비 제거) + API 는 유지. admin layout revert 1줄
- **전체 rollback**: `git revert <merge-commit>` + migration `prisma migrate resolve --rolled-back`
- **알람 비활성**: `OPS_ALERT_WEBHOOK_URL` env 제거 → logger-only fallback 으로 자동 안전 모드

### Regression surface
- 기존 `/admin/disputes/[id]` resolve modal 동작 — Task 70 스펙 대비 회귀 확인
- `/admin/payouts` 기존 batch builder — 상단 failed 섹션 추가로 레이아웃 깨짐 없는지
- `WebPushService.sendToUser` — failure log write 실패해도 원 push 흐름 영향 없는지 (fire-and-forget swallow)
- `AdminGuard` 적용된 기존 엔드포인트 13개 — 신규 `/admin/ops/*` 4개 추가로 수는 17개. admin.controller.spec.ts 의 guard 검증 회귀 없음

---

## Acceptance Criteria

1. `/admin/ops` 5개 KPI 카드 + 최근 푸시 실패 테이블이 30초 interval 로 갱신
2. 분쟁 상세에서 resolve 버튼 → modal → action 제출이 단일 흐름으로 완료
3. 5분 10건 실패 burst 발생 시 Slack webhook (또는 logger) 알람 1회 트리거, ack 후 중복 suppress
4. `/admin/payouts` 상단 failed 섹션 + 재시도 UI + 주간 집계 bar 차트 렌더
5. 신규 Prisma 모델 `WebPushFailureLog` 마이그레이션 성공 + rollback 검증
6. 신규 endpoint 4개 `AdminGuard` 적용, 비관리자 403
7. 신규 integration/unit/RTL 테스트 7건 통과, 기존 스위트 무회귀
8. 모든 신규 UI 다크모드 + 44px 터치 + aria-label 완비, 컬러 only 정보 전달 없음
9. chart 라이브러리 의존성 추가 0 (`apps/web/package.json` diff 에 신규 chart 패키지 없음)

---

## Tech Debt Resolved

- Task 70 Deferred 항목 "판매자/재무팀 독립 대시보드" 중 **운영자 대시보드 파트** 해소 (판매자 대시보드는 별도 task)
- Task 74 C9 "30일 rolling 95% 성공률" 목표의 **측정·알람 파이프라인** 보강
- `/admin/disputes/[id]` resolve UX 분산 → 단일 진입점 통합
- Slack webhook 시크릿 경로 표준화 (`OPS_ALERT_WEBHOOK_URL`) — 이후 다른 ops 알람(cron 실패 등)에서 재사용
- 실패 payout 재시도 수동 SQL 작업 제거 (재무팀 요청 사항)

---

## Security Notes

- **AdminGuard**: 신규 엔드포인트 `GET/POST /admin/ops/*`, `POST /admin/payouts/:id/retry` 전부 `@UseGuards(JwtAuthGuard, AdminGuard)` 필수. admin-ops.controller.spec 에서 guard 검증.
- **PII redaction**: `WebPushFailureLog.endpointSuffix` 는 **정확히 6자**. 풀 endpoint 저장 / 로그 출력 금지. 외부 webhook payload 의 `userId` 는 sha256 hash 8자만. spec (C13) 에서 regex 로 검증.
- **Secret management**: `OPS_ALERT_WEBHOOK_URL` 은 `.env` 및 GitHub Actions secret. 코드·로그·응답 body 에 URL 전체 출력 금지. `WebPushAlertService` 생성자에서 `config.get` 후 기록 없음.
- **분쟁 resolve audit**: admin 이 refund/release/dismiss 할 때마다 `DisputeEvent` 에 `actorRole=admin` + `actorId` + `note` 필수 기록. Task 70 의 기존 audit trail 재사용, 신규 기록 누락 없는지 spec 검증. 관리자의 임의 환불은 반드시 DB 로그 + Toss cancel API response 저장.
- **Rate limiting**: `GET /admin/ops/summary` 는 refetchInterval 30s × N 관리자 → 서버 부담 있음. `@Throttle({ limit: 120, ttl: 60_000 })` per-admin user 적용 (관리자 수 적으므로 여유 있게).
- **CSRF**: admin UI 는 동일 도메인 + JWT Authorization 헤더 → CSRF 영향 없음 (기존 규약 유지).
- **Slack webhook 보안**: webhook URL 자체가 시크릿. 실수 커밋 방지를 위해 `.env.example` 에는 `OPS_ALERT_WEBHOOK_URL=` 빈 값만. 실제 값은 secret store.

---

## Risks & Dependencies

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| R1 | `WebPushFailureLog` 테이블 급격한 row 증가 | Medium | 30일 이상 row 는 별도 cleanup cron (범위 밖, Task 77 이후 고려). 초기에는 지표 수집 우선 |
| R2 | Slack webhook rate limit (1 req/sec) 초과 | Low | `WebPushAlertService` 내부 debounce — 같은 5분 윈도에서 한 번만 발송, ack 로 suppress |
| R3 | React Query refetchInterval 이 탭 다수 오픈 시 서버 부하 | Medium | per-admin throttle(C13 verification). 필요 시 30s → 60s 완화 (A3 fallback) |
| R4 | Chart lib 없이 bar 시각화가 재무팀 기대에 못 미침 | Low | Tailwind `bg-blue-500` + 숫자 병기로 본질 충족. 추후 chart lib 도입은 별도 task |
| R5 | `/admin/ops` 실시간 요구 과도 (C11 realtime) → Socket.IO 부하 | Medium | Wave 2 옵션으로 배치, refetchInterval 가 충분하면 생략 |
| R6 | 분쟁 resolve modal 통합으로 기존 QA 시나리오 깨짐 | Low | QA 라운드에서 Task 70 dispute 시나리오 전량 재실행 |
| R7 | `WebPushAlertService` cron 이 테스트 환경에서 자동 기동 → 노이즈 | Low | `DISABLE_OPS_ALERT_CRON=true` 플래그로 테스트 환경 비활성 (Task 70 cron 선례 재사용) |

### Dependencies
- **Task 73 (idempotency sweep, merged)** — admin 재처리 안전성 확보 (precondition satisfied)
- **Task 74 (VAPID 실활성, merged)** — 실패 로그 수집의 대상 데이터 확보 (precondition satisfied)
- **Slack workspace webhook URL** (A2 가 Slack 선택 시) — 운영자 수동 발급 필요
- **기존 `@nestjs/schedule` cron infra** (Task 70 에서 marketplace cron 용으로 도입됨) — 재사용, 별도 설치 없음

---

## Ambiguity Log

| ID | 질문 | 기본안 | 답변 대기 대상 |
|----|------|-------|----------------|
| A1 | Chart 라이브러리 선택 — recharts/chart.js 도입 vs 기존 Tailwind+SVG 인라인 | **Tailwind + 인라인 SVG bar** (package.json 에 chart lib 0건, 번들 크기 보호) | project-director 승인 |
| A2 | 푸시 실패 알람 외부 채널 — Slack webhook / Sentry / Discord / 이메일 / logger-only | **Slack webhook 1순위, 미설정 시 logger-only fallback** (env `OPS_ALERT_WEBHOOK_URL` 없으면 자동 fallback) | 사용자 (운영팀 채널 확정) |
| A3 | `/admin/ops` 실시간 갱신 주기 — 10s / 30s / 60s / Socket.IO | **30초 React Query refetchInterval**. 부하 이슈 시 60초로 완화. Socket.IO (C11) 은 Wave 2 옵션 | tech-planner |
| A4 | 푸시 실패 임계치 수치 — 5분 10건(count) + 5%(rate) | **count OR rate 둘 중 하나 초과 시 알람** (OR 조건) | 운영팀 초기 값, 배포 후 튜닝 |
| A5 | 주간 payout bar — 4주 / 8주 / 12주 | **4주** (스크린 폭 제약, 모바일 admin 대응) | 재무팀 |
| A6 | `WebPushFailureLog` 보관 기간 | **무제한 (Task 76 범위)** → cleanup cron 은 별도 후속 | tech-planner (Task 77 이후) |
| A7 | realtime admin room (C11) 구현 여부 | **Wave 2 옵션, 필수 아님** | 리뷰 후 결정 |

---

## Complexity Estimate

**Medium** — 2~3일, ~1,300 LOC

| Item | Complexity | Est. LOC |
|------|------------|----------|
| Prisma `WebPushFailureLog` + migration | Low | ~60 |
| `admin-ops` module (controller/service/DTO) | Medium | ~260 |
| `WebPushAlertService` + cron + Slack webhook | Medium | ~200 |
| `WebPushService` hook (failure log write) | Low | ~40 |
| `/admin/ops` 페이지 + 3 컴포넌트 + layout nav | Medium | ~340 |
| `/admin/payouts` failed 섹션 + weekly bars | Medium | ~180 |
| `/admin/disputes/[id]` resolve 통합 | Low | ~80 |
| 훅 4개 + MSW 핸들러 3개 | Low | ~120 |
| Spec + integration + RTL (7건) | Medium | ~260 |
| Realtime `emitToAdmins` (C11, optional) | Low | ~60 |
| **Subtotal (C11 포함)** | **Medium** | **~1,600** |
| **Subtotal (C11 제외, 기본안)** | **Medium** | **~1,540** |

LOC 는 테스트 포함. 기존 파일 수정 (`AdminModule`, `admin/layout.tsx`, `/admin/payouts/page.tsx`, `/admin/disputes/[id]/page.tsx`, `use-admin.ts`) 5건 + 신규 파일 ~12건.

---

## Handoff Checklist

- [ ] A1 (chart lib = Tailwind/SVG) project-director 확정
- [ ] A2 (alert channel = Slack webhook or fallback) 사용자 확정 + webhook URL 확보 (Slack 선택 시)
- [ ] A3 (refresh cadence = 30s) tech-planner 확정, C11 realtime 포함 여부 결정
- [ ] `apps/api/prisma/schema.prisma` `WebPushFailureLog` 모델 review (backend-data-dev)
- [ ] `AdminModule` 에 `AdminOpsModule` import 경로 확인 (backend-api-dev)
- [ ] `@nestjs/schedule` cron 재사용 패턴 검토 (marketplace cron 선례)
- [ ] admin 네비 `/admin/ops` 순서 (대시보드 바로 아래 권장) 확정
- [ ] 3 personas QA 대상: admin (신규 ops 화면), ops-manager (분쟁 resolve), finance (payouts 재시도)
- [ ] 배포 전 staging 에서 5분 실패 burst 시뮬레이션 시나리오 준비
- [ ] CLAUDE.md Known Blockers 섹션에 Task 76 완료 시 항목 추가 여부 검토 (운영 dashboard 경로 명시)

---

## References

- Task 70 완료 리포트: `.github/tasks/70-completion-report.md` (판매자/재무 대시보드 Deferred 항목)
- Task 73 완료 리포트: `.github/tasks/73-completion-report.md` (idempotency precondition)
- Task 74 완료 리포트: `.github/tasks/74-completion-report.md` (C9 메트릭 기반)
- Roadmap: `.github/tasks/next-session-plan-72-onward.md` (Task 76 outline L77-L84)
- 기존 admin layout: `apps/web/src/app/admin/layout.tsx`
- 기존 admin summary: `apps/api/src/admin/admin.service.ts` `getDashboardStats()` (중복 피하고 ops 전용으로 분리)
- 기존 WebPushService: `apps/api/src/notifications/web-push.service.ts` (failure log write hook 위치)
- 기존 RealtimeGateway: `apps/api/src/realtime/realtime.gateway.ts` (`emitToAdmins` 추가 지점)
