# Domain Contract — Lessons

## Domain Overview

- 공개 레슨 탐색 + 인증 사용자의 생성/티켓 구매/결제확인
- 결제 연동은 Toss key 유무에 따라 real/mock mode가 분기된다.

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/lessons` | Public | 레슨 목록 (cursor pagination) |
| GET | `/lessons/:id` | Public | 레슨 상세 |
| GET | `/lessons/tickets/me` | JWT | 내 수강권 목록 |
| POST | `/lessons` | JWT | 레슨 생성 |
| POST | `/lessons/plans/:planId/purchase` | JWT | 티켓 구매 준비 |
| POST | `/lessons/tickets/:ticketId/confirm` | JWT | 티켓 결제 확인 |

## Request / Response Details

### GET `/lessons`

- Query:
  - `sportType`, `type`, `teamId`, `venueId`
  - `cursor`, `limit`
- `limit` 처리:
  - controller에서 `parseInt`
  - `NaN` -> 20
  - `1..100` clamp
- `data` shape:

```json
{
  "items": [],
  "nextCursor": null
}
```

### GET `/lessons/:id`

- ticketPlans(active only) + upcomingSchedules 포함
- 404: 레슨 미존재

### POST `/lessons`

- Body: `CreateLessonDto`
- 핵심 필드:
  - required: `sportType`, `type`, `title`, `lessonDate`, `startTime`, `endTime`, `maxParticipants`
  - optional: `teamId`, `venueId`, `venueName`, `fee`, `levelMin`, `levelMax`, `coachName`, `coachBio`, `imageUrls`, `isRecurring`, `recurringDays`, `recurringUntil`
- 제약:
  - `teamId`와 `venueId` 동시 지정 불가
  - team affiliation이면 manager+ 권한 필요
  - venue affiliation이면 admin 또는 venue owner 필요

### POST `/lessons/plans/:planId/purchase`

- body 없음
- 반환:
  - `ticket`
  - `payment: { orderId, amount, ticketId }`
- 동일 draft ticket가 있으면 재사용(idempotent-like 동작)

### POST `/lessons/tickets/:ticketId/confirm`

- Body:

```json
{
  "paymentKey": "toss-payment-key-or-optional-in-free-case"
}
```

- 제약:
  - 본인 ticket만 확인 가능
  - 이미 결제 완료 ticket 재확인 불가
  - 유료 ticket은 `paymentKey` 필수
- Toss key 없으면 mock confirm path 사용

## Frontend Mapping Notes

- `useLessons`: `PaginatedResponse<Lesson>`
- `usePurchaseLessonTicket`: checkout 전 단계에서 orderId/amount 확보
- `useConfirmLessonTicketPayment`: 성공 시 `myTickets`, `lesson detail`, `lesson list` invalidate
- 프론트 폼 상태의 UI-only 필드는 submit 전에 제거한다.

## Edge Cases

- 비활성 ticket plan 구매 시 400
- 본인 강좌 ticket 구매 시 400
- free ticket는 backend-generated paymentId(`FREE-LESSON-*`) 경로 가능
- affiliation 권한 실패 시 403
- `teamId` + `venueId` 동시 지정 시 400

## Error Example

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "비활성화된 티켓 플랜입니다.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Caution

- 현재 lessons 도메인의 host 관리(수정/상태전환)는 이 문서 범위의 endpoint에 포함되지 않는다.
- 프론트는 존재하지 않는 `/lessons/:id/edit` 류 API를 추측해서 호출하면 안 된다.

## Source References

- `apps/api/src/lessons/lessons.controller.ts`
- `apps/api/src/lessons/lessons.service.ts`
- `apps/api/src/lessons/dto/create-lesson.dto.ts`
- `apps/web/src/hooks/use-api.ts` (`useLessons`, `useLesson`, `useCreateLesson`, `useMyLessonTickets`, `usePurchaseLessonTicket`, `useConfirmLessonTicketPayment`)
