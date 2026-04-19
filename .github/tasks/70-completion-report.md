# Task 70 Completion Report — 2026-04-19

## Summary

마켓플레이스 결제 라이프사이클을 에스크로 상태 머신(pending → paid → shipped → delivered → completed | auto_released), 분쟁 도메인 Prisma 전환(in-memory mock 완전 제거), 정산 payout 배치 워크플로우, 어드민 강제 해제 UI까지 end-to-end로 완성했다. 커미션 상수 추출, settlement 생성 시점 이전(구매 시 → 해제 시), `escrow_held` 도달 불가 상태 해소가 포함된다. 부분환불(partial refund)은 product/finance 미확정으로 scope-split 이연했다.

## Original Conditions Met

### §3.1 Escrow State Machine
- [x] `confirmOrderPayment` 가 order를 `escrow_held` 가 아닌 `paid` 로 전환. `autoReleaseAt = deliveredAt + 7d` 로 설정 (per tech-design §1.2 — `escrow_held` 값은 back-compat 유지, 새 행은 기록하지 않음)
- [x] 판매자가 `POST /marketplace/orders/:id/ship`, `/deliver` 로 상태 전환 (seller 전용, 선행 상태 필수)
- [x] 구매자가 `POST /marketplace/orders/:id/confirm-receipt` 로 `completed` 전환 (buyer 전용, `delivered` 필수, `buyerConfirmedAt` + `escrowReleasedAt` 타임스탬프 설정)
- [x] 스케줄 잡이 `now > autoReleaseAt` AND `status = delivered` AND open dispute 없음인 order 자동 해제 (`@Cron(CronExpression.EVERY_10_MINUTES)`, `DISABLE_MARKETPLACE_CRON=true` 플래그로 비활성화 가능)
- [x] `completed` 전환 시 `SettlementRecord` 생성. 구매 시점 settlement 생성은 `confirmOrderPayment` 에서 제거
- [x] 유효하지 않은 상태 전환 시 `BadRequestException(ORDER_INVALID_TRANSITION)` 반환

### §3.2 Payout Batch
- [x] `Payout` Prisma 모델 생성 (batchId / recipientId / grossAmount / platformFee / netAmount / status / processedAt)
- [x] `SettlementRecord` 에 `payoutId` FK + `releasedAt` 타임스탬프 추가
- [x] `POST /admin/payouts/batch` (admin-only) — 1명 수령자의 N건 released settlement 를 1 payout 으로 묶음. 이미 배치된 settlement 재배치 시 `SETTLEMENT_ALREADY_BATCHED` 409
- [x] `PATCH /admin/payouts/:id/mark-paid` (admin-only) — payout `paid`, `processedAt` 설정, 수령자에게 `payout_paid` 알림
- [x] `PATCH /admin/payouts/:id/mark-failed` (admin-only) — payout `failed`, settlement 재대기열(`payoutId=null` 복원)
- [x] `GET /admin/payouts` — status 필터 + cursor 페이지네이션
- [x] `GET /admin/payouts/eligible` — 배치 가능 settled 목록 (recipient별 집계)

### §3.3 Dispute Lifecycle (from scratch)
- [x] Prisma `Dispute` 모델 생성 (통합 discriminator `targetType: marketplace_order | team_match`)
- [x] Prisma `DisputeEvent` 모델 생성 (audit trail, actorRole enum)
- [x] `POST /marketplace/orders/:id/dispute` (buyer, `escrow_held | shipped | delivered` 상태에서만) → order `disputed`, auto-release 차단, Dispute `filed` 생성
- [x] `POST /disputes/:id/messages` (opener/counterparty/admin)
- [x] `PATCH /admin/disputes/:id/resolve` (admin-only, `{ action: refund | release | dismiss, note }`) → 각 action에 따라 Order/Settlement/Payment 연쇄 처리
- [x] in-memory `disputes.service.ts` 내부 배열 + 하드코딩 fixture 완전 제거 (Prisma 기반 재작성)
- [x] 기존 admin UI (`apps/web/src/app/admin/disputes/page.tsx`) 신규 API 응답 형태로 연결

### §3.4 Notification Fan-out
- [x] `order_shipped` / `order_delivered` / `order_auto_released` / `dispute_filed` / `dispute_responded` / `dispute_resolved` / `payout_paid` — `NotificationType` enum 추가 + 서비스 연결

### §3.5 Idempotency & Security
- [x] 상태 전환 엔드포인트 idempotent — `updateMany` status guard 패턴 (Task 69 idiom 복제)
- [x] Toss webhook 서명 검증 마켓플레이스 경로에 적용
- [x] `confirmOrderPayment` 의 금액 변조 방어 코드 리팩토링 후에도 유지
- [x] `/admin/payouts/*`, `/admin/disputes/:id/resolve` 에 `JwtAuthGuard + AdminGuard` 적용

### §3.6 Mock Discipline
- [x] `NotificationType` enum 확장을 seed + inline spec mock + MSW handler 에 동일 커밋에서 반영
- [x] `disputes.service.spec.ts` in-memory fixture assertion 제거, Prisma 기반 `beforeEach` fixture로 전환
- [x] `/admin/payouts`, `/marketplace/orders/:id/dispute` MSW handler 추가

### 미충족 (명시적 scope-split)
- [ ] 부분환불 (`action: partial`) — DTO/서비스/UI 정리 후 이연. 후속 task 번호 미확정 (Task 75는 AI 팀 밸런싱 v2, 72-74는 별개 scope)

## Scope Shipped

