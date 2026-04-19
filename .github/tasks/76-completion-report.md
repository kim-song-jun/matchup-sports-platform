# Task 76 Completion Report — 2026-04-19

**Status**: Completed (Medium tier, Wave 0+1 both shipped). C11 realtime admin room deferred to Wave 2 optional.

## Summary

`WebPushFailureLog` Prisma 모델과 마이그레이션을 추가하여 웹 푸시 실패 이력을 DB에 영속화하고, `WebPushAlertService`(EVERY_MINUTE cron)가 5분 Rolling 10건 임계치 초과 시 Slack webhook(또는 logger-only fallback)으로 자동 통지하도록 했다. 신규 `AdminOpsModule`(4 endpoints)이 매치/결제/분쟁/정산/푸시 실패 5개 KPI를 단일 API로 반환하며, `/admin/ops` 페이지가 30초 interval로 이를 시각화한다. 실패 payout 재시도(`POST /admin/payouts/:id/retry`)와 주간 집계 CSS 막대 차트로 재무팀 수동 SQL 작업을 제거했고, 분쟁 상세 페이지의 resolve 워크플로우를 단일 선형 흐름으로 통합했다.

## Original Conditions Met

- [x] **C1** `apps/api/src/admin/ops/` 신규 — `admin-ops.module.ts` / `admin-ops.controller.ts` / `admin-ops.service.ts`. 기존 `AdminModule`에서 import.
- [x] **C2** `GET /admin/ops/summary` — `matchesInProgress`, `paymentsPending`, `disputesOpen`, `settlementsPending`, `payoutsFailed`, `pushFailures5m` 6개 KPI를 `Promise.all` 병렬 집계. `AdminOpsSummaryDto` (Swagger `ApiProperty`, class-validator 불필요 plain interface).
- [x] **C3** `GET /admin/ops/recent-push-failures?limit=20` — `WebPushFailureLog` 테이블 기반. PII 제거: endpoint 마지막 6자 + userId sha256 8자.
- [x] **C4** `POST /admin/ops/push-failures/ack` — `acknowledgedAt` 타임스탬프 기록, 알람 재트리거 방지. `AdminGuard` 필수.
- [x] **C5** Prisma schema — `WebPushFailureLog { id, userId, subscriptionId, statusCode, errorCode, occurredAt, acknowledgedAt?, endpointSuffix String(6) }` + migration `YYYYMMDD_add_web_push_failure_log`. `WebPushService.sendToUser` 410/404 이외 실패 시 fire-and-forget row 삽입.
- [x] **C6** `WebPushAlertService` — 5분 Rolling 윈도 count≥10 시 Slack webhook 통지. `OPS_ALERT_WEBHOOK_URL` 미설정 시 logger-only fallback. `acknowledgedAt` 최근 5분 내 존재 시 중복 알람 skip. `AbortSignal.timeout(5000)` 적용. `@Cron(CronExpression.EVERY_MINUTE)`.
- [x] **C7** `/admin/ops/page.tsx` 신규 — 6개 KPI 카드(Matches / Payments / Disputes / Settlements / Payouts / Pushes) + `PushFailureTable` + 분쟁·정산 deep-link. `refetchInterval: 30_000`.
- [x] **C8** `/admin/disputes/[id]/page.tsx` — `DisputeResolveModal` 우측 상단 "해결 처리" 버튼으로 통합. `seller_responded | admin_reviewing` 상태에서만 노출. `filed` 상태에서는 review gate 강제 (review → resolve 단일 선형 흐름). resolve 완료 후 `['admin-dispute', id]` + `['admin-disputes']` + `['admin-ops-summary']` invalidate.
- [x] **C9** `/admin/payouts/page.tsx` 확장:
  - (a) 실패 payout 섹션(상단 고정) — `status=failed` 리스트 + "재대기열 복원" 버튼.
  - (b) 주간 집계 시각화 — 최근 4주 payout 합계 Tailwind `bg-blue-500` + `h-[40px]` 인라인 bar + 숫자 병기.
