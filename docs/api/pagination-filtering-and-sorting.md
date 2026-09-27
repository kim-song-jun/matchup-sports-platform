# Pagination, Filtering, Sorting Contract

> **v0 기준 서술 — v1 확인 필요.** 이 문서의 엔드포인트·에러 코드·상세 계약은 레거시 `apps/api`/`apps/web` 시절에 작성됐다. 파일 경로는 v1(`apps/v1_api`/`apps/v1_web`)로 갱신했지만, 계약 내용 자체가 v1 실제 동작과 일치하는지는 이번 변경에서 검증하지 않았다(2026-09-27, docs/api 레거시 분리 작업).

이 문서는 프론트엔드에서 목록 API를 붙일 때 가장 많이 발생하는 드리프트를 막기 위한 규칙 문서다.

## Source Of Truth Priority

1. `apps/v1_api/src/**/*.controller.ts`
2. `apps/v1_api/src/**/dto/*.ts`
3. `apps/v1_api/src/**/*.service.ts`
4. `apps/v1_api/src/**/*.spec.ts` + `apps/v1_api/test/**/*.integration-spec.ts`
5. `apps/v1_web/src/hooks/use-v1-api.ts`
6. `apps/v1_web/src/types/api.ts`
7. Swagger (`/docs`)는 보조 참조

## 공통 규칙

- 기본 API prefix: `/api/v1`
- 성공 응답: `{ status: "success", data, timestamp }`
- 에러 응답: `{ status: "error", statusCode, message, timestamp }`
- `ValidationPipe`는 `transform + whitelist + forbidNonWhitelisted`
- 리스트 응답은 도메인별로 shape가 다르다. 공통 타입 하나로 가정하지 않는다.

## List Shape Matrix

| Surface | Endpoint | Query | Response `data` shape | Cursor 키 |
|---|---|---|---|---|
| Lessons | `GET /lessons` | `sportType,type,teamId,venueId,cursor,limit` | `{ items, nextCursor }` | `cursor` |
| Marketplace | `GET /marketplace/listings` | `sportType,category,condition,teamId,venueId,cursor,limit` | `{ items, nextCursor }` | `cursor` |
| Mercenary | `GET /mercenary` | DTO(`sportType,status,teamId,cursor,limit`) | `{ items, nextCursor }` | `cursor` |
| Chat Rooms | `GET /chat/rooms` | `before,limit` | `{ data, nextCursor, hasMore }` | `before` |
| Chat Messages | `GET /chat/rooms/:id/messages` | `before,limit` | `{ data, nextCursor, hasMore }` | `before` |
| Notifications | `GET /notifications` | `isRead,cursor,limit` | `Notification[]` | 커서 필드 미노출 |
| Venues | `GET /venues` | `city,type,sportType` | `Venue[]` | 없음 |

## Query Parsing 주의사항

- `Lessons`, `Marketplace`:
  - `limit`은 controller에서 수동 파싱한다.
  - `NaN`이면 내부 기본값(`20`)로 보정되고, 최종적으로 `1..100` clamp된다.
- `Mercenary`, `Chat`:
  - DTO 기반 class-transformer 적용 (`@Type(() => Number)`).
  - 잘못된 타입은 Validation 에러가 발생할 수 있다.
- `Notifications`:
  - `isRead`는 문자열 비교로 처리한다. `"true"`만 `true`, 그 외 값은 `false`로 해석될 수 있다.

## 프론트 구현 규칙

- URLSearchParams 직렬화 시 boolean은 문자열로 명시한다.
  - 예: `isRead=true`, `isRead=false`
- `limit`은 숫자 문자열로 보내되, UI에서 미리 `1..100` 범위 제한을 권장한다.
- cursor는 서버가 준 값을 그대로 전달한다. 클라이언트에서 변환/파싱하지 않는다.
- `items` 기반과 `data` 기반을 혼용하지 않는다.
  - `useChatMessages`/`useChatRooms`는 응답 shape를 먼저 정규화한 뒤 컴포넌트로 넘긴다.

## 빈/부분 응답 처리

- 마지막 페이지:
  - `nextCursor: null` 또는 `hasMore: false`
- 빈 리스트:
  - `items: []` 또는 `data: []`
- notification list는 pagination metadata가 없으므로 "더 보기" UI를 바로 붙이지 않는다.

## Error Example

`400 Bad Request` (limit/type mismatch)

```json
{
  "status": "error",
  "statusCode": 400,
  "message": [
    "limit must not be greater than 100"
  ],
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Caution

- `GET /notifications`는 query에 `cursor`가 있으나 응답에 cursor를 노출하지 않는다. 프론트에서 완전한 infinite scroll 계약으로 가정하면 드리프트가 발생한다.

## Source References

- `apps/v1_api/src/chat/chat.controller.ts`
- `apps/v1_api/src/notifications/notifications.controller.ts`
- `apps/v1_api/src/matches/matches.controller.ts`
- `apps/v1_api/src/tournaments/tournaments-read.controller.ts`
- `apps/v1_api/src/chat/chat.service.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`

> `lessons`/`marketplace`/`mercenary` 컨트롤러·서비스 예시는 삭제했다 — 해당 도메인은
> v1(`apps/v1_api/src`)에 존재하지 않는다(v0 전용 비즈니스 도메인). 대신 v1에 실재하는
> `matches`/`tournaments`로 예시를 교체했다.
