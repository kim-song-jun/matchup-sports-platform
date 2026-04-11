# Realtime And Notifications Contract

이 문서는 Socket.IO 실시간 이벤트와 REST 알림 API를 함께 사용할 때의 프론트 통합 계약을 정의한다.

## Source Of Truth Priority

1. `apps/api/src/realtime/realtime.gateway.ts`
2. `apps/api/src/notifications/notifications.controller.ts`
3. `apps/api/src/notifications/notifications.service.ts`
4. `apps/api/src/notifications/notification-presentation.ts`
5. `apps/web/src/hooks/use-realtime.ts`
6. `apps/web/src/lib/realtime-client.ts`
7. `apps/web/src/hooks/use-api.ts`

## 연결 계약

- WS URL: `NEXT_PUBLIC_WS_URL` (없으면 `http://localhost:8111`)
- 인증 토큰 전달:
  - `auth: { token }` 우선
  - query token fallback 허용
- 연결 직후 서버는 `user:{userId}` room에 자동 join
- 토큰이 없거나 검증 실패면 disconnect

## REST vs WebSocket 역할 분리

- REST는 source of truth 조회/수정
  - `/notifications`, `/notifications/unread-count`, `/notifications/:id/read`, `/notifications/read-all`
  - `/chat/rooms`, `/chat/rooms/:id/messages`, `/chat/rooms/:id/read`
- WebSocket은 실시간 반영
  - `notification:new`, `notification:read`, `notification:read-all`
  - `chat:message`, `chat:message-deleted`, typing events

## Notification Event Contract

| Event | Direction | Payload |
|---|---|---|
| `notification:new` | server -> client | `NotificationView` |
| `notification:read` | server -> client | `{ notificationId }` |
| `notification:read-all` | server -> client | `{ count }` |
| `notification:read` | client -> server | `{ notificationId }` |

## Chat Event Contract

| Event | Direction | Payload |
|---|---|---|
| `chat:join` | client -> server | `{ roomId }` |
| `chat:leave` | client -> server | `{ roomId }` |
| `chat:message` | client -> server | `{ roomId, message, imageUrl? }` |
| `chat:message` | server -> client | persisted message payload |
| `chat:error` | server -> client | `{ code, message }` |
| `chat:typing` / `chat:stop-typing` | bidirectional | typing status |

## Late-Connect / Backfill 규칙

- WebSocket 이벤트만으로 unread 정합성을 보장하지 않는다.
- 앱 정책:
  - `useNotificationSync()`는 연결 직후 강제 invalidate(backfill) 수행
  - visibility/focus 복귀 시 재조회
  - `useNotifications()`는 30초 polling + focus/reconnect refetch
  - `useUnreadCount()`는 60초 polling
- 실제 재조회 트리거:
  - 알림센터/notification list 화면 mount 직후
  - 숨김 탭에서 복귀한 직후 (`visibilitychange`)
  - 브라우저 focus 복귀 시점
  - websocket 재연결 직후
  - 읽음 처리 mutation 성공 직후 필요 쿼리 invalidate
- 채팅 화면에서도 동일하게 적용:
  - room 진입 직후 REST로 최신 메시지 fetch
  - reconnect 후 current room message list / unread total 재조회
- 결론:
  - 실시간은 UX 가속용
  - 정합성은 REST 재조회로 보정

## 알림 링크/CTA 생성 규칙

- 서버는 `notification-presentation.ts`에서 `category`, `link`, `ctaLabel`을 생성한다.
- 프론트는 type별 링크를 다시 추측하지 말고 payload의 `link`를 우선 사용한다.

## Caution

- WebSocket 이벤트 누락/지연이 가능하므로, 탭 복귀 시 무조건 invalidate 경로를 유지해야 한다.
- `chat:message`를 WS와 REST에서 동시에 낙관 반영하면 중복 렌더 위험이 있다.
- notification preference가 row 없이 시작될 수 있다. 기본값(all enabled)을 전제로 UI를 렌더링해야 한다.

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

- `apps/api/src/realtime/realtime.gateway.ts`
- `apps/api/src/chat/chat.service.ts`
- `apps/api/src/notifications/notifications.service.ts`
- `apps/api/src/notifications/notification-presentation.ts`
- `apps/web/src/hooks/use-realtime.ts`
- `apps/web/src/lib/realtime-client.ts`