- [x] **C10** `POST /admin/payouts/:id/retry` 신규 — `status='failed'` guard로 `updateMany` race-safe, 연결 settlements `payoutId=null` 복원, `Payout.status=cancelled` 기록. 이미 `paid`인 경우 409 `PAYOUT_NOT_RETRIABLE`.
- [x] **C11** — **N/A** (Wave 2 옵션, refetchInterval 30s로 충분하여 skip 유지).
- [x] **C12** PII guard — `WebPushFailureLog.endpointSuffix` 정확히 6자. 풀 endpoint 저장·로그 출력 금지. 외부 webhook payload userId는 sha256 8자. spec(C13)에서 검증.
- [x] **C13** 테스트:
  - `admin-ops.service.spec.ts` — summary aggregation + KPI 카운터 5종
  - `web-push-alert.service.spec.ts` — 임계치 판정 + ack 중복 suppress
  - `admin-ops.e2e-spec.ts` 통합 — `AdminGuard` 차단 + summary shape 검증
  - `admin/ops/page.test.tsx` (Vitest + RTL) — KPI 카드 렌더 + empty state
  - MSW handler: `GET /admin/ops/summary`, `GET /admin/ops/recent-push-failures`, `POST /admin/payouts/:id/retry`
- [x] **C14** 디자인 일관성 — 신규 카드 전체 `dark:bg-gray-800` / `dark:text-white` / `min-h-[44px]` / `aria-label`. `components/ui/empty-state.tsx` 사용. chart 라이브러리 추가 0.

## Acceptance Criteria

| 기준 | 결과 |
|------|------|
| `/admin/ops` 6 KPI 카드 + 최근 푸시 실패 테이블 30초 interval 갱신 | Pass |
| 분쟁 상세 resolve 버튼 → modal → action 제출이 단일 흐름 완료 | Pass |
| 5분 10건 실패 burst → Slack webhook 1회, ack 후 중복 suppress | Pass |
| `/admin/payouts` 실패 섹션 + 재시도 UI + 주간 집계 bar 렌더 | Pass |
| `WebPushFailureLog` 마이그레이션 성공 + rollback 검증 | Pass |
| 신규 endpoint 4개 `AdminGuard` 적용, 비관리자 403 | Pass |
| 신규 integration/unit/RTL 테스트 7건 통과, 기존 스위트 무회귀 | Pass |
| 모든 신규 UI 다크모드 + 44px 터치 + aria-label, 컬러 only 전달 없음 | Pass |
| chart 라이브러리 신규 의존성 0 | Pass |
| C11 realtime admin room | N/A — Wave 2 옵션으로 skip 유지 |

## Review + QA Findings

### Review round 1 (build commit `c5b449f`)

| 분류 | 내용 | 해결 |
|------|------|------|
| Critical | `deploy/docker-compose.prod.yml` 에 `OPS_ALERT_WEBHOOK_URL` env 주입 없음 | fix commit `33a0076` 에서 prod compose + GHA `deploy.yml` secret 주입 체인 추가 |
| Critical | `.github/workflows/deploy.yml` 에 `OPS_ALERT_WEBHOOK_URL` secret 매핑 누락 | fix commit `33a0076` 에서 `secrets.OPS_ALERT_WEBHOOK_URL` 주입 경로 추가 |
| Warning | `/admin/ops` 페이지에 `useRequireAuth()` + admin role check 누락 | fix commit `33a0076` 에서 추가 |
| Warning | `WebPushAlertService` Slack fetch 타임아웃 미설정 — 외부 장애 시 cron 블로킹 가능 | fix commit `33a0076` 에서 `AbortSignal.timeout(5000)` 추가 |
| Warning | `POST /admin/payouts/:id/retry` `@HttpCode` 200 명시 누락 | fix commit `33a0076` 에서 `@HttpCode(HttpStatus.OK)` 추가 |
| Warning | `AdminOpsSummaryDto` Swagger `ApiProperty` 일부 필드 누락 | fix commit `33a0076` 에서 전체 6 필드 주석 완성 |
| Warning | `KpiCard` 다크모드 `dark:text-white` 누락 | fix commit `33a0076` 에서 추가 |
| Warning | `PushFailureTable` `aria-label` 누락 | fix commit `33a0076` 에서 추가 |
| Warning | `WeeklyPayoutBars` bar 높이 0 데이터 시 Tailwind class 오적용 — 0건 주에 `h-[0px]` 가 아닌 `h-[2px]` 최솟값 필요 | fix commit `33a0076` 에서 min-height 처리 추가 |

### Design + QA round (fix commit `33a0076` 이후)

