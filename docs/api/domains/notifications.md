# Domain Contract — Notifications

## Domain Overview

- 알림 목록, 읽음 처리, 환경설정, 브라우저 Web Push, Android/iOS 네이티브 푸시를 담당한다.
- `V1Notification.title`, `body`, `deepLink`가 모든 채널의 콘텐츠와 이동 목적지 source of truth다.
- Teameet API가 알림 생성, 사용자·환경별 기기 선택, 채널 fan-out, 실패 분류와 기기 상태 갱신을 소유한다.
- 브라우저는 Web Push, Android는 API가 FCM HTTP v1을 직접 호출하고, iOS는 API가 APNs HTTP/2를 직접 호출한다.

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/notifications` | JWT | 알림 목록 |
| PATCH | `/notifications/:notificationId/read` | JWT | 한 건 읽음 처리 |
| POST | `/notifications/read-all` | JWT | 전체 읽음 처리 |
| GET | `/notification-preferences` | JWT | 알림 설정 조회 |
| PATCH | `/notification-preferences` | JWT | 알림 설정 upsert |
| GET | `/notifications/vapid-public-key` | Public | 브라우저 Web Push 공개키 |
| POST | `/notifications/push-subscribe` | JWT | 브라우저 Web Push 구독 |
| DELETE | `/notifications/push-unsubscribe` | JWT | 브라우저 Web Push 구독 해제 |
| POST | `/notifications/push-devices` | JWT | Android FCM 또는 iOS APNs 기기 등록·토큰 갱신 |
| DELETE | `/notifications/push-devices/:installationId` | JWT | 현재 사용자의 네이티브 기기 등록 해제 |

## Request / Response Details

### GET `/notifications`

- Query: `status`(`created | read | unread`), `type`, `cursor`, `limit`(기본 20, 최대 50)
- Response `data`: `{ items, unreadCount, pageInfo: { nextCursor, hasNext } }`
- `created`와 `unread`는 모두 `readAt IS NULL`을 조회한다.

### PATCH `/notifications/:notificationId/read`

- 소유자 검사를 강제한다.
- Response `data`: `{ notificationId, status: "read", readAt }`

### POST `/notifications/read-all`

- Body: `{ "type"?: string | null }`
- 현재 사용자의 읽지 않은 알림을 전부 또는 target type별로 읽음 처리한다.
- Response `data`: `{ updatedCount, readAt, unreadCount }`

### GET/PATCH `/notification-preferences`

설정 row가 없으면 다음 기본값을 반환한다.

```json
{
  "importantEnabled": true,
  "activityEnabled": true,
  "marketingEnabled": false,
  "updatedAt": "2026-09-11T00:00:00.000Z"
}
```

GET도 row가 없으면 기본값으로 실제 row를 생성한다. PATCH는 위 boolean 필드 중 전달한 값만 upsert한다.

### POST `/notifications/push-subscribe`

```json
{
  "endpoint": "https://push-service.example/subscription",
  "keys": {
    "p256dh": "base64url",
    "auth": "base64url"
  }
}
```

### DELETE `/notifications/push-unsubscribe`

```json
{
  "endpoint": "https://push-service.example/subscription"
}
```

### POST `/notifications/push-devices`

Android 예시:

```json
{
  "installationId": "2b5fd9ef-dbf8-4d9e-b434-d0561296e86f",
  "token": "fcm-registration-token-at-least-20-characters",
  "platform": "android",
  "appVersion": "0.1.0-alpha",
  "deviceModel": "Samsung SM-S928N"
}
```

iOS 예시:

```json
{
  "installationId": "9ec559c3-7965-4f29-af8a-45fbcecb201d",
  "token": "64-character-apns-device-token",
  "platform": "ios",
  "apnsEnvironment": "sandbox",
  "appVersion": "0.1.0-alpha",
  "deviceModel": "iPhone"
}
```

- `installationId`, `token`, `platform`은 필수다. `platform`은 `android | ios`다.
- `apnsEnvironment`는 iOS에만 의미가 있으며 `sandbox | production`이다. 구버전 iOS 앱 호환을 위해 생략할 수 있다.
- 서버 배포 환경은 클라이언트 입력을 신뢰하지 않고 `V1_PUSH_ENVIRONMENT`로 고정한다.
- 같은 환경·installation의 재등록은 사용자, 플랫폼, 토큰, 앱/기기 정보와 APNs 환경을 갱신하고 revoke·failure 상태를 초기화한다.
- 이미 다른 설치가 소유한 토큰은 `409 PUSH_TOKEN_ALREADY_REGISTERED`로 거절한다.
- 응답에는 푸시 토큰과 APNs 환경을 포함하지 않는다.
- 기본 throttle은 사용자당 분당 10회다.

### DELETE `/notifications/push-devices/:installationId`

- JWT 사용자, 현재 서버 환경, installation이 모두 일치하는 활성 row만 revoke한다.
- 멱등적으로 동작하며 성공 응답은 `204`다.
- 로그아웃은 인증 쿠키를 제거하기 전에 이 요청을 완료해야 한다.
- Android는 로그아웃 때 서버 row만 revoke하고 로컬 opt-in/FCM 토큰은 유지한다. 다음 로그인 뒤 같은 installation과 토큰을 새 사용자에게 재등록한다.
- 명시적 opt-out 또는 권한 철회 때는 서버 revoke와 로컬 FCM 토큰 삭제를 함께 수행한다.

## Delivery Architecture

```text
V1Notification
  -> browser subscriptions: Web Push/VAPID
  -> android devices: Teameet API -> Google OAuth -> FCM HTTP v1
  -> ios devices: Teameet API -> APNs HTTP/2
