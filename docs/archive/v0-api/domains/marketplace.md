# Domain Contract — Marketplace

## Domain Overview

- 공개 매물 탐색 + 인증 사용자의 매물 생성/수정/삭제 + 주문 결제 확인
- listing은 soft delete 기반
- 결제는 Toss key 유무에 따라 real/mock 분기

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/marketplace/listings` | Public | 매물 목록 (cursor pagination) |
| GET | `/marketplace/listings/:id` | Public | 매물 상세 |
| POST | `/marketplace/listings` | JWT | 매물 등록 |
| PATCH | `/marketplace/listings/:id` | JWT | 매물 수정 |
| DELETE | `/marketplace/listings/:id` | JWT | 매물 삭제(soft) |
| POST | `/marketplace/listings/:id/order` | JWT | 주문 생성(결제 prepare) |
| POST | `/marketplace/orders/:orderId/confirm` | JWT | 주문 결제 확인 |

## Request / Response Details

### GET `/marketplace/listings`

- Query: `sportType, category, condition, teamId, venueId, cursor, limit`
- `limit` 처리: `1..100` clamp
- `data` shape: `{ items, nextCursor }`

### POST `/marketplace/listings`

- Body: `CreateListingDto`
- required:
  - `title`, `description`, `sportType`, `category`, `condition`, `price`
- optional:
  - `listingType`, `imageUrls`, `locationCity`, `locationDistrict`
  - `teamId` or `venueId` (동시 지정 불가)
  - `rentalPricePerDay`, `rentalDeposit`, `groupBuyTarget`, `groupBuyDeadline`
- affiliation 권한:
  - team: manager+
  - venue: owner/admin

### PATCH `/marketplace/listings/:id`

- seller only
- deleted listing 수정 불가
- `status=deleted|expired`를 수정 API에서 직접 설정 불가
- partial update (undefined 필드 미변경)

### DELETE `/marketplace/listings/:id`

- seller only
- 이미 deleted면 `{ deleted: true }`로 no-op

### POST `/marketplace/listings/:id/order`

- self-buy 금지
- 반환:

```json
{
  "order": {
    "id": "order-id",
    "orderId": "MU-MKT-....",
    "status": "pending"
  },
  "payment": {
    "orderId": "MU-MKT-....",
    "amount": 50000
  }
}
```

### POST `/marketplace/orders/:orderId/confirm`

- buyer only
- status가 `pending`일 때만 가능
- Toss confirm 성공 시 `paid`
- 이미 처리된 order는 400

## Frontend Mapping Notes

- `useListings`/`useListing`는 `PaginatedResponse<MarketplaceListing>` 계약 사용
- `useCreateListing`/`useUpdateListing`/`useDeleteListing` 후 list/detail invalidate 필요
- 주문 결제 확인은 checkout flow에서 `orderId`를 단일 키로 관리한다.

## Edge Cases

- 자신의 매물 구매 시 400
- deleted listing 조회 시 404
- affiliation를 `teamId`/`venueId` 동시에 보내면 400
- processed order 재확정 시 400

## Error Example

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "자신의 매물을 구매할 수 없습니다.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Source References

- `apps/api/src/marketplace/marketplace.controller.ts`
- `apps/api/src/marketplace/marketplace.service.ts`
- `apps/api/src/marketplace/dto/create-listing.dto.ts`
- `apps/api/src/marketplace/dto/update-listing.dto.ts`
- `apps/web/src/hooks/use-api.ts` (`useListings`, `useListing`, `useCreateListing`, `useUpdateListing`, `useDeleteListing`)
