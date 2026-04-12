# Domain Contract — Venues

## Domain Overview

- 공개 조회 중심 도메인 + 제한적 수정 기능
- self-service ownership 모델은 팀과 다르며, 현재는 `owner/admin` 수정만 허용
- `:id/schedule`은 빈 슬롯이 아니라 "향후 7일 예약된 매치 목록" 계약

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/venues` | Public | 시설 목록 조회 |
| GET | `/venues/:id` | Public | 시설 상세 조회 |
| GET | `/venues/:id/hub` | Optional JWT | 허브 집계 데이터 |
| GET | `/venues/:id/schedule` | Public | 향후 7일 매치 예약 목록 |
| POST | `/venues/:id/reviews` | JWT | 시설 리뷰 작성 |
| PATCH | `/venues/:id` | JWT | 시설 수정 (owner/admin) |

## Request / Response Details

### GET `/venues`

- Query: `city`, `type`, `sportType`
- `data` shape: `Venue[]`
- 정렬: `rating desc`

### GET `/venues/:id`

- 포함 데이터:
  - owner 기본 정보
  - 최신 리뷰 최대 10개
- NotFound 시 404

### GET `/venues/:id/hub`

- Optional auth endpoint
- 쿼리/헤더 파라미터 없이 JWT 존재 여부로 자동 분기 (`OptionalJwtAuthGuard`)
- 컨트롤러가 `@CurrentUser('id') userId?` 와 `@CurrentUser('role') userRole?` 두 값을 서비스에 전달한다.
- `userRole`은 `capabilities` 계산 시 admin 권한 여부를 판단하는 데 사용된다.
- 로그인 여부 및 역할에 따라 `capabilities` 해석이 달라진다.
- `data` 주요 필드:
  - `venue`
  - `sections` (`goodsCount`, `passesCount`, `eventsCount`, `scheduleCount`, `reviewCount`)
  - `goods`, `passes`, `events`
  - `capabilities` (`canEditProfile`, `canManageGoods`, `canManagePasses`, `canManageEvents`)

### GET `/venues/:id/schedule`

- free/busy grid가 아니라 예약 목록 반환
- `data` shape: `VenueScheduleSlot[]`

```json
{
  "status": "success",
  "data": [
    {
      "id": "match-id",
      "title": "Sunday Game",
      "matchDate": "2026-04-12T00:00:00.000Z",
      "startTime": "10:00",
      "endTime": "12:00",
      "sportType": "futsal",
      "status": "recruiting"
    }
  ],
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

### POST `/venues/:id/reviews`

- Auth required
- Caution: body가 DTO가 아닌 `Record<string, unknown>`
- 실사용 필드:
  - `rating` (required)
  - `facilityRating`, `accessRating`, `costRating`, `iceQuality`
  - `comment`
  - `imageUrls: string[]`

### PATCH `/venues/:id`

- Auth required
- 권한: owner 또는 admin
- Body: `UpdateVenueDto`
  - optional patch 방식 (`undefined` 필드는 업데이트 안 함)
- 403: non-owner/non-admin

## Frontend Mapping Notes

- `useVenues`는 응답이 배열이어도 내부에서 `{ items, nextCursor }`로 정규화한다.
- `useVenueHub`는 `retry: 0`으로 되어 있어 권한/데이터 오류가 즉시 UI에 반영된다.
- `useVenueSchedule`는 availability 캘린더 가정이 아니라 예약 카드 리스트를 전제로 구현한다.
- 리뷰 작성 payload에 UI-only 필드를 넣으면 ValidationPipe 정책상 실패 가능성이 높다.

## Edge Cases

- `POST /venues/:id/reviews`는 weakly typed body라서 프론트 payload 정제가 중요하다.
- `PATCH /venues/:id`는 venue owner가 없거나 불일치하면 403.
- `findHub`의 capability는 viewer `userId` + `userRole` 두 값에 의존하므로 비로그인에서 관리 CTA를 노출하면 안 된다.

## Error Example

```json
{
  "status": "error",
  "statusCode": 403,
  "message": "시설을 수정할 권한이 없습니다.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Source References

- `apps/api/src/venues/venues.controller.ts`
- `apps/api/src/venues/venues.service.ts`
- `apps/api/src/venues/dto/update-venue.dto.ts`
- `apps/web/src/hooks/use-api.ts` (`useVenues`, `useVenue`, `useVenueHub`, `useVenueSchedule`, `useCreateVenueReview`)
