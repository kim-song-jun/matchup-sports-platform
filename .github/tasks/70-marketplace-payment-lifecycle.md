# Task 70 — Marketplace Payment Lifecycle (Escrow · Payout · Dispute)

Owner: project-director ⟂ tech-planner → backend-data-dev ⟂ backend-api-dev ⟂ backend-integration-dev ⟂ frontend-ui-dev ⟂ frontend-data-dev → backend-review ⟂ frontend-review → QA
Drafted: 2026-04-18
Predecessor: Task 69 (Theme D deferred — see `.github/tasks/69-completion-report.md:45,73`)
Priority: P1 — marketplace is currently "pay-and-vanish" (no hold, no release, no dispute). Trust risk but no active money movement, so product/finance sign-off is blocking before merge (provisional policy below lets engineering proceed in parallel).

---

## 1. Context

Task 69 closed 10 of 11 themes. **Theme D (marketplace lifecycle)** was explicitly deferred with the trigger "결제 흐름 product/finance 의사결정 문서화". That decision has not been made externally, so this document **records reasonable defaults as PROVISIONAL policy** so backend/frontend/infra can build on a fixed contract; the product/finance stakeholder can accept or override each default in §12 before merge.

### 1.1 Current state audit (2026-04-18, verified via file reads)

| Area | Reality (file:line) | Gap |
|------|---------------------|-----|
| `OrderStatus` enum | `schema.prisma:198-208` — already has `pending·paid·escrow_held·shipped·delivered·completed·disputed·refunded·cancelled` | Enum is ready. **`escrow_held` is never transitioned to** — `marketplace.service.confirmOrderPayment:300-307` jumps `pending→paid` only. State machine is 90% wiring, 10% enum work. |
| `MarketplaceOrder` | `schema.prisma:576-605` has `paidAt·shippedAt·deliveredAt·completedAt` columns | Missing: `heldAt`, `releasedAt`, `disputedAt`, `refundedAt`, `autoReleaseAt` (scheduled release deadline), `buyerConfirmedAt`. |
| `SettlementRecord` | `schema.prisma:1297-1312` + `settlements.service.ts` — per-transaction, commission hardcoded 10% | No `Payout` batch concept. `recordSettlement` called **at purchase time** (`marketplace.service.ts:319`) not at **release** — wrong mental model for escrow. |
| `Dispute` domain | `disputes.service.ts:1-319` is **full in-memory mock** (3 seeded fake disputes). **No Prisma model exists.** Admin UI (`apps/web/src/app/admin/disputes/page.tsx`) consumes the mock. | From-scratch domain: `Dispute`, `DisputeMessage`, `DisputeEvidence` models + migration + admin+buyer+seller UI rewire. **Not "add lifecycle" — it's "replace mock with real domain."** |
| Toss integration | `payments.service.ts` (match) + `marketplace.service.ts:336-360` (marketplace) both call Toss confirm. Signature-verified webhook exists (`payments.service.ts:402-417`). Mock fallback when `TOSS_SECRET_KEY` unset. | Toss regular payment — **not Toss 에스크로 API** (see §1.3 for rationale). |
| Commission rate | `marketplace.service.ts:251` (order.commission) = **10%**. `settlements.service.ts:123` = **10%**. | Task brief proposes **5%** default. This is a **behavior change** — flagged in §12 Provisional Decisions. |

### 1.2 Naming & scope ambiguity resolved

- "Payout" in this doc = **batch grouping of N released settlements** for one manual bank transfer. New Prisma model.
- "Release" = buyer confirms receipt (manual) OR auto-release after T+N days from delivery. Triggers settlement record creation + payout eligibility.
- "Hold" = funds in platform balance, not yet owed to seller. Accounting is **in-house ledger** (not Toss 에스크로 API).

### 1.3 Why in-house ledger (not Toss 에스크로 API) — provisional

Toss Payments offers two product tiers:
1. **일반 결제** (used today) — funds settled to merchant (platform) next business day. Platform holds buyer funds until release, then manually disburses to seller. Korean convention: 번개장터·당근페이 use this model.
2. **에스크로 공식 결제** — requires KCP/INICIS-level KYC, additional compliance, slower onboarding, stricter timing. Not viable in current phase.

