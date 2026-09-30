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
  "chatEnabled": true,
  "marketingEnabled": false,
  "updatedAt": "2026-09-11T00:00:00.000Z"
}
```

GET도 row가 없으면 기본값으로 실제 row를 생성한다. PATCH는 위 boolean 필드 중 전달한 값만 upsert한다.
`chatEnabled=false`는 채팅 알림센터 row, `notification:new` 뱃지 이벤트, 채팅 푸시 발송을 억제한다.
사용자가 방 안에 있는 동안의 실시간 `chat:message` 이벤트 자체는 억제하지 않는다.

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

## Navigation Contract

알림 카드를 탭하면 바로 이동하지 않고 상세 시트를 연다 — 카드 탭은 읽음 처리만 하고, 실제 navigation은
시트의 CTA에서만 일어난다. 이렇게 하면 읽음 mutation·목록 invalidate·route 이동이 서로 경쟁하지 않고,
두 줄로 잘리는 카드 대신 시트에 전체 본문을 보여줄 자리가 생긴다. 웹 클라이언트는 `/` 하나로 시작하는
동일 origin 상대 경로만 받아들인다 — 절대 URL, protocol-relative URL, 백슬래시 경로, path가 아닌 scheme은
모두 라우터로 넘기지 않고 `/notifications`로 대체한다.

모든 알림은 인앱 DB row다. 같은 emit 경로가 독립적으로 브라우저 Web Push·Android FCM·iOS APNs로
fan-out되며, 한 채널의 개별 발송 실패는 알림 row 자체나 다른 채널 발송을 취소하지 않는다.

`targetType` 값은 `match`, `team`, `team_match`, `chat`, `notice`, `system`, `tournament`, `inquiry`다.
1:1 문의에 어드민이 답변하면 문의한 회원에게 `inquiry_answered`(targetType `inquiry`, 딥링크
`/my/inquiries/:inquiryId`)를 emit한다 — 게스트 문의는 계정이 없으므로 연락처로 대신 응답한다. 이
이벤트는 `activityEnabled`가 아니라 `importantEnabled`로 게이팅된다.

팀 초대를 받으면 `team_invitation_received`(targetType `team`, targetId는 팀 id)를 emit하고 딥링크는 팀 상세가
아니라 수락·거절을 하는 `/my/invitations`다. 딥링크는 알림 생성 시 `V1Notification.deepLink`에 저장되므로
이미 만들어진 알림은 바뀌지 않는다.

초대를 수락·거절·취소하면 **그 초대의** 미열람 `team_invitation_received` 알림(딥링크 `/my/invitations`, 초대가
보내진 시각 이후에 만들어진 것)만 읽음 처리하고 결과에 맞게 바꾼다 — 같은 팀의 옛 초대 알림은 건드리지 않는다.
수락은 "팀 초대를 수락했어요 · "팀명" 멤버가 됐어요."(팀 상세), 거절은 "팀 초대를 거절했어요"(공개 팀 상세),
취소는 "팀 초대가 취소됐어요"(팀 상세) — 셋 다 딥링크가 `/teams/:teamId` 로 옮겨 가 빈 초대함으로 가지 않는다.
알림 갱신 실패는 로그만 남기고 수락·거절·취소 응답을 바꾸지 않는다.

일반 팀매치 완료 알림 `team_match_completed`는 후기 작성 화면(`/my/reviews/team_match/:id`)으로 연결되므로 수신자를
후기 작성 자격과 같은 판정으로 거른다 — 명단(계정 연결 참가자 1명 이상)이 있는 사이드는 명단에 있는 팀장·매니저만 받고,
명단이 없는 사이드는 팀장·매니저 전원이 받는다. 리그 `league_team_match_completed`·대회 `tournament_match_completed`
결과 확정 알림의 수신자·문구는 아래 "경기 알림 수신자·문구"를 따른다.

## 경기 알림 수신자·문구 (Task 180 G7)

수신자는 **발송 시점의 명단**으로 계산한다 — 그 사이 명단에서 빠진 선수, 팀을 나간 사람, 비팀원은 받지 않는다.
팀장·매니저는 `V1TeamMembership.role` 이 `owner`·`manager` 인 활성 멤버다.

| 알림 | 수신자 | 제목 / 본문 | 딥링크 |
|---|---|---|---|
| 리그 대진 확정 `league_fixture_scheduled` | 팀장·매니저 | 리그 대진이 확정됐어요 / `"(리그명)" 리그 대진이 확정됐어요. 이번 시즌 N경기가 배정됐어요.` | `/league-matches/:leagueId` |
| 〃 | 시즌 참가 명단(확정 신청의 활성 선수) 중 팀장·매니저가 아닌 활성 팀원 | 리그 대진이 확정됐어요 / `"(리그명)" 첫 경기는 9/30 (수) 01:10, (상대팀)와 해요.` | `/league-matches/:leagueId` |

| 경기 전날 `game_day_before_reminder` | 출전자(대회·리그 팀장·매니저는 기존 "명단 확인"을 받으므로 제외) | `9/30 (수) 01:10 경기가 있어요` / `vs (상대) · (장소). 출전 명단은 경기 전까지 바뀔 수 있어요.` | 공개 경기 상세 |
| 킥오프 2시간 전 `game_kickoff_reminder` | 출전자 + 팀장·매니저 | 2시간 뒤 경기가 시작돼요 / `01:10 vs (상대) · (장소). 지금 출전 명단에 있어요.` — 출전자가 아닌 팀장·매니저는 마지막 문장 없음 | 공개 경기 상세 |
| 리그 결과 확정 `league_team_match_completed` | 팀장·매니저 + 그 공식 결과의 출전자 | 경기 결과가 확정됐어요 / `(리그명) N주차 · 마포 FC 2 : 1 합정 유나이티드 · 승리. 내 기록 1골이에요.` | `/team-matches/:id/result` |
| 대회 결과 확정 `tournament_match_completed` | 〃 | 대회 경기 결과가 확정됐어요 / `(대회명) · (라운드) · 홈 2 : 1 원정 · 승리.` (+ 개인 기록) | `/tournaments/:id/matches/:teamMatchId` |

- 한 사람에게 한 건 — 참가 명단에 든 팀장·매니저는 팀장 문구만 받는다.
- 시각은 KST 날짜·요일·시각으로 쓰고 "내일" 같은 상대 표현을 쓰지 않는다. 와/과는 상대팀 이름의 받침으로 고른다.
- **출전자**: 대회·리그는 계산된 경기 명단(참가 명단 − 조정 − 결장 − 출전정지), 친선 팀매치는 최신 참석명단이
  제출(SUBMITTED·LOCKED)된 경우 그 명단. 참석명단을 아직 안 낸 친선 사이드는 킥오프 알림을 보내지 않는다(팀장·매니저는
  참석명단 최종 확인 알림을 받는다).
- 경기 전 알림은 라인업 리마인더 워커(15분 스캔)가 보낸다. 전날 알림은 내일(KST) 경기에 대해 09시 이후 첫 스캔이, 킥오프 알림은
  킥오프 2시간 전부터 30분 안의 스캔이 보낸다. **2시간 전 시각이 21~09시(KST)면 보내지 않는다.** businessKey
  `game-day-before:{gameId}:{startAtMs}:{userId}` · `game-kickoff:{gameId}:{startAtMs}:{userId}` 로 (경기 일정, 수신자)당 한 번이다 — 경기를 옮기면 새 시각으로 다시 보낸다.
- 수신 설정은 "경기·대회"(`teamMatchEnabled`)를 따른다. 기존 팀장·매니저 "명단 확인"·참석명단 알림은 `teamEnabled` 그대로다.
- 공개 경기 상세: 대회는 `targetType=tournament`, targetId `{tournamentId}:{teamMatchId}` → `/tournaments/:id/matches/:teamMatchId`,
  리그·친선은 `targetType=team_match` → `/team-matches/:id`(리그 대진은 리그 경기 상세로 redirect).
- **결과 확정**(리그·대회만, 친선 팀매치 완료 알림은 그대로): 공식 결과 참가자 행이 있는 사람이 출전자다 — 명단에서 빠져
  결과 행이 없는 선수, 확정 시점에 팀을 나간 출전자, 계정이 없는 참가자는 받지 않는다. 승패는 받는 사람 팀 기준이고
  (승부차기로 갈리면 `(승부차기 3 : 4)` 를 붙이고 그 결과로 판정), "내 기록 N골 M도움이에요." 는 골·도움이 있는 출전자에게만 붙는다.
  경기명은 리그 `(리그명) N주차`(경기일 순번), 대회 `(대회명) · (라운드)`. businessKey
  `team-match-completed:{teamMatchId}:{userId}` · `tournament-fixture-completed:{teamMatchId}:{userId}` 로 정정 재확정에도 한 번이다.
  수신 설정은 리그 `teamMatchEnabled`, 대회 `activityEnabled`(기존 축 유지). 대회 결과 알림의 targetId 는 대회 id 에서
  `{tournamentId}:{teamMatchId}` 로 바뀌었다(딥링크는 같다).

## 팀·라인업 사건 알림 (Task 180 H1)

사건마다 한 건이 기본이다. 수신자는 발송 시점의 역할·명단으로 계산하고, 일으킨 본인은 받지 않는다. 문구 조사는 "님이·팀이"로 고정한다.

| 알림 | 수신자 | 제목 / 본문 | 딥링크 |
|---|---|---|---|
| `team_manager_assigned` · `team_manager_revoked` | 바뀐 본인 | 매니저가 되었어요 / 매니저에서 멤버로 바뀌었어요 · `"팀명" · …` | 팀 상세 |
| `team_owner_received` · `team_owner_changed` | 새 팀장 · 나머지 매니저(넘긴 본인 제외) | 팀장이 되었어요 / 팀장이 바뀌었어요 · `"팀명" · 새 팀장은 ○○님이에요.` | 새 팀장 `/teams/:id/members`, 나머지 팀 상세 |
| `team_membership_removed` | 내보내진 본인(이유 없음) | 팀에서 제외됐어요 / `"팀명" · 이 팀의 일정과 채팅은 더 볼 수 없어요.` | 공개 팀 상세 |
| `team_member_left` | 팀장·매니저 | ○○님이 팀을 나갔어요 / `"팀명" · 지금 멤버는 N명이에요.` | `/teams/:id/members` |
| `team_invitation_declined` | 초대한 사람 | ○○님이 초대를 거절했어요 | `/teams/:id/members?tab=invitations` |
| `team_join_application_received` | 팀장·매니저 — **팀별 한 줄** | ○○님이 가입을 신청했어요 → 두 건 이상 `가입 신청 N건이 기다려요` / `"팀명" · ○○님 외 N명 · 승인하거나 거절해 주세요.` | `/teams/:id/members?tab=requests` |
| `team_invitation_accepted` | 초대한 사람 — **안 읽은 동안 한 줄** | ○○님이 초대를 수락했어요 → `○○님 외 N명이 초대를 수락했어요` / `"팀명" 멤버가 됐어요.` | 팀 상세 |
| `team_schedule_created` | 활성 멤버(만든 사람 제외) | 새 일정이 올라왔어요 / `"팀명" · 제목 · 10/6 (화) 19:00. 참석 여부를 알려 주세요.` | 일정 상세 |
| `team_schedule_cancelled` | '불참' 응답자·취소한 본인을 뺀 활성 멤버 + 승인된 용병(공개 일정일 때만) | 일정이 취소됐어요 / `"팀명" · 제목(10/6 (화) 19:00) · 취소 사유` | 일정 상세 |
| `team_match_application_received` | 호스트 팀 팀장·매니저 | ○○ 팀이 팀매치를 신청했어요 / `"우리 팀명" · 친선 팀매치 · 일시 · 승인하거나 거절해 주세요.` | `/team-matches/:id` |
| `team_match_lineup_included` | 제출된 친선 참석명단의 선수(지금도 활성 팀원) | 참석명단에 올랐어요 / `"팀명" · vs 상대팀 · 일시 · 장소` | `/team-matches/:id` |

- **몰림 줄**: 가입 신청 줄은 `businessKey` `team-join-pending:{teamId}:{userId}`, 초대 수락 줄은
  `team-invite-accepted:{teamId}:{inviterId}:{첫 수락 ms}:{invitationId}` 로 찾는다(스키마 변경 없음). 새 건은 줄을 맨 위로
  올리고(createdAt 갱신) 읽은 줄이면 다시 안 읽음 + 푸시, 안 읽은 동안의 추가분은 문구만 바꾸고 푸시하지 않는다. 가입 신청을
  처리하면 남은 대기 건수로 지금 팀장·매니저의 줄을 다시 쓰고, 0건이면 줄을 읽음으로 둔다.
- **참석명단 포함**: 경기·사람당 한 번(`lineup-included:{gameId}:{userId}`) — 다시 제출하면 새로 오른 사람만 받고 빠진 사람에게는
  보내지 않는다. 킥오프 2시간 안에 제출하면 킥오프 알림 키(`game-kickoff:…`)로 써서 뒤이은 킥오프 알림과 한 건으로 합친다.
- **발송 경로**: 일정 생성·취소와 참석명단 포함은 같은 트랜잭션의 outbox 행(`SCHEDULE_CREATED_NOTIFICATION`·
  `SCHEDULE_CANCELLED_NOTIFICATION`·`TEAM_MATCH_LINEUP_INCLUDED_NOTIFICATION`)을 게임 운영 워커가 받아 쓴다(실시간 소켓 이벤트 없음 — 목록 polling 으로 보인다).
- **밤(KST 21~09시)**: 팀(`teamEnabled`)·경기(`teamMatchEnabled`) 사건 알림은 알림함 행만 남기고 푸시하지 않는다(아침에 몰아 보내지도 않음).
  그 밤이 끝나기(다음 9시) 전에 시작하는 일정·경기에 관한 알림은 밤에도 푸시한다.
- **참석명단 미제출 안내**(팀장·매니저, `teamEnabled`): 킥오프 2시간 전 알림의 시각이 밤이면 밤이 시작되기 전 마지막 스캔(20:45~21:00)에
  앞당겨 보내고(본문에 킥오프 일시), 그 뒤에 잡힌 경기면 알림함에만 남긴다. 킥오프 시각이 지나도 미제출이면 `경기 시간이 됐어요 — 참석명단을 제출해 주세요`
  를 한 번 보낸다(밤이면 알림함만).

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
