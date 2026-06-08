# Domain Contract — Admin & Ops

## Scope

This document follows the v1 split introduced by Task 104.

- `/admin` frontend: customer-facing operations ERP for team owners, managers, and match hosts.
- `/ops` frontend: internal Teameet operator console.
- `/api/v1/admin/*`: internal operator API namespace used by `/ops`.

Do not use legacy `apps/api`, `apps/web`, memory-only disputes, or old admin route contracts as v1 source of truth.

## Source References

- Backend: `apps/v1_api/src/admin/admin.controller.ts`, `apps/v1_api/src/admin/admin.service.ts`, `apps/v1_api/src/admin/admin-ops.service.ts`, `apps/v1_api/src/admin/toss-payments.service.ts`, `apps/v1_api/src/admin/dto/admin.dto.ts`
- Data: `apps/v1_api/prisma/schema.prisma`, `apps/v1_api/prisma/migrations/20260608000000_v1_admin_ops_split/migration.sql`
- Frontend: `apps/v1_web/src/app/admin/**`, `apps/v1_web/src/app/ops/**`, `apps/v1_web/src/components/community/admin-*`, `apps/v1_web/src/components/community/ops-*`, `apps/v1_web/src/hooks/use-v1-api.ts`

## `/admin` Customer Workspace

`/admin` remains a customer operations workspace and must not call internal `/api/v1/admin/*` endpoints.

Valid customer `/admin` data sources:

- `/api/v1/me/profile`
- `/api/v1/me/teams?permission=manage_team`
- `/api/v1/me/matches`
- `/api/v1/me/team-matches`
- `/api/v1/notifications`
- `/api/v1/reviews`
- team join request workflows

Valid customer routes:

- `/admin`
- `/admin/matches`
- `/admin/team-matches`
- `/admin/teams`
- `/admin/reviews`
- `/admin/notifications`
- `/admin/audit`

## `/ops` Internal Console

`/ops` must call `/api/v1/admin/me` first. If the response is forbidden or inactive, the page renders an explicit forbidden/error state and must not pretend an internal queue loaded successfully.

Routes:

- `/ops`
- `/ops/reports`
- `/ops/disputes`
- `/ops/payments`
- `/ops/settlements`
- `/ops/audit`

## Internal API Matrix

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/me` | active admin | current admin and capabilities |
| `GET` | `/api/v1/admin/ops/overview` | active admin | report/dispute/payment/refund/settlement/payout queue counts |
| `GET` | `/api/v1/admin/reports` | active admin | report queue |
| `GET` | `/api/v1/admin/reports/:reportId` | active admin | report detail + events |
| `POST` | `/api/v1/admin/reports/:reportId/actions` | owner/ops admin | assign/review/resolve/dismiss report |
| `GET` | `/api/v1/admin/disputes` | active admin | dispute queue |
| `GET` | `/api/v1/admin/disputes/:disputeId` | active admin | dispute detail + events |
| `POST` | `/api/v1/admin/disputes/:disputeId/actions` | owner/ops admin | assign/wait/resolve/reject dispute |
| `GET` | `/api/v1/admin/payments` | active admin | payment/refund ledger |
| `POST` | `/api/v1/admin/payments/orders` | owner/ops admin | create local payment order |
| `POST` | `/api/v1/admin/payments/confirm` | owner/ops admin | confirm Toss payment against local order |
| `POST` | `/api/v1/admin/payments/:paymentOrderId/refunds` | owner/ops admin | request/call provider refund |
| `POST` | `/api/v1/admin/payments/webhooks/toss` | provider/internal | reconcile Toss webhook without browser/admin session |
| `GET` | `/api/v1/admin/settlements` | active admin | settlement/payout queue |
| `GET` | `/api/v1/admin/settlements/:settlementBatchId` | active admin | settlement detail + events |
| `POST` | `/api/v1/admin/settlements/:settlementBatchId/actions` | owner/ops admin | review/approve/hold/fail settlement |
| `POST` | `/api/v1/admin/settlements/:settlementBatchId/payouts` | owner/ops admin | request payout attempt |
| `GET` | `/api/v1/admin/ops/audit` | active admin | action logs + case events |

## Authorization

- Active `V1AdminUser` is required for all `/ops` reads.
- `support` admins can read queues and audit but cannot mutate report/dispute/refund/settlement/payout actions.
- Mutations require `reason` and write both `v1_admin_action_logs` and the relevant `v1_ops_case_events` history.

## Data Tables

- `v1_ops_reports`
- `v1_ops_disputes`
- `v1_payment_orders`
- `v1_payment_transactions`
- `v1_payment_refunds`
- `v1_settlement_sellers`
- `v1_settlement_accounts`
- `v1_settlement_batches`
- `v1_settlement_items`
- `v1_payout_attempts`
- `v1_ops_case_events`
- existing `v1_admin_users`, `v1_admin_action_logs`, `v1_status_change_logs`

## Toss Boundary

- Browser code can receive/use Toss client key only.
- Server code can use Toss secret key only.
- Test/live client and secret key families must not be mixed.
- Payment confirm validates `orderId`, `paymentKey`, amount, stale orders, and terminal/idempotent states before ledger update.
- Payment webhooks are reconciled by re-querying Toss with the server secret key; unverified webhook body state does not change ledger status.
- Refund failure remains visible as `failed` refund status and provider error.
- Toss 지급대행 is separate from core payment cancel. Payout attempts stay `failed` or pending until contracted API, KYC, and JWE/encryption setup are available and provider confirmation is recorded.

Official Toss references checked for Task 104:

- https://docs.tosspayments.com/reference/using-api/api-keys
- https://docs.tosspayments.com/guides/v2/payment-window/integration-direct
- https://docs.tosspayments.com/guides/v2/webhook
- https://docs.tosspayments.com/guides/v2/payouts