Chosen default: **일반 결제 + in-house ledger (platform balance = sum of held orders)**. Admin manually batches payouts. Explicit bank-transfer automation is **out of scope** (Task 70 stops at "admin marks payout as paid"; outbound ACH/bank API is future work).

### 1.4 Core principle drivers (reference CLAUDE.md)

- **Principle 1 (Tech Debt)** — disputes in-memory mock is in scope, not deferred. Commission rate conflict is resolved in this task, not papered over.
- **Principle 3 (Security Always)** — all payout mutations admin-only; dispute status transitions freeze funds; Toss amount-tampering guard already exists (verify re-used).
- **Principle 4 (Mock Discipline)** — Prisma Dispute model replaces disputes.service mock; inline spec mocks + MSW handlers updated same branch.
- **Principle 5 (No Ambiguous Skipping)** — every product/finance decision captured in §12 with explicit default + override hook.
- **Principle 6 (Ambiguity → Re-enter Planning)** — builders hitting undocumented edge cases file `BLOCKED` and return here.

---

## 2. Goal

1. Marketplace order transitions through `pending → paid → escrow_held → shipped → delivered → completed` (happy path) with explicit timestamps and actor/permission gates at every transition.
2. Release event (buyer-confirm OR auto-release T+N) creates `SettlementRecord` (moved from purchase-time) + unlocks for payout batching. Settlement creation at purchase time is removed.
3. Admin can batch N releasable settlements into a `Payout`, mark the batch as paid (outside the system), and the system records gross/fee/net/batch metadata.
4. Buyer can file dispute (pre-completion) which transitions order to `disputed` and **freezes funds** (blocks payout). Seller responds within SLA; admin decides; resolution releases or refunds.
5. Disputes persistence: Prisma `Dispute` + `DisputeMessage` + `DisputeEvidence` models replace in-memory mock. Admin UI + buyer dispute-filing UI + seller response UI consume the real API.
6. All amount-bearing mutations are idempotent and admin-gated where applicable. Webhooks are signature-verified (already done in match flow, extended to marketplace).

**Out of scope (explicit):**
- Live Toss 에스크로 API integration.
- Outbound bank transfer automation (admin does manual transfer; system only records the batch + marks paid).
- Fraud detection / velocity checks.
- Multi-currency.
- Seller KYC / business-registration verification flows.
- Partial refunds on disputes (binary resolve: release OR full refund).

---

## 3. Original Conditions (testable checkboxes)

### 3.1 Escrow state machine
- [ ] `confirmOrderPayment` transitions order to `escrow_held` (not `paid`) with `heldAt` timestamp set; `autoReleaseAt = deliveredAt + 7d`.
- [ ] Seller can mark `shipped` → `delivered` via `POST /marketplace/orders/:id/ship`, `/deliver` (seller only, order must be in the preceding state).
- [ ] Buyer can mark `completed` via `POST /marketplace/orders/:id/confirm-receipt` (buyer only, requires `delivered`; sets `buyerConfirmedAt`, `releasedAt`, transitions to `completed`).
- [ ] Scheduled job releases orders where `now > autoReleaseAt` AND status = `delivered` AND no open dispute.
- [ ] Transition to `completed` creates `SettlementRecord` (status `pending`, eligible for payout). Purchase-time settlement creation is **removed** from `confirmOrderPayment`.
- [ ] Invalid transitions (e.g., `pending → completed`) throw `BadRequestException` with `ORDER_INVALID_TRANSITION`.

### 3.2 Payout batch
- [ ] `Payout` Prisma model created: `id·batchCode·recipientId·grossAmount·platformFee·netPayout·status(pending|processing|paid|failed)·paidAt·createdAt`.
- [ ] `SettlementRecord` gains `payoutId` FK (nullable) + `releasedAt` timestamp.
- [ ] `POST /admin/payouts/batch` (admin-only) groups N releasable settlements for one recipient into one payout; re-batching an already-batched settlement rejects with `SETTLEMENT_ALREADY_BATCHED`.
- [ ] `PATCH /admin/payouts/:id/mark-paid` (admin-only) transitions payout to `paid`, sets `paidAt`, cascades to child settlements' `status=completed·processedAt=now`.
- [ ] Admin payout list `GET /admin/payouts` supports status filter + cursor.
- [ ] Admin settlement list `GET /admin/settlements` shows whether a settlement is batched (`payoutId !== null`) + its payout status.