| 분류 | 내용 | 해결 |
|------|------|------|
| Warning | `/admin/disputes/[id]` resolve 버튼이 `filed` 상태에서도 노출됨 — review gate 누락 | fix commit `003d986` 에서 `filed` 상태 시 "검토 시작" 버튼만 노출, resolve는 `seller_responded | admin_reviewing`만 허용으로 수정 |
| Warning | `useMarkPayoutPaid` / `useMarkPayoutFailed` 에 `['admin-ops-summary']` invalidate 미추가 | fix commit `003d986` 에서 추가 |
| Warning | `useResolveDispute` 에 `['admin-ops-summary']` invalidate 미추가 | fix commit `003d986` 에서 추가 |
| Warning | `useRetryPayout` 에 `['admin-ops-summary']` invalidate 미추가 | fix commit `003d986` 에서 추가 |
| Warning | `WebPushAlertService` spec 에서 Slack mock fetch URL assertion 누락 | fix commit `003d986` 에서 URL regex assertion 추가 |
| Warning | KPI 카드 숫자 0 시 `EmptyState`로 대체하는 잘못된 분기 — 숫자 0은 유효 정보 | fix commit `003d986` 에서 분기 제거, 0 숫자 그대로 표시 |
| Warning | `endpointSuffix` length=6 spec assertion 누락 | fix commit `003d986` 에서 `expect(log.endpointSuffix).toHaveLength(6)` 추가 |

Design + QA round: Critical 0 / Warning 7 — 전량 fix commit `003d986` 에서 해소.

## Scope Shipped

**Backend**
- 1 Prisma migration: `add_web_push_failure_log` — `WebPushFailureLog` 모델 7 필드
- 1 schema change: `apps/api/prisma/schema.prisma` — `WebPushFailureLog` 추가
- 1 신규 모듈: `AdminOpsModule` (`admin-ops.controller.ts` / `admin-ops.service.ts` / DTO 3종)
- 4 신규 엔드포인트: `GET /admin/ops/summary`, `GET /admin/ops/recent-push-failures`, `POST /admin/ops/push-failures/ack`, `POST /admin/payouts/:id/retry`
- 1 신규 서비스: `WebPushAlertService` — cron EVERY_MINUTE + Slack webhook + logger fallback + 5분 window + count threshold(10) + ack suppress + `AbortSignal.timeout(5000)`
- `WebPushService.sendToUser` — failure log write hook (fire-and-forget, swallow)
- 3 spec: `admin-ops.service.spec.ts`, `web-push-alert.service.spec.ts`, `admin-ops.e2e-spec.ts`

**Frontend**
- 1 신규 페이지: `apps/web/src/app/admin/ops/page.tsx` — 6 KPI 카드 + `PushFailureTable` + `WeeklyPayoutBars`
- 3 신규 컴포넌트: `components/admin/kpi-card.tsx`, `components/admin/push-failure-table.tsx`, `components/admin/weekly-payout-bars.tsx`
- `/admin/payouts/page.tsx` 확장 — 실패 섹션 + 재시도 + 주간 집계 bar
- `/admin/disputes/[id]/page.tsx` 재배치 — resolve 버튼 단일 진입점 통합. `filed` → review gate, `seller_responded | admin_reviewing` → resolve 버튼 노출
- admin layout 에 `/admin/ops` 네비 추가
- 4 신규 훅: `useAdminOpsSummary`, `useRecentPushFailures`, `useAckPushFailures`, `useRetryPayout`
- `useMarkPayoutPaid`, `useMarkPayoutFailed`, `useResolveDispute` — `['admin-ops-summary']` invalidate 추가
- MSW handler 3종: `/admin/ops/summary`, `/admin/ops/recent-push-failures`, `/admin/payouts/:id/retry`
- 1 RTL 테스트: `admin/ops/page.test.tsx`

**Infra**
- `deploy/docker-compose.prod.yml` — `OPS_ALERT_WEBHOOK_URL` env 주입
- `.github/workflows/deploy.yml` — `secrets.OPS_ALERT_WEBHOOK_URL` 주입 체인
- `.env.example` — `OPS_ALERT_WEBHOOK_URL=` 빈 값 (실제 값 secret store)

## Tests

| 구분 | 수량 |
|------|------|
| Backend unit (Jest) | 831 tests pass (+45 from Task 76 baseline) |
| Frontend (Vitest) | 450 tests pass (+21) |
| 신규 integration files | 1 건 (`admin-ops.e2e-spec.ts`) |

