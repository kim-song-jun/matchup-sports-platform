# V1 Admin Ops API

## Scope

Internal Teameet operator console for `/ops`. `/admin` remains the customer-facing operations workspace and must not consume these queue APIs.

## Auth

- All read endpoints require active `V1AdminUser`.
- `support` admins may read but cannot mutate protected operations.
- Mutations require `reason` and write `v1_admin_action_logs` plus `v1_ops_case_events`.

## Endpoint Matrix

| Method | Path | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/admin/ops/overview` | active admin | headers only | queue counts + recent case events |
| `GET` | `/api/v1/admin/reports` | active admin | `status?`, `targetType?`, `targetId?`, `cursor?`, `limit?` | cursor report queue |
| `GET` | `/api/v1/admin/reports/:reportId` | active admin | path | report + event history |
| `POST` | `/api/v1/admin/reports/:reportId/actions` | owner/ops | `{ action, reason, resolutionNote? }` | updated report |
| `GET` | `/api/v1/admin/disputes` | active admin | queue query | cursor dispute queue |
| `GET` | `/api/v1/admin/disputes/:disputeId` | active admin | path | dispute + event history |
| `POST` | `/api/v1/admin/disputes/:disputeId/actions` | owner/ops | `{ action, reason, resolutionNote? }` | updated dispute |
| `GET` | `/api/v1/admin/payments` | active admin | queue query | cursor payment/refund ledger |
| `POST` | `/api/v1/admin/payments/orders` | owner/ops | `{ buyerUserId?, sourceType, sourceId, amount, orderName }` | local payment order |
| `POST` | `/api/v1/admin/payments/confirm` | owner/ops | `{ paymentKey, orderId, amount }` | confirmed order or explicit provider error |
| `POST` | `/api/v1/admin/payments/:paymentOrderId/refunds` | owner/ops | `{ amount, reason }` | refund status, order, or provider error |
| `POST` | `/api/v1/admin/payments/webhooks/toss` | provider/internal | `{ eventType, paymentKey?, orderId?, amount?, payload? }` | webhook reconciliation result |
| `GET` | `/api/v1/admin/settlements` | active admin | queue query | cursor settlement queue |
| `GET` | `/api/v1/admin/settlements/:settlementBatchId` | active admin | path | settlement + events |
| `POST` | `/api/v1/admin/settlements/:settlementBatchId/actions` | owner/ops | `{ action, reason }` | updated settlement |
| `POST` | `/api/v1/admin/settlements/:settlementBatchId/payouts` | owner/ops | `{ reason, amount? }` | payout attempt + provider boundary |

## Statuses

- Report: `open | reviewing | resolved | dismissed`
- Dispute: `open | assigned | waiting_party | resolved | rejected`
- Payment order: `pending | confirmed | failed | cancelled | refunded | partially_refunded | expired`
- Refund: `requested | reviewing | approved | rejected | processing | completed | failed`
- Settlement batch: `draft | reviewing | approved | payout_requested | partially_paid | paid | failed | held`
- Payout attempt: `requested | processing | succeeded | failed | partial | cancelled`

## Toss Contract

- Client key is browser-only; secret key is server-only.
- `TOSS_PAYMENTS_SECRET_KEY`, `TOSS_PAYMENTS_CLIENT_KEY`, and `TOSS_PAYMENTS_MODE` must stay mode-compatible.
- Confirm validates local order, amount, terminal state, idempotent provider key, stale order, and provider result before setting `confirmed`.
- Webhook reconciliation re-queries Toss by `paymentKey` or `orderId`; if provider verification fails or amount/order mismatch is detected, v1 records an unverified case event and does not transition the order to success.
- Refund creates a refund record first, calls Toss cancel, and records `completed` or `failed` with provider code/message.
- 지급대행 payout is not the same API as payment cancel. It requires separate contract/KYC and JWE/security-key setup, so v1 records a failed payout attempt instead of fake success until provider confirmation exists.

Official references:

- https://docs.tosspayments.com/reference/using-api/api-keys
- https://docs.tosspayments.com/guides/v2/payment-window/integration-direct
- https://docs.tosspayments.com/guides/v2/webhook
- https://docs.tosspayments.com/guides/v2/payouts