### 3.3 Dispute lifecycle (from scratch)
- [ ] Prisma `Dispute` model: `id·orderId·openerId·openerRole(buyer|seller)·type·description·status(pending|seller_responded|admin_reviewing|resolved_refund|resolved_release|dismissed)·sellerRespondedAt·adminDecidedAt·slaDeadline`.
- [ ] Prisma `DisputeMessage` model: `id·disputeId·authorId·authorRole·body·createdAt`.
- [ ] Prisma `DisputeEvidence` model: `id·disputeId·uploaderId·uploadId(FK Upload)·createdAt`.
- [ ] `POST /marketplace/orders/:id/disputes` (buyer or seller, order status must be in `[escrow_held, shipped, delivered]`) → order moves to `disputed`, blocks auto-release, creates Dispute `pending`.
- [ ] `POST /marketplace/disputes/:id/messages` (opener, counterparty, or admin).
- [ ] `PATCH /admin/disputes/:id/resolve` (admin-only) with `{ decision: 'refund' | 'release', note }` → triggers either full Toss cancel + order `refunded` or releases order `completed` + creates SettlementRecord.
- [ ] In-memory mock `disputes.service.ts` is **fully replaced** (file rewritten to use Prisma; inline `private disputes: Dispute[]` array removed; seed fake disputes migrated to `apps/api/prisma/seed.ts` if desired — otherwise dropped).
- [ ] Existing admin UI (`apps/web/src/app/admin/disputes/page.tsx`) consumes new API without breaking contract.

### 3.4 Notification fan-out (reuse Task 69 pattern)
- [ ] Order state transitions notify counterparty with types: `marketplace_order_shipped`, `marketplace_order_delivered`, `marketplace_order_completed`, `marketplace_order_disputed`, `marketplace_order_refunded`. Add to `NotificationType` enum.
- [ ] Dispute message → notify other participants: `marketplace_dispute_message`.
- [ ] Dispute resolution → notify both parties: `marketplace_dispute_resolved`.
- [ ] Payout `mark-paid` → notify recipient: `marketplace_payout_paid`.

### 3.5 Idempotency & security
- [ ] All state-transition endpoints are idempotent: re-calling on already-transitioned order returns 200 with current state (no double settlement record).
- [ ] Toss webhook marketplace handler verifies signature (reuse `payments.service.ts:402` `verifyWebhookSignature`).
- [ ] Amount tampering guard in `confirmOrderPayment:292` preserved after state-machine refactor.
- [ ] All payout/settlement mutation endpoints under `/admin/*` use `JwtAuthGuard + AdminGuard`.

### 3.6 Mock discipline
- [ ] `NotificationType` enum extension mirrored to seed + inline spec mocks + MSW handlers in same commit.
- [ ] Disputes inline mock in `apps/api/src/disputes/disputes.service.spec.ts` removed; replaced with Prisma-based `beforeEach` fixtures.
- [ ] Frontend MSW handlers for `/admin/payouts`, `/marketplace/orders/:id/disputes` added under `apps/web/src/test/msw/`.

---

## 4. User Scenarios

### 4.1 Buyer — happy path
1. Browse listing → order created (`pending`).
2. Toss confirm → order `escrow_held`. Seller receives `marketplace_order` notification (existing).
3. Seller ships → buyer receives `marketplace_order_shipped` with tracking.
4. Seller marks delivered → buyer receives `marketplace_order_delivered` + "수령 확인" CTA + T-7d countdown.
5. Buyer taps "수령 확인" → order `completed`, `SettlementRecord` created, seller gets `marketplace_order_completed`.

### 4.2 Buyer — auto-release
Same as 4.1 but buyer forgets. T+7d after `deliveredAt`: scheduled job auto-releases. Buyer + seller both get neutral `marketplace_order_completed` (system-initiated).

### 4.3 Buyer — dispute
1. Order `delivered`, item broken. Buyer files dispute with photos → order `disputed`, auto-release blocked.
2. Seller gets `marketplace_order_disputed`, responds in thread within 72h.
3. Admin reviews, decides refund → order `refunded`, Toss cancel invoked, buyer + seller notified.

