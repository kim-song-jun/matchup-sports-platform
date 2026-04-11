# Domain Contract — Chat

## Domain Overview

- JWT required 도메인
- REST + WebSocket 병행
- soft delete, unread 집계, room access 권한 검증 포함

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/chat/rooms` | JWT | 채팅방 목록 |
| POST | `/chat/rooms` | JWT | 채팅방 생성 |
| GET | `/chat/rooms/:id` | JWT | 채팅방 상세 |
| GET | `/chat/rooms/:id/messages` | JWT | 메시지 목록 |
| POST | `/chat/rooms/:id/messages` | JWT | 메시지 전송 |
| DELETE | `/chat/rooms/:roomId/messages/:messageId` | JWT | 메시지 soft delete |
| PATCH | `/chat/rooms/:id/read` | JWT | 읽음 처리 |
| GET | `/chat/unread-count` | JWT | unread 총합 |

## Request / Response Details

### GET `/chat/rooms`

- Query: `before`, `limit`
- `data` shape: `{ data, nextCursor, hasMore }`

### GET `/chat/rooms/:id/messages`

- Query: `before`, `limit`
- `data` shape: `{ data, nextCursor, hasMore }`
- 삭제 메시지는 `content="삭제된 메시지입니다"`, `imageUrl=null`로 마스킹

### POST `/chat/rooms`

Body(`CreateRoomDto`) 핵심:

- `type` 필수 (`team_match`, `direct`, `team`)
- `type=team_match`: `teamMatchId` 필요, `participantIds` 무시될 수 있음
- 그 외 type: `participantIds` 필요

동작:

- `team_match`는 get-or-create(idempotent) 경로

### POST `/chat/rooms/:id/messages`

Body(`PostMessageDto`):

```json
{
  "content": "안녕하세요",
  "imageUrl": "https://..."
}
```

- `content`와 `imageUrl` 둘 다 비어있으면 400
- 차단 관계가 있으면 403(`CHAT_BLOCKED`)

### PATCH `/chat/rooms/:id/read`

Body:

```json
{
  "messageId": "chat-message-id"
}
```

- participant가 아니면 403
- message가 room에 속하지 않으면 404

## Frontend Mapping Notes

- `useChatRooms`는 `{ data, nextCursor, hasMore }`와 배열 응답 둘 다 방어적으로 처리
- `useChatMessages`는 cursor page object(`{ data, nextCursor, hasMore }`)를 그대로 파싱한다.
- `useCreateChatRoom`는 `CreateRoomDto`와 동일하게 `type`, `teamMatchId`, `participantIds`만 전달한다.
- `useMarkChatRead`는 최신 메시지 id를 기준으로 `PATCH /chat/rooms/:id/read`를 호출한다.
- WS 수신(`chat:message`)과 REST 재조회를 동시에 aggressive하게 하면 중복 렌더 가능성이 있으므로 invalidate 전략을 명확히 분리한다.

## Edge Cases

- room participant가 아니면 대부분 403(`CHAT_FORBIDDEN`)
- 메시지 삭제는 idempotent(no-op) 처리
- unread count는 단일 raw query 기반 집계로 계산

## Error Example

```json
{
  "status": "error",
  "statusCode": 403,
  "message": {
    "code": "CHAT_FORBIDDEN",
    "message": "채팅방 접근 권한이 없습니다."
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Source References

- `apps/api/src/chat/chat.controller.ts`
- `apps/api/src/chat/chat.service.ts`
- `apps/api/src/chat/dto/*.ts`
- `apps/web/src/hooks/use-api.ts` (`useChatRooms`, `useChatMessages`, `useCreateChatRoom`, `useSendMessage`, `useMarkChatRead`, `useChatUnreadTotal`)
- `apps/web/src/hooks/use-realtime.ts`
