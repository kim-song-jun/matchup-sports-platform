# Domain Contract — Notifications

## Domain Overview

- 알림 조회/읽음 처리/환경설정/웹푸시 구독 도메인
- REST와 WebSocket 이벤트가 함께 동작
- preference row가 없어도 기본값(all enabled) 반환

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | JWT | 알림 목록 |
| GET | `/notifications/unread-count` | JWT | unread 개수 |
| PATCH | `/notifications/:id/read` | JWT | 단건 읽음 |
| PATCH | `/notifications/read-all` | JWT | 전체 읽음 |
| GET | `/notifications/preferences` | JWT | 설정 조회 |
| PATCH | `/notifications/preferences` | JWT | 설정 업데이트(upsert) |
| GET | `/notifications/vapid-public-key` | Public | 웹푸시 공개키 |
| POST | `/notifications/push-subscribe` | JWT | 웹푸시 구독 |
| DELETE | `/notifications/push-unsubscribe` | JWT | 웹푸시 구독 해제 |

## Request / Response Details

### GET `/notifications`

- Query:
  - `isRead` (`"true"`만 true 처리)
  - `cursor`, `limit`
- Response `data`: `Notification[]`
- Caution: query에 cursor가 있지만 응답에 nextCursor가 없다.

### PATCH `/notifications/:id/read`

- owner check 강제
- 성공 시 서버가 `notification:read` WS 이벤트 emit

### PATCH `/notifications/read-all`

- unread 전부 true 처리
- `data: { count }`
- 성공 시 `notification:read-all` WS 이벤트 emit

### GET/PATCH `/notifications/preferences`

- row가 없으면 default:

```json
{
  "id": null,
  "matchEnabled": true,
  "teamEnabled": true,
  "chatEnabled": true,
  "paymentEnabled": true
}
```

- PATCH는 upsert
- 부분 필드만 보내도 된다.

### POST `/notifications/push-subscribe`

Body:

```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": {
    "p256dh": "base64url",
    "auth": "base64url"
  }
}
```

### DELETE `/notifications/push-unsubscribe`

Body:

```json
{
  "endpoint": "https://fcm.googleapis.com/..."
}
```

## Frontend Mapping Notes

- `useNotifications`:
  - 30초 polling + focus/reconnect refetch
  - 소켓 이벤트 누락 시 backfill 역할
- `useMarkNotificationRead`/`useMarkAllNotificationsRead`:
  - optimistic update + rollback
- `useNotificationPreferences`:
  - staleTime 0 + mount/focus always refetch

## Edge Cases

- 타 사용자 알림 read 시 403
- push VAPID 미설정 환경에서는 Web Push disabled(no-op 가능)
- preference 설정이 없을 때도 UI는 정상 초기 상태로 렌더링해야 함

## Error Example

```json
{
  "status": "error",
  "statusCode": 404,
  "message": "알림을 찾을 수 없습니다.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Source References

- `apps/api/src/notifications/notifications.controller.ts`
- `apps/api/src/notifications/notifications.service.ts`
- `apps/api/src/notifications/web-push.service.ts`
- `apps/api/src/notifications/dto/*.ts`
- `apps/api/src/notifications/notification-presentation.ts`
- `apps/web/src/hooks/use-api.ts` (`useNotifications`, `useUnreadCount`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`, `useNotificationPreferences`, `useUpdateNotificationPreferences`)
- `apps/web/src/hooks/use-realtime.ts`