### 4.4 Seller — payout
1. Recipient has 3 `completed` settlements worth 120,000원 / 150,000원 / 80,000원.
2. Admin selects all 3 → `POST /admin/payouts/batch`: gross=350k, platformFee=35k (10%), netPayout=315k, status `pending`.
3. Admin performs manual bank transfer. Returns to admin UI, marks payout `paid` → all 3 settlements `status=completed·processedAt=now·payoutId=payout-xxx`. Seller receives `marketplace_payout_paid` with net amount + batch code.

### 4.5 Admin — dispute triage
1. Admin sees dispute queue sorted by `slaDeadline`.
2. Opens dispute → sees thread, evidence, order context.
3. Decides `release` → order `completed`, SettlementRecord created. OR decides `refund` → Toss cancel, order `refunded`.

---

## 5. Test Scenarios

### 5.1 Happy (integration, `apps/api/test/integration/marketplace-lifecycle.e2e-spec.ts` — new)
- T-H1: full escrow path `pending → escrow_held → shipped → delivered → completed` with all timestamps set.
- T-H2: SettlementRecord created at release (NOT at confirmOrderPayment).
- T-H3: Payout batch of 3 settlements → mark paid → child settlements `completed` + `processedAt` set.
- T-H4: Auto-release job skips orders with open disputes.

### 5.2 Edge
- T-E1: Seller attempts `ship` on `pending` order → 400 `ORDER_INVALID_TRANSITION`.
- T-E2: Double-call `confirm-receipt` → second call 200 with same state (idempotent), no second settlement.
- T-E3: Concurrent admin `mark-paid` on same payout → only one wins (serializable guard pattern from Task 69 §3.4).
- T-E4: Buyer files dispute on `completed` order → 400 (window closed).
- T-E5: Re-batching already-batched settlement → 409 `SETTLEMENT_ALREADY_BATCHED`.

### 5.3 Error
- T-X1: Non-admin hits `/admin/payouts/batch` → 403.
- T-X2: Buyer hits seller-only `ship` → 403.
- T-X3: Toss cancel fails on dispute refund resolution → order stays `disputed`, admin sees retry CTA, no half-state.
- T-X4: Dispute opened against non-own order → 403.

### 5.4 Mock updates (same commit)
- `apps/api/src/marketplace/marketplace.service.spec.ts`: update `createOrder` mock to assert no settlement record side-effect.
- `apps/api/src/disputes/disputes.service.spec.ts`: full rewrite (Prisma-based).
- `apps/api/prisma/seed.ts`: drop in-memory dispute seeds OR port to Prisma rows. Decision: **drop** (fake team-match IDs are no longer valid post-Task 69; regenerating is more work than value).
- `apps/web/src/test/msw/handlers.ts`: add marketplace lifecycle + payout + dispute handlers.
- `apps/web/src/app/admin/disputes/page.tsx`: hooks remain named `useAdminDisputes` but payload shape updates (old mock has `reporterTeam.name`, new real data has buyer/seller nicknames) — **contract adapter in hook, not in page**.

---

## 6. Parallel Work Breakdown

### Wave 0 (serial, 1 agent — shared files)
| Agent | File(s) | Responsibility |
|-------|---------|----------------|
| backend-data-dev | `apps/api/prisma/schema.prisma` + new migration `20260419000000_marketplace_escrow_payout_disputes` | (a) Extend `MarketplaceOrder` with `heldAt·releasedAt·disputedAt·refundedAt·autoReleaseAt·buyerConfirmedAt`. (b) New `Payout` model. (c) Add `payoutId·releasedAt` to `SettlementRecord`. (d) New `Dispute`, `DisputeMessage`, `DisputeEvidence` models. (e) Extend `NotificationType` enum (+7 values). (f) Seed cleanup of in-memory dispute fixtures. |

