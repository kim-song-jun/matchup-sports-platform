# Domain Contract — Payments

## Domain Overview

- 매치 참가 결제 lifecycle: `prepare -> confirm -> refund`
- v1 Task 104 selects Toss Payments for the internal ops payment/refund ledger.
- Browser code may use only the Toss client key; server code may use only the Toss secret key.
- Test/live key families must not be mixed.
- Missing provider credentials fail loudly and must not be rendered as completed payment/refund/payout success.
- Valid v1 runtime source for the internal payment/refund ledger is `apps/v1_api/src/admin/**` plus `apps/v1_web/src/app/ops/**`.

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/admin/payments` | active admin | `/ops` payment/refund ledger |
| POST | `/api/v1/admin/payments/orders` | owner/ops admin | local order creation |
| POST | `/api/v1/admin/payments/confirm` | owner/ops admin | Toss confirm + ledger update |
| POST | `/api/v1/admin/payments/:paymentOrderId/refunds` | owner/ops admin | Toss cancel/refund + refund ledger |
| POST | `/api/v1/admin/payments/webhooks/toss` | provider/internal | Toss webhook reconciliation |

## Request / Response Details

### POST `/api/v1/admin/payments/orders`

Body:

```json
{
  "buyerUserId": "optional-user-id",
  "sourceType": "team_match",
  "sourceId": "team-match-id",
  "amount": 42000,
  "orderName": "팀매치 참가비"
}
```

제약:

- `owner` 또는 `ops` admin만 호출 가능
- `amount`는 양수 정수
- 로컬 order는 `pending`으로 생성되며 provider 성공처럼 표시하지 않는다.

Response `data`:

```json
{
  "order": {
    "paymentOrderId": "payment-order-id",
    "orderId": "tm_...",
    "status": "pending",
    "amount": 42000
  }
}
```

### POST `/api/v1/admin/payments/confirm`

Body:

```json
{
  "orderId": "MU-...",
  "paymentKey": "toss-payment-key",
  "amount": 15000
}
```

제약:

- `orderId` 필수
- `amount`는 DB amount와 일치해야 함
- `pending` 상태와 만료 시간을 확인한다.
- `confirmed` + 동일 `paymentKey`는 idempotent response다.
- Toss confirm 결과의 `orderId`, amount, provider status가 로컬 order와 일치해야 `confirmed`가 된다.
- provider 실패 또는 불일치는 `failed`/`expired`와 provider code/message를 기록하며 성공처럼 표시하지 않는다.

### POST `/api/v1/admin/payments/:paymentOrderId/refunds`

Body:

```json
{
  "amount": 12000,
  "reason": "부분 환불"
}
```

제약:

- `owner` 또는 `ops` admin만 호출 가능
- `confirmed` 또는 `partially_refunded` order만 환불 가능
- completed refund amount를 초과할 수 없다.
- Toss cancel 실패는 refund `failed`와 provider error로 남고, UI는 success tone으로 표시하지 않는다.

### POST `/api/v1/admin/payments/webhooks/toss`

- 내부 수신용 endpoint
- 프론트에서 직접 호출하지 않는다.
- webhook body의 상태를 그대로 신뢰하지 않는다. 서버가 secret key로 Toss 조회 API를 호출해 `paymentKey`/`orderId`/amount/status를 재검증한 뒤 ledger를 업데이트한다.
- provider 재조회가 불가능하면 `verified: false` case event만 남기고 order 상태를 성공으로 바꾸지 않는다.

## Frontend Mapping Notes

- `/ops/payments` uses `useV1OpsPayments()` and `useV1OpsRefundPayment()`.
- `/ops/settlements` uses `useV1OpsSettlements()` and `useV1OpsRequestPayout()`.
- Provider failure returned as `providerError` must render as a visible failure, not as success copy.
- Customer-facing payment routes are outside this Task 104 `/ops` ledger scope unless a separate v1 route/API contract reintroduces them.

## Mock vs Real Semantics

Task 104 `/ops` implementation does not provide a mock-success provider path. Missing keys, mixed test/live keys, provider failure, webhook verification failure, and payout contract gaps are explicit failure states.

## Toss Key And Payout Boundary

- `TOSS_PAYMENTS_CLIENT_KEY`: browser-only.
- `TOSS_PAYMENTS_SECRET_KEY`: server-only.
- `TOSS_PAYMENTS_MODE`: `test | live`; client/secret key prefixes must match the same mode.
- Payment confirm uses `paymentKey`, `orderId`, and `amount` and validates amount/status against the local order.
- Webhook reconciliation re-queries Toss by `paymentKey` or `orderId`; it does not trust the browser or webhook body status as final state.
- Toss 지급대행/payout is a separate contracted API. It requires KYC and stronger encryption/JWE setup, so `/ops/settlements` must show payout attempts as failed/pending until provider confirmation exists.

Official references:

- https://docs.tosspayments.com/reference/using-api/api-keys
- https://docs.tosspayments.com/guides/v2/payment-window/integration-direct
- https://docs.tosspayments.com/guides/v2/webhook
- https://docs.tosspayments.com/guides/v2/payouts

## Edge Cases

- amount mismatch: 400
- orderId 없음/불일치: 404
- already processed payment: 400
- webhook provider verification unavailable: no status transition, `verified: false`

## Error Example

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "매치 참가비와 결제 금액이 일치하지 않습니다.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Source References

- `apps/v1_api/src/admin/admin.controller.ts`
- `apps/v1_api/src/admin/admin-ops.service.ts`
- `apps/v1_api/src/admin/toss-payments.service.ts`
- `apps/v1_api/src/admin/dto/admin.dto.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/components/community/ops-*`
