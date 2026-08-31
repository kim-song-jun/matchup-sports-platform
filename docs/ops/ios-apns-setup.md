# iOS + APNs Setup

`apps/v1_ios`는 배포된 v1 Web을 로드하는 네이티브 셸이고, 푸시는 Firebase를 거치지 않고
**API가 Apple APNs로 직접 보낸다**. Android가 FCM을 쓰는 것과 별개 경로이며, 두 경로는
`apps/v1_api/src/notifications/web-push.service.ts`의 디스패처에서 `platform`으로 갈린다.

- 어댑터: `apps/v1_api/src/notifications/apns-push.service.ts`
- 프로바이더 토큰(ES256 JWT): `apps/v1_api/src/notifications/apns-provider-token.ts`
- Android 쪽 대응 문서: [`android-fcm-setup.md`](./android-fcm-setup.md)

## 기동 계약 — 네 가지 경우를 먼저 읽어라

가장 흔한 사고는 **키를 넣었는데 API가 안 뜨는 것**이다. 아래 표가 그 전부다.
분기는 `ApnsPushService.onModuleInit()`에 있다.

| `APNS_*` 4개 중 | `V1_PUSH_ENVIRONMENT` | `APNS_BUNDLE_ID` | 결과 |
|---|---|---|---|
| 0개 | 무관 | 무관 | **기동한다.** iOS 푸시만 조용히 비활성 — 로그에 `APNs credentials not configured — iOS push disabled` |
| 1~3개 | 무관 | 무관 | **기동 실패**: `APNs credentials are partially configured` |
| 4개 | **없음/오타** | 무관 | **기동 실패**: `PUSH_ENVIRONMENT_NOT_CONFIGURED` |
| 4개 | 있음 | 환경과 불일치 | **기동 실패**: `APNS_BUNDLE_ID does not match V1_PUSH_ENVIRONMENT` |
| 4개 | 있음 | 일치 | 정상 — iOS 푸시 활성 |

> **`APNS_*`를 넣으면서 `V1_PUSH_ENVIRONMENT`를 빠뜨리면 API 전체가 기동하지 않는다.**
> 푸시만 꺼지는 게 아니다. 반쯤 설정된 배포가 "푸시가 되는 척" 하며 뜨는 것보다 안 뜨는 쪽이
> 낫다는 판단이고, Firebase 어댑터도 같은 모양이다. 키를 넣는 배포에서는 두 값을 **같은
> 변경**으로 넣어라.

기대되는 번들 ID는 환경이 정한다. 다른 값을 넣으면 알림이 다른 앱에게 배달된다.

| `V1_PUSH_ENVIRONMENT` | `APNS_BUNDLE_ID` | APNs 게이트웨이 |
|---|---|---|
| `alpha` | `kr.co.teameet.alpha` | `api.sandbox.push.apple.com` |
| `production` | `kr.co.teameet` | `api.push.apple.com` |

**한쪽 게이트웨이에서 발급된 기기 토큰은 다른 쪽에서 주소가 되지 않는다.** 셸도 같은 선을
긋는다 — `aps-environment`가 Alpha 빌드는 `development`, Production 빌드는 `production`이다
(`apps/v1_ios/Config/*.xcconfig`).

## Apple Developer 콘솔에서 준비할 것

1. **App ID 2개** — `kr.co.teameet.alpha`, `kr.co.teameet`. 둘 다 **Push Notifications
   capability**를 켠다. 켜지 않으면 프로비저닝 프로파일에 `aps-environment`가 들어가지 않고,
   기기에서 `registerForRemoteNotifications`가 `NSCocoaErrorDomain` 3000으로 실패한다.
2. **APNs Auth Key(`.p8`)** — Keys에서 "Apple Push Notifications service (APNs)"로 생성.
   - 팀당 최대 2개, **다운로드는 한 번뿐**이다. 잃어버리면 폐기하고 새로 만들어야 한다.
   - 하나의 키가 sandbox와 production, 그리고 팀의 모든 App ID를 커버한다. 환경별로 따로
     만들지 않아도 된다.
3. **Key ID**(생성 화면) 와 **Team ID**(Membership 페이지) 를 받아 적는다. 둘 다 비밀이 아니다.

## 환경변수

`.env.example`에 이미 자리와 주석이 있다.

| 변수 | 값 | 비밀 |
|---|---|---|
| `APNS_KEY_ID` | 10자 키 ID | 아니오 |
| `APNS_TEAM_ID` | 10자 팀 ID | 아니오 |
| `APNS_BUNDLE_ID` | 위 표대로 | 아니오 |
| `APNS_PRIVATE_KEY` | `.p8` 파일 **내용** (`-----BEGIN PRIVATE KEY-----` 포함) | **예** |
| `V1_PUSH_ENVIRONMENT` | `alpha` / `production` | 아니오 |

**`.p8` 파일과 그 내용은 저장소에 절대 넣지 않는다. 이 저장소는 public이다.** 커밋·PR 코멘트·
스크립트·문서 어디에도 붙이지 말 것. 값은 호스트의 `deploy/.env`에만 둔다.