### Wave 1 (parallel — 4 agents, file-isolated)
| Agent | File domain | Responsibility |
|-------|-------------|----------------|
| backend-api-dev | `apps/api/src/marketplace/marketplace.{controller,service}.ts` + new `marketplace-lifecycle.service.ts` (state machine), `apps/api/src/admin/payouts.{controller,service,module}.ts` (new) | Endpoints: ship/deliver/confirm-receipt/dispute/payouts-batch/mark-paid. State machine guard. Idempotency. |
| backend-data-dev | `apps/api/src/disputes/disputes.{service,controller}.ts` full rewrite | Replace in-memory mock with Prisma. Dispute lifecycle. Message + evidence sub-resources. |
| backend-integration-dev | `apps/api/src/marketplace/auto-release.scheduler.ts` (new, using `@nestjs/schedule`) + Toss refund wiring in dispute resolve + notification fan-out | Cron every 1h for auto-release. Notification factory calls. Toss cancel on refund resolution. |
| frontend-data-dev | `apps/web/src/hooks/use-api.ts` + `apps/web/src/test/msw/handlers.ts` | New hooks: `useOrderLifecycle`, `useShipOrder`, `useConfirmReceipt`, `useFileDispute`, `useDisputeMessages`, `useAdminPayouts`, `useCreatePayoutBatch`, `useMarkPayoutPaid`, `useAdminDisputes` (rewire). MSW handlers for all. |
| frontend-ui-dev | `apps/web/src/app/(main)/my/orders/[id]/page.tsx` (new), `apps/web/src/app/admin/settlements/page.tsx` (payout tab), `apps/web/src/app/admin/disputes/[id]/page.tsx` (rewire), `apps/web/src/components/marketplace/order-timeline.tsx` (new) | Buyer order detail with state-aware CTAs (confirm-receipt / dispute). Admin payout batching UI. Admin dispute detail rewire. |

### Wave 2 (serial — QA gate)
- Run `pnpm test:all`. Verify 22 existing API unit suites still pass, 1 new integration suite added.
- `tsc --noEmit` across monorepo.
- `pnpm lint`.

### File ownership — NO cross-touch
- **Shared files** (Wave 0 only): `schema.prisma`, migration SQL, `seed.ts`.
- **Leaf files** (Wave 1 parallel): everything listed in the Wave 1 table above is disjoint.
- Frontend data-dev owns `handlers.ts`; UI-dev must not edit it directly — request via data-dev.

---

## 7. Acceptance Criteria

- [ ] All §3 checkboxes green.
- [ ] New integration suite `marketplace-lifecycle.e2e-spec.ts` runs `pnpm test:integration` green (≥12 cases covering happy/edge/error).
- [ ] `disputes.service.ts` contains **zero** in-memory array literals — entirely Prisma-backed.
- [ ] `settlements.service.recordSettlement` is no longer called from `marketplace.service.confirmOrderPayment` — only from the release code path.
- [ ] `escrow_held` OrderStatus is reachable and observed in at least one integration test.
- [ ] Admin payout UI can: list payouts, filter by status, create a batch from ≥1 selected settlements, mark batch paid.
- [ ] Admin dispute detail UI loads real data (not mock), can post admin messages, can resolve with refund or release, both paths verified end-to-end.
- [ ] Commission rate is a **single constant** (`MARKETPLACE_PLATFORM_FEE_RATE`) in one file (`apps/api/src/common/constants/fees.ts` new), referenced by both order creation and settlement record — eliminates the dual-hardcode at `marketplace.service.ts:251` + `settlements.service.ts:123`.
- [ ] `tsc --noEmit` green across monorepo. `pnpm lint` green.
- [ ] 20~40대 생활체육 사용자 언어로 모든 에러/토스트 카피가 해요체. Fallback message strings use `extractErrorMessage(err, '주문 처리에 실패했어요.')` pattern.

---

## 8. Tech Debt Resolved

| # | Debt | File:Line | Resolution in this task |
|---|------|-----------|------------------------|
| TD-1 | In-memory dispute mock (Principle 4 violation) | `disputes.service.ts:65-213` | Full Prisma rewrite. |
| TD-2 | Commission rate hardcoded in 2 places, values agree today but can drift | `marketplace.service.ts:251`, `settlements.service.ts:123` | Single constant + import. |
| TD-3 | Settlement record created at purchase time (wrong mental model for escrow) | `marketplace.service.ts:319` | Move to release code path. |
| TD-4 | `escrow_held` OrderStatus defined but unreachable | `schema.prisma:201` + `marketplace.service.ts:303` | Wire into state machine. |
| TD-5 | No buyer-facing order detail page after purchase | — | `/(main)/my/orders/[id]` new. |
| TD-6 | Admin disputes UI locked to mock shape (`reporterTeam.name` etc.) | `apps/web/src/app/admin/disputes/page.tsx:68-77` | Contract adapter in hook + real data. |
| TD-7 | Payout concept missing — settlements flat, no batching | `settlements.service.ts` whole file | New `Payout` model + admin batch UI. |

