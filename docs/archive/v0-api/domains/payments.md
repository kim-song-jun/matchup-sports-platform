# Domain Contract — Payments

## Domain Overview

- 매치 참가 결제 lifecycle: `prepare -> confirm -> refund`
- 결제 연동은 `TOSS_SECRET_KEY` 유무에 따라 real/mock mode
- mock mode에서도 앱 전체 deploy를 막지 않는 계약

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments/prepare` | JWT | 결제 준비 |
| POST | `/payments/confirm` | JWT | 결제 승인 |
| POST | `/payments/:id/refund` | JWT | 환불 요청 |
| GET | `/payments/me` | JWT | 내 결제 내역 |
| GET | `/payments/:id` | JWT | 내 결제 상세 |
| POST | `/payments/webhook` | Internal | Toss webhook |

## Request / Response Details

### POST `/payments/prepare`

Body:

```json
{
  "participantId": "match-participant-id",
  "amount": 15000,
  "method": "card"
}
```

제약:

- `participantId`의 owner가 현재 사용자여야 함
- `amount`는 match fee와 일치해야 함
- 이미 completed 상태면 재준비 불가
- 기존 pending payment가 있으면 재사용

Response `data`:

```json
{
  "paymentId": "payment-id",
  "orderId": "MU-...",
  "amount": 15000
}
```

### POST `/payments/confirm`

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
- `amount` 전달 시 DB amount와 일치해야 함
- Toss enabled:
  - 외부 confirm 호출
  - 실패 시 payment status를 `failed`로 전환
- Toss disabled:
  - mock confirm 경로로 `completed` 처리

### POST `/payments/:id/refund`

Body:

```json
{
  "reason": "사용자 요청",
  "note": "상세 메모"
}
```

제약:

- 본인 결제만 환불 가능
- `completed` 상태만 환불 가능
- Toss enabled: real cancel 호출
- Toss disabled:
  - `pgProvider=mock`일 때만 mock 환불 허용
  - 실결제 기록은 `unavailable` 취급으로 환불 차단

### GET `/payments/me`, GET `/payments/:id`

- owner scope 강제
- 프론트 결제 히스토리는 반드시 이 API 결과 기준으로 렌더링

### POST `/payments/webhook`

- 내부 수신용 endpoint
- `TOSS_WEBHOOK_SECRET`가 production에서 없으면 실패
- 프론트에서 직접 호출하지 않는다.

## Frontend Mapping Notes

- `usePreparePayment` -> `PreparedPayment`
- `useConfirmPayment` -> `Payment`
- `useRefundPayment` -> `Payment`
- `usePayment`/`usePayments`는 owner scope 가정
- 결제/환불 UI copy는 mock mode일 때 `테스트 결제/환불`임을 명시해야 한다.

## Mock vs Real Semantics

- Mock mode:
  - confirm/refund는 내부 상태 전이 중심
  - 실제 청구/실환불 없음
- Real mode:
  - Toss API 실패 시 명시적 에러 반환
  - confirm 실패는 `failed`, refund 실패는 5xx 계열 가능

## Edge Cases

- amount mismatch: 400
- orderId 없음/불일치: 404
- already processed payment: 400
- real payment on toss-disabled runtime refund: 400

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

- `apps/api/src/payments/payments.controller.ts`
- `apps/api/src/payments/payments.service.ts`
- `apps/api/src/payments/dto/*.ts`
- `apps/api/test/integration/payments.e2e-spec.ts`
- `apps/web/src/hooks/use-api.ts` (`usePreparePayment`, `useConfirmPayment`, `useRefundPayment`, `usePayments`, `usePayment`)