개행이 있는 값이라 `.env`에 넣을 때 따옴표로 감싸고 `\n`이 실제 개행으로 들어가는지 확인한다.

### 어디로 주입되나

- 프로덕션: `deploy/docker-compose.prod.yml`이 `v1_api`와 워커 양쪽에 4개를 전달한다
  (기본값 빈 문자열이라 미설정이어도 컴포즈는 뜬다 — 그 경우 위 표의 "0개" 행).
- **alpha도 같은 파일을 쓴다.** `deploy/deploy-alpha.sh`가
  `-f docker-compose.prod.yml -f docker-compose.alpha.yml`로 겹쳐 올리고, 오버레이는
  `V1_PUSH_ENVIRONMENT: alpha`만 덮어쓴다. 따라서 alpha에 키를 넣으려면 **alpha 호스트의
  `deploy/.env`**에 4개를 적으면 된다.

## 전달 실패 해석

`ApnsPushService`는 Apple의 `reason`을 세 갈래로 나눈다.

| reason | 처리 |
|---|---|
| `Unregistered`, `BadDeviceToken`, `DeviceTokenNotForTopic` | **영구 실패** — 기기 토큰을 폐기한다(`revokeTokens`). 앱 삭제·재설치·환경 불일치가 원인이다 |
| `ExpiredProviderToken`, `InvalidProviderToken` | 우리 문제다. 프로바이더 토큰을 재서명하고 **한 번만** 재시도한다 |
| 그 외 / 네트워크 오류 | 일시 실패로 기록한다(`recordTransientFailures`) |

프로바이더 토큰은 Apple의 최소 재발급 간격을 지키므로, **방금 서명한 토큰은 재시도되지
않는다.** 갓 만든 토큰이 거절당하면 만료가 아니라 **Key ID나 Team ID가 틀린 것**이다 —
그때는 재시도가 아니라 값을 다시 확인해야 한다.

`DeviceTokenNotForTopic`이 반복되면 `APNS_BUNDLE_ID`와 앱의 번들 ID, 그리고 sandbox/production
짝이 어긋난 것이다.

## 아직 검증되지 않은 것

- **실제 APNs 게이트웨이로의 발송.** `.p8`이 없어 한 번도 보내지 않았다. 시뮬레이터가 주는
  기기 토큰은 합성값이라 라우팅 자체가 미검증이다.
- 물리 기기에서의 수신. 시뮬레이터에서는 `xcrun simctl push`로 배너·탭·딥링크까지 확인했다
  (`scripts/ios/verify-push-slice.sh`).
- background / terminated 상태 전달 동작.

`.p8`이 도착하면 [`ios-release.md`](./ios-release.md)의 ad-hoc 서명 절차로 실기기 QA를 먼저
돌린다.


## alpha 런타임 주입 (2026-08-31 추가 — 이게 없으면 푸시가 조용히 죽는다)

**실측으로 확인한 것**: alpha 배포는 시크릿을 4개만 주입하고 있었고 그중 APNs 는 없었다.
그래서 `ApnsPushService` 가 `APNs credentials not configured — iOS push disabled` 로
시작하고, 알림 **row 는 만들어지지만** iOS 로는 아무것도 나가지 않는다. 화면에는 알림이
쌓이는데 폰은 조용하다 — 기기가 고장난 것처럼 보이고 서버가 시도조차 안 했다는 건 안 보인다.
(2026-08-31 실측: 팀 채팅 메시지 → 알림 row 생성됨 → 시뮬레이터에 배너 없음.)

`scripts/release/sync-alpha-apns-env.sh` 가 이 구멍을 막는다. 문의 Slack 웹훅과 같은 방식이다
— GitHub secret → SSM SecureString → SSM 원격 실행으로 호스트의 보호된 `deploy/.env` 에 기록.
값이 워크플로 로그나 이미지 레이어를 거치지 않는다.

**운영자가 해야 할 것 — GitHub Actions secrets 4개 등록:**

| 이름 | 값 |
|---|---|
| `APNS_KEY_ID` | 10자 키 ID |
| `APNS_TEAM_ID` | 10자 팀 ID |
| `APNS_BUNDLE_ID` | `kr.co.teameet.alpha` (alpha 기준) |
| `APNS_PRIVATE_KEY` | `.p8` **내용**. 개행이 있는 그대로 붙여넣으면 된다 — 스크립트가 한 줄로 바꾼다 |

넷 중 하나라도 없으면 배포는 **실패하지 않고** 경고만 남긴 채 넘어간다: 푸시 없는 alpha 는
동작하는 alpha 지만, 막힌 배포는 아니기 때문이다. 경고 문구에 빠진 이름이 찍힌다.

등록 후 다음 dev 머지(=alpha 배포)부터 적용된다. 확인은 알림을 하나 유발해 보는 것으로 한다 —
row 만 생기고 폰이 조용하면 여전히 주입되지 않은 것이다.