---

## 9. Security Notes

| Concern | Mitigation |
|---------|-----------|
| Payout batch amount tampering | Server recomputes `grossAmount/platformFee/netPayout` from child settlement IDs; request body only carries `settlementIds[]` + `recipientId`. Never trust client-supplied amounts. |
| Non-admin payout mutation | `JwtAuthGuard + AdminGuard` on `/admin/payouts/*`. |
| Dispute authorization | `POST /marketplace/orders/:id/disputes` checks `order.buyerId === userId || order.sellerId === userId`. Only admin can `PATCH /admin/disputes/:id/resolve`. |
| Webhook signature | Reuse `payments.service.ts:402` `verifyWebhookSignature`. Marketplace webhook path must apply same check. |
| Amount tampering on order confirm | Existing guard at `marketplace.service.ts:292` preserved — don't regress in refactor. |
| Idempotency of refund (Toss cancel) | Already-refunded order: check `status === 'refunded'` before second Toss cancel call (Toss returns error on double cancel; we short-circuit and return current state). |
| PII in dispute messages | Dispute message bodies stored plain (admin/counterparty already see them). No encryption at rest in this phase — call out in Risks. |
| Fee recalculation on in-flight orders | If commission rate changes post-deploy: grandfathered rate = `order.commission / order.amount`. Settlement records use stored `commission` field, not live constant. |

---

## 10. Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Two-track scope (escrow+payout AND dispute rewrite) in one task | Wave 1 sprawl, merge conflicts | Strict file ownership table §6. Wave 0 single agent for schema. Consider split to 70a/70b **only if Wave 0 schema review exceeds 3 rounds** (trigger: merge conflict threshold). |
| Product/finance sign-off on provisional defaults | Blocks merge | §12 table for line-item accept/override. Engineering proceeds against defaults; stakeholder overrides before merge = localized changes (constants + DTOs). |
| Auto-release scheduler reliability (`@nestjs/schedule` in-process) | Missed release → buyer funds held past T+N | Add observability: `autoReleaseAt` indexed; admin dashboard shows "overdue for release" queue. Manual admin release CTA as backup. |
| Toss cancel on dispute refund fails mid-resolve | Order stuck `disputed` with admin decision recorded | Transaction boundary: admin decision atomically sets `disputed` → `refunded` ONLY after Toss cancel succeeds. On failure, admin sees retry CTA, decision not persisted (§5.3 T-X3). |
| Existing admin dispute UI payload shape divergence | Silent runtime errors when swapping mock → real | Frontend-data-dev owns the adapter in `useAdminDisputes` hook; component file unchanged. Snapshot tests added. |
| Commission rate change (10% → 5%) | Behavior change affecting historical revenue models | Flagged in §12 as PROVISIONAL. Per-order commission stored at creation time → no migration needed for historical orders. |
| `disputes.controller.ts` path currently `/admin/disputes` (admin-only) | Buyer/seller can't file disputes through current controller | Split: keep `/admin/disputes` for admin, add `/marketplace/orders/:id/disputes` (buyer/seller) and `/marketplace/disputes/:id/messages` (participants). |

**External dependencies:**
- `@nestjs/schedule` package (check `apps/api/package.json` — if absent, add in Wave 0).
- Toss cancel API (already wired in `payments.service.ts:511`). Reuse, don't re-implement.
- No new frontend libraries.

---

## 11. Ambiguity Log