```

- 네이티브 기기는 서버 환경과 사용자로 한 번 조회한 뒤 플랫폼별 adapter에 분배한다.
- 한 채널의 장애는 다른 채널 전송을 취소하지 않는다. 실패는 로그와 delivery metadata로 드러나며 알림 row 자체는 유지된다.
- 성공은 `lastSuccessAt`을 갱신한다. 영구 token 오류는 row를 revoke하고, 일시 오류는 `failureCount`와 `lastFailureAt`을 갱신한다.
- 토큰, FCM OAuth access token, APNs provider token과 private key는 응답 또는 로그에 남기지 않는다.

### Android / FCM HTTP v1

- API 설정: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` 세 값이 모두 없으면 Android 푸시만 비활성화한다.
- 일부만 설정됐거나 service-account email/project/environment가 어긋나면 API 기동을 실패시킨다.
- API가 RS256 service-account JWT를 만들고 `firebase.messaging` scope의 단기 OAuth access token으로 교환해 캐시한다. `firebase-admin`은 사용하지 않는다.
- FCM HTTP v1은 토큰당 한 요청을 보내며 동시 요청 수는 50으로 제한한다.
- `UNREGISTERED`, `SENDER_ID_MISMATCH`는 영구 오류로 revoke한다. 401은 OAuth token을 폐기하고 한 번만 재발급·재시도한다. 나머지는 일시 오류로 기록한다.
- Android 앱의 `firebase-messaging` 의존성은 OS transport와 registration token 수신 때문에 유지한다. 비즈니스 라우팅과 발송 판단은 Firebase Console이나 앱이 아니라 Teameet API가 담당한다.

### iOS / direct APNs

- API 설정: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRIVATE_KEY` 네 값이 모두 없으면 iOS 푸시만 비활성화한다.
- 일부만 설정됐거나 bundle ID와 서버 환경이 어긋나면 API 기동을 실패시킨다.
- API가 provider JWT를 만들고 APNs gateway와 HTTP/2로 직접 통신한다. iOS 앱과 서버 모두 Firebase iOS SDK를 사용하지 않는다.
- 앱이 보고한 `apnsEnvironment`가 틀리거나 없으면 반대 gateway 재시도로 실제 환경을 찾고 성공한 환경을 저장할 수 있다.
- `Unregistered`, `BadDeviceToken`, `DeviceTokenNotForTopic`은 영구 오류로 revoke하며, provider-token 오류는 안전한 조건에서 갱신·재시도한다.

## Frontend Mapping Notes

- `useNotifications`: 30초 polling + focus/reconnect refetch, WebSocket event 뒤 backfill
- `useMarkNotificationRead` / `useMarkAllNotificationsRead`: optimistic update + rollback
- `useNotificationPreferences`: `staleTime: 0`, mount/focus refetch

## Edge Cases

- 다른 사용자의 알림 읽음 요청은 `403`이다.
- VAPID가 없으면 Web Push만 비활성화되며 네이티브 adapter는 독립적으로 동작한다.
- Alpha와 production은 DB environment, Android application ID/Firebase project, iOS bundle ID/APNs topic을 분리한다.
- 알림 preference row가 없어도 UI는 위 기본값으로 정상 초기화해야 한다.
- 읽음 처리와 route 이동이 경쟁하지 않도록 알림 탭은 먼저 안전한 navigation 의도를 보존해야 한다.

## Source References

- `apps/v1_api/src/notifications/notifications.controller.ts`
- `apps/v1_api/src/notifications/push-device.controller.ts`
- `apps/v1_api/src/notifications/notifications.service.ts`
- `apps/v1_api/src/notifications/web-push.service.ts`
- `apps/v1_api/src/notifications/fcm-push.service.ts`
- `apps/v1_api/src/notifications/fcm-access-token-provider.ts`
- `apps/v1_api/src/notifications/apns-push.service.ts`
- `apps/v1_api/src/notifications/push-device.service.ts`
- `apps/v1_api/src/notifications/dto/push-device.dto.ts`
- `apps/v1_web/src/hooks/use-v1-push-registration.ts`
- `apps/v1_web/src/lib/native-push.ts`