## Key Files Changed

- `apps/api/prisma/schema.prisma` — `WebPushFailureLog` 모델 추가
- `apps/api/src/admin/ops/admin-ops.controller.ts` — 신규
- `apps/api/src/admin/ops/admin-ops.service.ts` — 신규
- `apps/api/src/admin/ops/admin-ops.module.ts` — 신규
- `apps/api/src/notifications/web-push-alert.service.ts` — 신규
- `apps/api/src/notifications/web-push.service.ts` — failure log write hook 추가
- `apps/api/test/integration/admin-ops.e2e-spec.ts` — 신규
- `apps/web/src/app/admin/ops/page.tsx` — 신규
- `apps/web/src/components/admin/kpi-card.tsx` — 신규
- `apps/web/src/components/admin/push-failure-table.tsx` — 신규
- `apps/web/src/components/admin/weekly-payout-bars.tsx` — 신규
- `apps/web/src/app/admin/disputes/[id]/page.tsx` — resolve 버튼 재배치
- `apps/web/src/app/admin/payouts/page.tsx` — 실패 섹션 + retry + weekly bars
- `apps/web/src/hooks/api/use-admin.ts` — 훅 4종 추가 + 기존 훅 invalidate 보강
- `deploy/docker-compose.prod.yml` — `OPS_ALERT_WEBHOOK_URL` 주입

## Out of Scope / Deferred

- **C11 realtime admin room** — `RealtimeGateway.emitToAdmins` 헬퍼 + `/admin/ops` socket 구독: Wave 2 옵션으로 skip. refetchInterval 30s로 운영 충분 판단.
- **rate threshold 계산** — success counter 인프라 별도 필요. count 10 단일 기준으로 확정. `PUSH_ALERT_RATE_THRESHOLD` 상수는 미사용 제거.
- **`WebPushFailureLog` 30일 cleanup cron** — R1 risk 인식, 초기에는 지표 수집 우선. 별도 task(Task 77 이후) 처리.
- **scale-out 중복 알람 방지 Redis lock** — 현재 admin scale=1 전제, 향후 Redis `SET NX PX` 리더 선출 필요 (R9).

## Prior Merge History (Dependencies Satisfied)

| Task | Merge 일자 | 기여 |
|------|-----------|------|
| Task 73 — idempotency sweep | 2026-04-19 | admin 재처리 안전성 확보 |
| Task 74 — VAPID 실활성 | 2026-04-19 | 실패 로그 수집 대상 데이터 확보 |
| Task 74-B — notification preference | 2026-04-19 | `NotificationPreference` gating 인프라 |
| Task 77 — test infra upgrade | 2026-04-19 | Jest/Vitest 버전 고정 + 테스트 baseline 안정화 |

## Commits

| SHA | 내용 |
|-----|------|
| `c5b449f` | feat: task 76 — AdminOpsModule + WebPushAlertService + /admin/ops page (Wave 0+1 build) |
| `33a0076` | fix: task 76 review — infra env injection + AbortSignal.timeout + dark mode + aria fixes |
| `003d986` | fix: task 76 design+QA — resolve gate + ops-summary invalidate + spec assertions |

## Follow-up (운영자 수동)

1. **Slack webhook URL 생성** — Slack 워크스페이스 > App 관리 > "Incoming Webhooks" > 채널 지정 후 URL 복사.
2. **GitHub Actions secrets 등록** — `OPS_ALERT_WEBHOOK_URL` 를 repo secrets에 등록 (없으면 logger-only fallback으로 안전하게 동작하므로 선택사항).
3. **Staging/Prod 채널 분리 고려** — R8: Staging 전용 Slack 채널 별도 설정 또는 staging은 logger-only 허용.
4. **`WebPushFailureLog` 보관 기간** — 현재 무제한. 30일 이상 cleanup cron은 별도 task로 추가 필요.

## References

- Task doc: `.github/tasks/76-operational-observability-admin-polish.md`
- Prior report: `.github/tasks/74-completion-report.md` (C9 메트릭 기반)
- Prior report: `.github/tasks/73-completion-report.md` (idempotency precondition)
- Commits (3): `c5b449f` build → `33a0076` review fix → `003d986` design+QA fix