| # | Ambiguity | Resolution (provisional) | Needs sign-off? |
|---|-----------|--------------------------|-----------------|
| AM-1 | Escrow provider: Toss 에스크로 API vs in-house ledger | **In-house ledger** (§1.3 rationale) | Yes — product/finance |
| AM-2 | Auto-release window | **T+7d from `deliveredAt`** | Yes — product |
| AM-3 | Platform fee rate | **10% (preserve current)** — task brief suggested 5% but current code is 10%; flipping is a behavior change. Per-order fee stored at order creation so future changes are non-migrating. | Yes — finance |
| AM-4 | Seller response SLA | **72h** | Yes — product |
| AM-5 | Admin decision SLA | **7d** (soft — no auto-escalate in this phase) | Yes — product |
| AM-6 | Partial refund support | **No — binary resolve only** | Yes — product |
| AM-7 | Payout frequency | **On-demand admin batching** (no weekly cron for payouts, only for auto-release) | Yes — finance |
| AM-8 | Seed fake disputes — migrate or drop? | **Drop** (team-match IDs are fake; regeneration value < effort) | No — engineering call |
| AM-9 | Dispute evidence storage | Reuse existing `Upload` model via `DisputeEvidence.uploadId` FK | No — engineering call |
| AM-10 | Dispute type enum | Keep existing 4: `no_show·late·level_mismatch·misconduct` + add `item_defect·not_as_described·not_received` for marketplace | Low — engineering call |
| AM-11 | Refund fee handling | On dispute refund: **platform fee NOT charged** (fair to buyer). Refund amount = order amount. | Yes — finance |
| AM-12 | Scheduler infrastructure | `@nestjs/schedule` in-process for MVP. Redis-backed BullMQ in future if scale requires. | No — engineering call |

If a builder encounters a 13th ambiguity, follow Principle 6: stop, file `BLOCKED: {question}` to orchestrator, return to planning. Do not guess.

---

## 12. Provisional Policy Decisions (PRODUCT/FINANCE SIGN-OFF REQUIRED BEFORE MERGE)

This section is a **standalone override sheet** — any reviewer can accept/override a single row without reading other sections.

| Decision | Default | Override impact |
|----------|---------|-----------------|
| Escrow provider | In-house ledger + Toss 일반 결제 | Switching to Toss 에스크로 API = major rework, new Task 72. |
| Auto-release window | **T+7d from delivered** | Change = single constant `MARKETPLACE_AUTO_RELEASE_DAYS` in `apps/api/src/common/constants/fees.ts`. |
| Platform fee rate | **10%** (preserving current) | Change = single constant `MARKETPLACE_PLATFORM_FEE_RATE`. Historical orders unaffected (per-order stored). |
| Seller dispute response SLA | **72h** | Single constant + UI countdown. |
| Admin dispute decision SLA | **7d** | Single constant (soft, no auto-escalate). |
| Partial refund | **Not supported** | Binary resolve only. |
| Payout batching frequency | **On-demand (admin-triggered)** | Switch to weekly cron = new scheduler job + admin review step. |
| Refund fee | **Platform fee returned in full** | Change = conditional logic in dispute-refund path. |
| Dispute evidence limit | **Up to 5 uploads, 10MB each** (reuses `/uploads` constraints) | Existing upload policy. |
| Dispute window | **Pre-completion: `escrow_held·shipped·delivered` only** | Post-`completed`: no dispute (buyer already confirmed). Override = complex rollback. |

**Signal accept**: reviewer approves PR with no comment on this section → all defaults accepted.
**Signal override**: reviewer comments `OVERRIDE: AM-X → new value` on PR → engineering flips constant before merge.

---

## 13. Deferred / Follow-ups

- **Task 72 (prospective)** — Toss 에스크로 API integration if in-house ledger reconciliation burden exceeds manual admin capacity.
- **Task 73 (prospective)** — Outbound bank transfer automation (PG payout API or 은행 API). Currently admin manually transfers + marks paid.
- **Task 74 (prospective)** — Fraud detection: velocity checks, stolen card patterns, multi-account detection.
- **Dispute arbitration escalation** — if parties contest admin decision, escalate to human review team. Out of scope for MVP.
- **Buyer/seller review on marketplace orders** — separate from dispute, missing today. Track in new task if stakeholder requests.

---

## 14. References

- Task 69 completion report: `.github/tasks/69-completion-report.md`
- Task 69 scope: `.github/tasks/69-unimplemented-features-remediation.md`
- Prisma schema: `apps/api/prisma/schema.prisma`
- Existing marketplace service: `apps/api/src/marketplace/marketplace.service.ts`
- Existing settlements service: `apps/api/src/settlements/settlements.service.ts`
- Existing disputes mock: `apps/api/src/disputes/disputes.service.ts`
- Payment confirm reference (Toss): `apps/api/src/payments/payments.service.ts:402`
- Admin disputes UI: `apps/web/src/app/admin/disputes/page.tsx`
- Admin settlements UI: `apps/web/src/app/admin/settlements/page.tsx`
- CLAUDE.md Core Engineering Principles §1-7.