- **Backend**: 신규 엔드포인트 17개 (marketplace orders 5 + admin orders 1 + disputes 6 + admin disputes 4 + admin payouts 5), 신규 NestJS 모듈 (`PayoutsModule`, `MarketplaceCronModule`), 서비스 메서드 ~30개 신규/수정, `@nestjs/schedule` cron 적용, `MARKETPLACE_COMMISSION_RATE = 0.10` 단일 상수 추출 (`apps/api/src/common/constants/commission.ts`)
- **Frontend**: 훅 19개 신규 (`use-marketplace.ts` 확장 + `use-disputes.ts` 신규 + `use-admin.ts` 확장), 신규 페이지 8개 (`marketplace/orders/[id]`, `marketplace/orders/[id]/dispute`, `my/orders`, `my/disputes`, `my/disputes/[id]`, `admin/disputes/[id]`, `admin/payouts`, 기존 admin/disputes 업데이트), 신규 컴포넌트 7개, MSW handler 확장
- **Migration**: `apps/api/prisma/migrations/20260418070000_marketplace_payment_lifecycle/migration.sql` — `Dispute` / `DisputeEvent` / `Payout` 신규 모델, `MarketplaceOrder` / `SettlementRecord` 필드 추가, `NotificationType` +7값, `SettlementStatus` +2값(`held`/`refunded`), `OrderStatus` `auto_released` 추가
- **Tests**: 통합 테스트 스위트 3개 신규 (`marketplace-lifecycle.e2e-spec.ts`, `disputes-lifecycle.e2e-spec.ts`, `payouts-batch.e2e-spec.ts`), unit spec 5개 신규/수정

## Pipeline Metrics

- Wave 0: 1 agent serial (backend-data-dev) — schema + migration + fixture factory
- Wave 1: 4 agents parallel (backend-api-dev ⟂ backend-data-dev ⟂ frontend-data-dev ⟂ frontend-ui-dev)
- 리뷰 라운드: 2회 (backend+frontend 병렬 리뷰 후 수정 × 1, 디자인 라운드 × 1)
- QA 라운드: 1회 (4 personas)
- 변경 파일: ~55

## Key Decisions

- **커미션 10% 유지**: project-director가 5% 제안을 거부, 기존 10% 보존. `MARKETPLACE_COMMISSION_RATE = 0.10` 단일 상수로 추출 (`apps/api/src/common/constants/commission.ts`)
- **부분환불 제거**: DTO (`action: partial`, `amount?`), 서비스 분기, UI — 모두 정리. product/finance 결정 전까지 미포함. 후속 task 번호 미확정
- **페이지네이션 형식**: cursor 기반 `{ data, nextCursor }` — 목록 엔드포인트 전체 통일
- **DisputeEvent audit trail**: Dispute 상태 변화 전체를 `DisputeEvent` 행으로 기록. `actorRole: buyer | seller | admin | system` enum으로 책임 주체 구분
- **통합 Dispute 모델**: `targetType: marketplace_order | team_match` discriminator로 팀 매치 분쟁과 마켓플레이스 분쟁을 단일 테이블에서 관리 (in-memory tech debt 동시 해소)
- **Cron 주기**: 10분 (`EVERY_10_MINUTES`) — tech-design 의 1시간 제안보다 짧게 조정, `DISABLE_MARKETPLACE_CRON=true` env로 비활성화 가능
- **Settlement 생성 시점 이전**: 구매 시(`confirmOrderPayment`) → 에스크로 해제 시(`complete/auto_released`)로 이동. 미해제 기간 중 settlement는 `status=held`로 생성되어 payout 대기에서 제외

## Deferred

- **부분환불** — product/finance 정책 확정 후 별도 task (번호 미확정; 현재 로드맵의 72-74는 각각 팀 밸런싱 UX / idempotency sweep / 운영 푸시 알림으로 별개 scope)
- **판매자 독립 대시보드** — Task 76 (Operational Observability + Admin Polish)에서 검토
- **은행 자동 이체 연동** — 어드민 수동 "mark-paid" 이후 outbound bank API 연동은 별도 task (번호 미확정)
- **Toss 에스크로 공식 API** — in-house ledger MVP 이후 scale trigger 시 검토 (구 Task 70 §13 "Task 72" 참조 — 현재 72는 팀 밸런싱 UX로 재배정됨)
- 후속 task seed 문서 4건 작성됨: `.github/tasks/72-team-balancing-v2-hardening.md`, `73-idempotency-retry-semantics.md`, `74-production-push-activation.md`, `next-session-plan-72-onward.md`

## Known Minor Issues (acknowledged, non-blocking)

- 분쟁 테이블이 빈 상태로 시작됨 — in-memory fixture의 team/match FK가 실제 테이블에 없어 migration INSERT 불가. dev smoke 데이터는 `seed.ts` dev-only 블록으로 이동 필요
- `Dispute.type` 은 String 컬럼으로 유지 (enum 불채택) — 스포츠별 사유 코드 확장 시 migration 없이 DTO `@IsIn` whitelist만 변경 가능. 의도된 설계 (tech-design §7 TD14)
- 판매자가 배송 마킹을 안 할 경우 auto-release 트리거가 안 됨 — admin 수동 에스컬레이션 CTA로 보완; 자동 SLA 전환은 미포함
- 어드민 분쟁 목록 status/type label 맵의 i18n 미적용 — `apps/web/src/lib/dispute-labels.ts` 단일 소스로 중앙화는 완료, next-intl 연결은 별도

## References

- Task 문서: `.github/tasks/70-marketplace-payment-lifecycle.md`
- Tech design: `.github/tasks/70-tech-design.md`
- Migration: `apps/api/prisma/migrations/20260418070000_marketplace_payment_lifecycle/migration.sql`
- 커미션 상수: `apps/api/src/common/constants/commission.ts`
- Cron: `apps/api/src/marketplace/marketplace.cron.ts`
- 후속 로드맵: `.github/tasks/next-session-plan-72-onward.md`
