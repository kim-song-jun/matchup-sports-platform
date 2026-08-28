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
| POST | `/notifications/push-devices` | JWT | Android FCM 설치 등록/토큰 갱신 |
| DELETE | `/notifications/push-devices/:installationId` | JWT | 현재 사용자의 Android 설치 등록 해제 |

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

### POST `/notifications/push-devices`

Body:

```json
{
  "installationId": "2b5fd9ef-dbf8-4d9e-b434-d0561296e86f",
  "token": "fcm-registration-token",
  "appVersion": "0.1.0-alpha",
  "deviceModel": "Samsung SM-S928N"
}
```

- 환경은 클라이언트 입력을 신뢰하지 않고 서버의 `V1_PUSH_ENVIRONMENT`(`alpha` 또는 `production`)로 고정한다.
- 동일 환경/설치의 token refresh는 기존 row를 갱신한다. 동일 token을 다른 사용자 설치가 소유하면 충돌로 거절한다.
- 응답에는 FCM token을 포함하지 않는다.

### DELETE `/notifications/push-devices/:installationId`

- JWT 사용자와 서버 환경에 일치하는 설치만 revoke한다.
- 로그아웃은 인증 쿠키가 제거되기 전에 이 API 완료를 기다린다.

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
- Firebase Admin 세 자격증명이 모두 없으면 FCM만 disabled된다. 일부만 설정되거나 `V1_PUSH_ENVIRONMENT`가 유효하지 않으면 API가 기동에 실패한다.
- `alpha`와 `production` 기기는 DB environment와 별도 Firebase project/application ID로 분리한다.
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

- `apps/v1_api/src/notifications/notifications.controller.ts`
- `apps/v1_api/src/notifications/push-device.controller.ts`
- `apps/v1_api/src/notifications/notifications.service.ts`
- `apps/v1_api/src/notifications/web-push.service.ts`
- `apps/v1_api/src/notifications/fcm-push.service.ts`
- `apps/v1_api/src/notifications/push-device.service.ts`
- `apps/v1_api/src/notifications/dto/*.ts`
- `apps/v1_web/src/hooks/use-v1-push-registration.ts`
- `apps/v1_web/src/lib/native-push.ts`
