# Task 157 — iOS App + APNs/FCM Foundation

Status: ACTIVE
Base branch: `feat/android-fcm-foundation` (PR #821, base `dev`) → `dev` 재타깃 예정
Working branch: `feat/ios-webview-shell`
Target: `both` (`apps/v1_ios`, `apps/v1_api`, `apps/v1_android` 1줄, deploy/docs)
Mode: CODE

## Objective

Task 156이 Android에 만든 것과 같은 모델로 Teameet v1 웹을 iOS 네이티브 WebView 셸로 제공하고,
APNs 위에서 FCM을 재사용해 iOS 네이티브 알림을 추가한다. 웹은 번들하지 않고 배포된 원격 origin을
그대로 로드한다. 첫 vertical slice는 로그인한 사용자가 Alpha iOS 앱에서 `inquiry_answered` 알림을
받고, 알림을 눌러 정확한 문의 화면으로 이동하는 것이다.

`apps/v1_web`은 한 줄도 바꾸지 않는다. 셸이 웹에 맞춘다.

## Current Evidence (2026-08-29)

- Android 셸 정본은 `apps/v1_android`이며 순수 네이티브 WebView 셸이다(Capacitor 아님). Task 156 결정
  로그가 bundled static export를 기각한 근거(181 page 중 76개 dynamic route, cookie auth, same-origin
  API/upload/Socket.IO)는 iOS에도 그대로 적용된다.
- 브리지 계약은 `apps/v1_web/src/lib/native-push.ts`가 이미 소유한다. 전역 `window.TeameetNative.postMessage(JSON)`
  로 보내고 `teameet:native-push-result` CustomEvent(`{requestId, permission, subscribed}`)로 받는다.
  액션은 `get-push-state` / `request-notification-permission` / `open-notification-settings` /
  `revoke-push-device` 4종이다.
- 기기 등록 API는 `POST /api/v1/notifications/push-devices`, 해제는 `DELETE .../:installationId`이며
  `V1AuthGuard` 세션 쿠키 인증이다. `installationId`는 컨트롤러의 `ParseUUIDPipe`와 DTO의 `@IsUUID()`
  때문에 **UUID여야 한다**.
- `V1PushDevice.platform`은 `V1PushPlatform` enum이고 `ios` 값이 **이미 존재한다**
  (`apps/v1_api/prisma/schema.prisma:2041-2044`). 스키마 변경도 migration도 필요 없다.
- 현재 백엔드는 platform을 클라이언트에서 받지 않고 `V1PushPlatform.android`로 하드코딩하며,
  조회/해제도 `platform: android`로 필터링한다(`push-device.service.ts`). iOS 기기는 이 경로로는
  등록되지도 발송되지도 않는다.
- `apps/v1_web`에는 `viewport-fit=cover`가 없다. 따라서 WKWebView에서 `env(safe-area-inset-bottom)`은
  0으로 평가된다. `globals.css:296-297`이 `--v1-shell-safe-bottom = max(env(...), var(--teameet-native-safe-bottom))`
  으로 정의돼 있으므로 **네이티브가 `--teameet-native-safe-bottom`을 주입하지 않으면 하단 안전영역이 0이 된다.**
  이 변수는 하단 내비게이션·FAB·고정 CTA 등 `globals.css` 20여 곳이 소비한다.
- Firebase Alpha 프로젝트는 `teameet-alpha`(sender id `816070948845`)로 이미 존재한다. iOS는 같은
  프로젝트에 iOS 앱을 추가로 등록해 app id `1:816070948845:ios:<hex>`를 받는다.
- Android는 `google-services.json`을 커밋하지 않고 `FirebaseBootstrap`이 public 빌드 식별자로
  `FirebaseOptions`를 직접 구성한다. iOS도 `GoogleService-Info.plist`를 커밋하지 않고 같은 방식을 쓴다.

## Architecture

Android 셸과 **동일 모델**이며, iOS 관용 표현으로만 다시 쓴다.

| 관심사 | Android 참조 | iOS 구현 |
|---|---|---|
| 셸 | `MainActivity` + `WebView` | `WebShellViewController` + `WKWebView` (SwiftUI `App` 하위) |
| 브리지 | `WebViewCompat.addWebMessageListener("TeameetNative", allowedOriginRules)` | `WKUserScript` shim + `WKScriptMessageHandler` + `frameInfo` origin 검증 |
| 허용 탐색 | `AllowedNavigation` (순수 함수) | `AllowedNavigation` (순수 enum, 동일 케이스 이식) |
| 딥링크 | `AllowedNavigation.safeRoute` | `DeepLinkRoute.safeRoute` (동일 케이스 이식) |
| 동의 정책 | `PushDeliveryPolicy` | `PushConsent` (동일 진리표 이식) |
| 설치 식별 | `SharedPreferences` UUID | Keychain UUID (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, 동기화 없음) |
| 환경 분리 | product flavor + `BuildConfig` | build configuration + xcconfig → Info.plist → `AppConfig` |
| 프로젝트 정본 | `build.gradle.kts` | `project.yml` (XcodeGen). `.xcodeproj`는 gitignore |

의도적으로 다르게 가는 지점은 두 곳뿐이며 근거는 Decision Log에 있다.

1. FCM 토큰을 네이티브에 영속하지 않는다(Android는 `SharedPreferences`에 저장). Firebase iOS SDK의
   캐시와 `messaging(_:didReceiveRegistrationToken:)` 갱신 통지를 SSOT로 쓴다.
2. `installationId`를 Keychain에 둔다. 앱 삭제로도 지워지지 않아 재설치 시 고아 기기 row가 생기지 않는다.
   대가는 "앱 삭제 = 초기화"가 성립하지 않는다는 것이고, 유일한 사용자 초기화 경로가
   `revoke-push-device`임을 `docs/ops/ios-apns-setup.md`에 명시한다.

## Scope

### Phase 1 — 셸 골격과 순수 정책 (서명 불필요)

- `apps/v1_ios/project.yml`(XcodeGen 정본), `Config/{Shared,Alpha,Production}.xcconfig`,
  `version.properties`(iOS 독립 버전 SSOT).
- `AllowedNavigation` / `DeepLinkRoute` / `PushConsent` / `AppConfig` 순수 타입.
- `TeameetTests` 5종 유닛 테스트. Android JVM 테스트와 **동일 케이스**를 이식한다.
- `xcodegen generate && xcodebuild test`가 시뮬레이터에서 통과.
- **`Teameet.entitlements`는 S7로 이월한다.** `aps-environment`를 소비하는 코드가 S7 전에는
  없고, 쓰이지 않는 capability를 미리 박아 두는 것은 이 저장소의 기술부채 원칙에 어긋난다.
  S7에서 넣을 때는 소스 파일이 아니라 **빌드된 `.app`의 embedded entitlements를 양 flavor
  모두 실판독**해 alpha=`development` / production=`production`을 증명한다.

### Phase 2 — WebView 셸

- `WebShellViewController`: `WKWebView` 호스트, `WKNavigationDelegate`, `WKUIDelegate`.
- 초기 로드 `WEB_ORIGIN + route`. 내부/외부 판정은 `AllowedNavigation`.
- 외부 이동은 `UIApplication.open`. 스킴 allowlist: http/https/mailto/tel/sms/geo/itms-apps.
  Android의 `market:`은 `itms-apps:`로 대체하고 `intent:`는 iOS에 없으므로 제외한다.
- 스와이프 백(`allowsBackForwardNavigationGestures`). iOS에는 하드웨어 back이 없다.
- 안전영역: 네이티브가 하단 inset만 CSS 픽셀로 `--teameet-native-safe-bottom`과
  `--v1-shell-safe-bottom`에 주입한다.
- 다운로드: `WKDownloadDelegate`. 내부 origin만 허용하고 임시 저장 후 공유 시트로 넘긴다.
- 업로드: `WKWebView` 기본 동작(별도 코드 없음).
- alpha만 `isInspectable = true`. production은 빌드 타입과 무관하게 false.
- ATS 예외를 두지 않는다(Android `usesCleartextTraffic=false` 대응).

### Phase 3 — JS 브리지

- `.atDocumentStart` · `forMainFrameOnly` `WKUserScript`로 `window.TeameetNative.postMessage`를
  `window.webkit.messageHandlers.TeameetNative.postMessage`에 연결한다. **웹은 수정하지 않는다.**
- 수신 시 `message.frameInfo.isMainFrame`과 `securityOrigin`이 `WEB_ORIGIN`인지 검증한다
  (Android `allowedOriginRules` 대응). 불일치는 조용히 무시한다.
- 응답은 `evaluateJavaScript`로 `teameet:native-push-result` CustomEvent를 dispatch한다.
- 권한 매핑: `notDetermined`→`"default"`, `denied`→`"denied"`,
  `authorized`/`provisional`/`ephemeral`→`"granted"`.

### Phase 4 — 푸시 파이프라인

- `requestAuthorization` → `registerForRemoteNotifications` →
  `Messaging.messaging().apnsToken = deviceToken` → FCM 토큰 수신 →
  `POST /api/v1/notifications/push-devices` `{ installationId, token, platform: "ios", appVersion, deviceModel }`.
- 세션 쿠키는 `WKWebsiteDataStore.default().httpCookieStore`에서 `WEB_ORIGIN` 호스트 것만 골라
  `Cookie` 헤더를 직접 구성한다(HttpOnly 쿠키도 이 경로로는 읽힌다).
- 등록 시점: 내부 URL `didFinish` + FCM 토큰 갱신(Android `onPageFinished` 대응).
- 권한 거부·opt-out·로그아웃은 서버 revoke + 로컬 토큰 삭제.
- foreground `willPresent` → `.banner`, `.sound` (동의가 살아 있을 때만).
- 알림 탭 `didReceive` → `userInfo["route"]` → `DeepLinkRoute.safeRoute` → 앱 내부 로드.
- `PushCoordinator`를 `actor`로 두어 권한/토큰/등록 수명주기의 경합을 타입 수준에서 막는다.

### Phase 5 — 백엔드 최소 표면

- `RegisterPushDeviceDto`에 `platform!: V1PushPlatform` **필수** 추가(`@IsEnum`).
- `push-device.service.ts`: `registerAndroid`→`register`, `revokeAndroid`→`revoke`,
  `activeAndroidTokens`→`activeTokens`. platform 필터 제거, 하드코딩 제거.
- `fcm-push.service.ts`: `apns` 블록 추가(`apns-priority: 10`, `apns-collapse-id: notificationId`),
  로그 문구에서 "Android" 제거.
- `PushRegistrationClient.java`: body에 `.put("platform", "android")` 1줄.
- 기존 spec 4종 갱신 + iOS 등록/revoke/발송 케이스 추가.
- **Prisma 스키마·migration 변경 없음.** `V1PushPlatform.ios`가 이미 존재한다.

### Phase 6 — 환경 분리와 릴리스

| | Alpha | Production |
|---|---|---|
| Bundle ID | `kr.co.teameet.alpha` | `kr.co.teameet` |
| 표시명 | Teameet Alpha | Teameet |
| `WEB_ORIGIN` | `https://alpha.teameet.co.kr` | `https://teameet.co.kr` |
| `aps-environment` | development | production |
| Firebase | alpha 프로젝트 | production 프로젝트 |

- Android `verifyAlpha/ProductionFirebaseConfiguration`의 검증을 Swift 유닛 테스트 + CI 스크립트로 이식한다:
  App ID `1:<sender>:ios:<hex>` 형식, alpha/production 프로젝트 교차 사용 차단, sender id ↔ app id 일치.
- `.github/workflows/ios-alpha.yml`: macos runner에서 `xcodegen generate` → `xcodebuild test` →
  서명 없는 시뮬레이터 빌드. public 저장소라 macOS runner는 무료다.
- **SourcePackages 캐시가 필수다.** 테스트만 돌려도 xcodebuild가 패키지 그래프를 해석하며
  SwiftPM이 링크하지 않는 것까지 포함해 약 850MB(grpc-binary 609MB)를 받는다. 캐시 없이는
  매 실행이 그 비용을 다시 낸다.
- `scripts/release/require-ios-production-ref.sh`로 production 아티팩트가 `main` 외 ref에서
  나오지 못하게 fail-closed(Android 스크립트와 동일 계약).

## Data Contract

기존 계약을 **넓히지 않는다.** 유일한 변경은 `platform`이 서버 하드코딩에서 클라이언트 필수 입력으로
옮겨가는 것이다.

```
POST /api/v1/notifications/push-devices        (V1AuthGuard, throttle 10/60s)
{
  installationId: UUID,          // iOS: Keychain 영속
  token: string(20..4096),       // FCM registration token (APNs device token 아님)
  platform: "android" | "ios",   // NEW — 필수
  appVersion?: string(<=64),
  deviceModel?: string(<=128)
}
DELETE /api/v1/notifications/push-devices/:installationId   (204)
```

금지 사항은 Task 156과 동일하다. 추가로:

- `GoogleService-Info.plist` 커밋 금지. `FirebaseOptions`를 xcconfig public 식별자로 구성한다.
- APNs 인증 키(`.p8`)·인증서 커밋 금지. Firebase Console에만 업로드한다.
- FCM 토큰을 네이티브에 영속하지 않는다.
- `.xcodeproj` 커밋 금지(`project.yml`이 정본).

## Acceptance Criteria

1. Given Alpha iOS 앱에 로그인한 사용자
   When inquiry 답변이 생성되면
   Then background/terminated 상태에서도 알림이 표시된다.
2. Given 그 알림
   When 사용자가 탭하면
   Then 정확한 `/my/inquiries/:id` route가 열리고 다른 엔티티로 fallback하지 않는다.
3. Given 신규 설치
   When 사용자가 알림 권한을 거부하면
   Then 앱의 다른 기능은 정상 동작하고 허용으로 가장한 UI가 표시되지 않는다.
4. Given 한 사용자가 iOS/Android 기기를 함께 등록했을 때
   When 알림이 생성되면
   Then 두 platform 모두에 발송되고 revoke한 기기에는 발송되지 않는다.
5. Given Alpha 앱이 등록한 기기
   When production 발송이 일어나면
   Then 그 기기는 대상이 되지 않는다(environment 격리 negative control).
6. Given 웹이 `window.TeameetNative`를 호출할 때
   When 호출 프레임이 main frame이 아니거나 origin이 `WEB_ORIGIN`이 아니면
   Then 네이티브는 아무 동작도 하지 않는다.
7. Given `apps/v1_web`
   Then 이 태스크의 diff에 `apps/v1_web` 파일이 **하나도 없다**.
8. 기존 Android 등록/발송, 브라우저 Web Push 등록/발송/선호도/딥링크가 그대로 green이다.

## Validation

유닛(`TeameetTests`, 서명 불필요):

| 테스트 | 대상 | Android 대응 |
|---|---|---|
| `AllowedNavigationTests` | 내부/외부, kakao 예외, userInfo·명시 포트 우회 | `AllowedNavigationTest` |
| `DeepLinkRouteTests` | `safeRoute` — `//host`, 절대 URL, userInfo, 불법 문자 | `AllowedNavigationTest` |
| `PushConsentTests` | 권한 × opt-in 4조합 진리표 | `PushDeliveryPolicyTest` |
| `AppConfigTests` | 환경별 origin·bundle id·Firebase 값 정합 | `BuildConfigurationTest` + Gradle verify 태스크 |
| `NativeBridgeMessageTests` | 메시지 파싱, requestId 상관, 잘못된 JSON 무시 | (신규 — Android는 미보유) |

```
cd apps/v1_ios && xcodegen generate
xcodebuild test -project Teameet.xcodeproj -scheme TeameetAlpha \
  -destination 'platform=iOS Simulator,name=<xcrun simctl list devices available 로 확인한 기기>'
```

백엔드: 영향받는 Jest 스펙만 타깃 실행(풀스위트 금지).

시뮬레이터 수동: 로그인 → 홈 → 상세 → 스와이프 백 → 외부 링크 → 안전영역 → 업로드/다운로드.

실기기: 권한 허용/거부, foreground·background·terminated 3상태 수신, 알림 탭 딥링크 착지,
다기기, 로그아웃 revoke, alpha 토큰이 production 발송 대상이 되지 않는 negative control.

## Out of Scope

- Universal Links(AASA 게시)
- App Store 심사 제출
- iPad 최적화 (`TARGETED_DEVICE_FAMILY=1`)
- 웹 UI 변경 — `apps/v1_web`은 read-only다
- Android 코드 리팩터 (`platform` 1줄 제외)
- 직접 APNs 구현 (FCM을 재사용한다)
- production(`main`) 직접 승격

## Ambiguity Log

| Item | Current state | Required before |
|---|---|---|
| iOS 배포 타깃 | **iOS 16.0 확정.** firebase-ios-sdk 12.18.0 `Package.swift`의 `platforms: [.iOS(.v15), ...]`를 직접 읽어 확인했다(2026-08-29 실측) | — 해소됨 |
| Firebase iOS App ID / API key | 미등록. Firebase Console에서 `teameet-alpha`에 iOS 앱 추가 필요 | 실기기 푸시 |
| APNs 인증 키(`.p8`) | 미발급 | 실기기 푸시 |
| Apple Team ID / provisioning | 유료 멤버십 보유 확인. Team ID 미확인 | 실기기 설치·TestFlight |
| 실기기 matrix | 미검증 | Phase 5 QA |
| 구 Android APK 호환 | `platform` 필수화 시 이미 설치된 QA APK(`platform` 미전송)의 등록이 400이 된다. 두 변경이 같은 PR로 나가고 #821은 아직 dev에 없으므로 alpha에는 동시에 도달한다. 수동 사이드로드한 SM-A325N QA 빌드만 재설치가 필요하다 | Android 실기기 QA 재개 |

## Decision Log

- 2026-08-29: 기반은 `origin/feat/android-fcm-foundation`. #821이 dev에 머지되면 PR base를 `dev`로 재타깃한다.
- 2026-08-29: Capacitor를 쓰지 않는다. Task 156과 같은 순수 네이티브 WebView 셸이며 원격 origin을 로드한다.
- 2026-08-29: APNs를 직접 구현하지 않는다. Firebase iOS SDK(SPM)로 FCM 토큰을 받아 기존 push-devices API에
  `platform="ios"`로 등록한다. 서버 발송 경로(`FcmPushService`)를 그대로 재사용하기 위해서다.
- 2026-08-29: `project.yml`(XcodeGen)이 프로젝트 정본이고 `.xcodeproj`는 gitignore한다. Android의
  `build.gradle.kts`와 같은 위상이며, 생성물을 커밋하지 않아 머지 충돌과 드리프트를 없앤다.
- 2026-08-29: 코드 구조는 iOS 관용으로 재설계하되(async/await, actor, Keychain, `@MainActor`)
  allowlist·safeRoute·consent 정책은 Android JVM 테스트와 **동일 케이스**를 Swift로 이식한다.
  두 플랫폼이 보안 판정에서 갈리지 않게 하기 위해서다.
- 2026-08-29: `platform`을 선택+기본값이 아니라 **필수**로 만든다. 기본값을 두면 iOS 클라이언트의
  누락이 조용히 android로 기록돼 environment/platform 격리 검증이 무력화된다. Android 클라이언트도
  같은 PR에서 1줄 고친다.
- 2026-08-29: FCM 토큰을 네이티브에 영속하지 않는다(Android와 의도적으로 다름). iOS SDK가 이미 캐시와
  갱신 통지를 제공하므로 두 번째 사본은 stale 위험만 늘린다.
- 2026-08-29: `installationId`는 Keychain(`AfterFirstUnlockThisDeviceOnly`, iCloud 동기화 없음)에 둔다.
  재설치 시 새 installationId가 생겨 revoke 불가능한 고아 row가 쌓이는 것을 막는다.
- 2026-08-29: `version.properties`를 iOS 버전 SSOT로 두고 Android와 동기화하지 않는다. 값 중복을 만들지
  않기 위해 `Config/Version.generated.xcconfig`를 스크립트로 생성하고 `Shared.xcconfig`가 이를
  **필수** `#include`한다. 스크립트를 돌리지 않으면 조용히 잘못된 버전이 박히는 대신 빌드가 실패한다.
- 2026-08-29: Firebase iOS SDK는 SPM `exactVersion: 12.18.0`으로 고정한다. Android가
  `firebase-bom:34.18.0`을 정확히 고정하는 것과 같은 결정성을 위해서다. 12.18.0의 SPM 최소 iOS는
  15.0이라 배포 타깃 16.0과 충돌하지 않는다(체크아웃한 `Package.swift`를 직접 읽어 확인).
- 2026-08-29: `GoogleService-Info.plist` 없이 `FirebaseOptions(googleAppID:gcmSenderID:)` +
  `apiKey`/`projectID` 프로퍼티 대입 후 `FirebaseApp.configure(options:)`로 초기화한다.
  인자 없는 `FirebaseApp.configure()`는 헤더 주석이 plist 동기 파일 I/O를 명시하므로 쓰지 않는다.
- 2026-08-29: `TeameetTests`는 host application 없는 순수 로직 번들로 둔다. Firebase·WebKit·UIKit에
  의존하지 않는 타입만 컴파일하므로 `xcodebuild test`가 300MB짜리 Firebase 바이너리 아티팩트 해석을
  요구하지 않는다. 앱 전체 컴파일은 CI의 별도 시뮬레이터 빌드 단계가 담당한다.
- 2026-08-29: Android `market:` 스킴은 iOS에 없으므로 `itms-apps:`로 대체하고, `intent:`는 iOS에
  존재하지 않으므로 allowlist에서 제외한다.

## 감독 세션 결정 (2026-08-29, matchup-sports-platform-4a)

| # | 결정 | 근거 · 조건 |
|---|---|---|
| 1 | `Teameet.entitlements`는 S7로 이월 | 소비처 없는 capability를 미리 박지 않는다. S7에서 빌드된 `.app`의 embedded entitlements를 양 flavor 실판독해 증명한다 |
| 2 | 테스트 번들은 host 없는 순수 로직 유지 + 스킴의 test 액션이 앱 타깃을 **빌드**한다 | 테스트 프로세스에 Firebase·UIKit이 딸려 들어오지 않으면서, 앱 코드의 컴파일 오류는 `xcodebuild test`에서 잡힌다. Red 증명 필수 |
| 3 | 빈 `TeameetApp`은 A·B·C 대상 아님 | 다만 S4에서 **로딩 중 화면**이나 **로드 실패 화면**이 필요해지는 순간 3안 대상이다 |
| 4 | Swift 6 언어 모드 승인 | `@preconcurrency`·`nonisolated(unsafe)`로 마찰을 덮지 말고 먼저 보고할 것 |

`b5ff48945`가 `apps/v1_web`을 건드린 건 이 태스크와 무관하다 — PR #821의 head이자 이 브랜치의
base이며 작성자는 seeungmin이다. 이 태스크의 `apps/v1_web` 변경은 0줄로 유지한다.

## 베이스 전진 반영 (2026-08-29)

`origin/feat/android-fcm-foundation`이 전진해 3-way merge(`137568e7d`)로 흡수했다. 그중 두
커밋이 S4 범위를 직접 바꾼다.

**`e29209a26` fix(v1-web): honor Android safe area across detail flows**

안전영역 CSS 변수의 소비처가 하단 내비가 없는 상세·폼 화면까지 늘었다.

```css
.tm-app-frame-no-bottom .tm-scroll-area { bottom: var(--v1-shell-safe-bottom); }
.tm-app-frame-no-bottom .tm-scroll-area:has(.tm-fixed-cta),
.tm-app-frame-no-bottom .tm-scroll-area:has(.tm-chat-room) { bottom: 0; }
```

실측으로 확인한 현재 계약:

- `env(safe-area-inset-bottom)`은 `apps/v1_web` 전체에서 **딱 1곳**, 변수 정의에만 등장한다.
  나머지 11개 파일은 전부 `--v1-shell-safe-bottom`을 거친다.
- `viewport-fit`은 저장소에 **0건**이다. 따라서 WKWebView에서 `env()`는 0으로 평가되고
  `--v1-shell-safe-bottom`은 **전적으로 네이티브 주입값**이 된다. 주입을 빠뜨리면 상세·폼
  화면 전체가 홈 인디케이터에 깔린다.
- 자기 fixed surface가 이미 inset을 소비하는 화면은 opt-out 하므로, 네이티브는 **하단 inset
  하나만** 정직하게 publish하면 되고 화면별 보정을 하지 않는다.

**`4e38fe12f` fix(android): preserve WebView route on app re-entry**

`MainActivity`의 수명주기 계약이 바뀌어 S4 설계에 반영해야 한다.

- 콜드 스타트: `savedInstanceState`에서 `webView.restoreState()`가 성공하면 초기 URL을
  **로드하지 않는다**. 실패하거나 없을 때만 `WEB_ORIGIN + routeFromIntent`.
- `onNewIntent`: **명시적 route가 있을 때만** 이동한다. `singleTask`가 전달하는 목적지 없는
  MAIN/LAUNCHER 인텐트는 현재 페이지와 히스토리를 건드리지 않는다.
- `onSaveInstanceState`에서 `webView.saveState()`로 URL·히스토리를 보존한다.

iOS 대응: `WKWebView.interactionState`(iOS 15+)가 `saveState`/`restoreState`의 정확한 대응물로
back/forward 리스트와 스크롤 위치를 직렬화한다. 이를 영속화했다가 복원하고, 복원할 것이
없을 때만 `WEB_ORIGIN + "/home"`을 로드한다. 런처 재진입은 iOS에서 기본이 이미 "아무것도
하지 않음"이라 추가 코드가 필요 없고, 명시적 이동은 알림 탭(S7)이 담당한다.

## Progress Snapshot

단계 구분은 설계 세션(matchup-sports-platform-4a)이 2026-08-29에 확정한 S1–S11을 따른다.

- [x] **S1 준비** — `git fetch origin`, PR #821 확인(OPEN·base `dev`·MERGEABLE·head `b5ff48945`),
      worktree `ios-shell` + 브랜치 `feat/ios-webview-shell`, node_modules 심링크 3개, 태스크 문서 157
- [x] **S2 프로젝트 스캐폴드** — `project.yml`, `Config/{Shared,Alpha,Production}.xcconfig`,
      `version.properties`, `TeameetApp.swift`. 빈 앱이 시뮬레이터에서 실행됨.
      `Teameet.entitlements`는 소비처(S7 푸시)가 없어 보류
- [x] **S3 네비게이션 코어** — `AllowedNavigation.swift`, `DeepLinkRoute.swift` + 유닛 테스트 25개
- [x] **S4 WebView 셸** — 셸 + 네이티브 로드 실패 화면 + 네트워크 복구 자동 재시도
- [x] **S5 JS 브리지** — shim·origin 검증·액션 4종·잘못된 입력 방어
- [ ] **S6 백엔드 일반화**
- [ ] **S7 푸시 클라이언트**
- [ ] **S8 CI · 릴리스 가드** — `require-ios-production-ref.sh`는 작성·negative control 통과 상태로 대기
- [ ] **S9 문서 · changeset**
- [ ] **S10 PR + Copilot 리뷰 루프**
- [ ] **S11 실기기 QA** (APNs `.p8` 발급 이후)
  - [ ] **비행기 모드 토글로 오프라인 화면과 자동 재시도 실검증** — S4에서 시뮬레이터로는
        실제 경로 차단을 만들 수 없어 오류 객체·복구 신호 주입으로만 확인했다. 여기서 갚는다.

## 102 fail-open 수정 (2026-08-29)

`WebKitErrorDomain 102`을 무조건 걸러 **취소가 아무것도 남기지 않은 경우** 백지로 끝났다.
콜드 스타트 첫 로드가 외부 호스트로 리다이렉트되거나 서버가 메인 문서를 파일로 주면 그렇다.

| | 수정 전 | 수정 후 |
|---|---|---|
| 신호 | `code=102 url=nil failureSet=0 present=0` | `code=102 url=nil failureSet=0 present=1` |
| 화면 | 상태바 아래 **고유 색상 1개**, 순백 2,783,448픽셀 | 고유 색상 646개, "화면을 열지 못했어요" + 재시도 |

판정은 세 갈래다. 취소가 아니면 표시, 취소인데 이미 실패 화면이 있으면 삼킴(5xx 사유 보존),
취소인데 페이지가 남아 있으면 삼킴(평소 외부 링크), 나머지는 표시.

5xx 회귀(iPhone 17e 콜드 스타트 503 — `hasVisibleContent=false`라 가장 엄격):
`code=102 url=nil failureSet=1 present=0` → "팀밋 서버에 문제가 생겼어요 (오류 503)" 유지.

## S5 Validation Evidence (2026-08-29)

실제 alpha 페이지에서 계측했고, 프로브는 byte-identical로 원복했다(`PROBE` 0건).

### shim이 실제로 동작한다

```
{"shim":{"isNativePushAvailable":true,"typeofPostMessage":"function",
         "frozen":true,"survivedTamper":true}}
```

`isNativePushAvailable`은 웹 함수 본문(`typeof window.TeameetNative?.postMessage === 'function'`)을
그대로 평가한 값이다. 전역을 다른 객체로 바꿔치기해도 살아남는다.

### 수정하지 않은 웹이 스스로 브리지를 쓴다

계측 중 예정에 없던 요청이 하나 더 도착했다 — 실제 v1 웹 앱이 자기 UUID로 호출한 것이다.

```
PROBE received mainFrame=1 origin=https://alpha.teameet.co.kr:0 accepted=1
      body={"type":"get-push-state","requestId":"fec586d1-7d45-48d5-ae37-790efe3dcdbb"}
```

또 실행 중 `request-notification-permission`이 실제로 불려 iOS 시스템 권한 다이얼로그가 떴고,
`open-notification-settings`는 설정 앱을 열었다(둘 다 스크린샷).

### 액션 4종

| 액션 | 확인 방법 | 결과 |
|---|---|---|
| `get-push-state` | 응답 이벤트 | `{permission:"default", subscribed:false}`, requestId 그대로 반환 |
| `revoke-push-device` | 응답 이벤트 | 동일 |
| `request-notification-permission` | 실화면 | 시스템 권한 다이얼로그 표시 |
| `open-notification-settings` | 실화면 | 설정 앱 열림 + "◀ Teameet Alpha" 복귀 배너 |

권한 매핑(`notDetermined`→`default` / `denied`→`denied` /
`authorized`·`provisional`·`ephemeral`→`granted`)과 동의 진리표는 유닛 테스트가 고정한다.

### 잘못된 입력은 응답을 만들지 않는다

5종(`not json`, `{`, `[]`, type 없음, 모르는 type)을 보냈고 전부 네이티브에 **도달했으나**
응답은 하나도 생기지 않았다. 크래시 없음.

```
PROBE received ... accepted=1 body=not json
PROBE received ... accepted=1 body={"type":"delete-everything","requestId":"orphan-unknown"}
replies: ['req-get-push-state', 'req-revoke-push-device']      ← 정상 2건뿐
```

### origin 검증 — 라이브로 못 만든 것

발신 프레임의 origin·mainFrame은 매 메시지마다 평가되고 로그로 확인했다(위 `accepted=1`).
다만 **거부되는 쪽을 실화면에서 만들지 못했다.**

- `kauth.kakao.com`은 셸에 머무르지 않는다. 즉시 `accounts.kakao.com`으로 리다이렉트되고
  그 호스트는 allowlist에 없어 Safari로 넘어간다.
- 서브프레임 주입은 alpha 사이트 자체의 CSP가 막았다:
  `Refused to evaluate a string as JavaScript because 'unsafe-eval' ... is not an allowed source`
  (`script-src 'self' 'unsafe-inline' https://www.googletagmanager.com`).

규칙 자체는 유닛 테스트가 전수 고정한다 — 올바른 origin, kauth 예외, http, 다른 환경, suffix
호스트, 빈 origin, 명시 :443, 그리고 **잘못 설정된 기대 origin**. 마지막 것은 테스트가 잡은
실제 약점이다: xcconfig가 `//`를 잘라 `https:`나 `//host`로 도착하면 host만 비교하던 초안이
아무 origin이나 통과시켰다.

### 별건 — Kakao 로그인은 두 셸 모두에서 앱을 벗어난다

`kauth.kakao.com/oauth/authorize`를 열면 Kakao가 `accounts.kakao.com`으로 리다이렉트한다.
allowlist에는 `kauth.kakao.com`만 있으므로 셸이 그 이동을 외부로 넘긴다. Android의
`isTrustedAuthProvider`도 같은 한 호스트만 허용하므로 **Android도 동일하게 동작할 것으로
보인다**(Task 156 Phase 5에 Kakao 로그인 검증 기록 없음). 정책 변경이 필요한지는 사용자 판단
사항이라 손대지 않았다.

## S4 Validation Evidence (2026-08-29)

전부 시뮬레이터(iPhone 17, iOS 26.5)에서 실제로 실행한 결과다. 임시 프로브로 계측한 뒤
`WebShellViewController.swift`는 byte-identical로 원복했고(추가됐던 119줄 제거, `cmp -s` 확인,
트리에 `PROBE` 문자열 0건) 최종 테스트는 원복된 소스로 다시 돌렸다.

### 안전영역 — 육안이 아니라 숫자로

네이티브가 계산한 값과 페이지가 실제로 해석한 값을 매 `didFinish`마다 대조했다.

```
inspectable=1 origin=https://alpha.teameet.co.kr
didFinish url=https://alpha.teameet.co.kr/home
safearea native_points=34 page={"native":"34px","shell":"34px"}
didFinish url=https://alpha.teameet.co.kr/my/teams
safearea native_points=34 page={"native":"34px","shell":"34px"}
```

`getComputedStyle(document.documentElement)`로 읽은 `--teameet-native-safe-bottom`과
`--v1-shell-safe-bottom`이 둘 다 네이티브 34pt와 일치한다. 하단 내비가 있는 홈과 상세 화면
양쪽에서 같은 값이 나왔다.

### 셸 기본 동작

| 항목 | 결과 |
|---|---|
| alpha 로그인 → 홈 | `E2E팀장A`로 로그인된 실제 alpha 홈 렌더 |
| 홈 → 상세 → 뒤로 | `/home` → `/my/teams` → `canGoBack=1` → `/home` |
| 외부 링크 | Safari가 `apple.com`을 열고 상태바에 `◀ Teameet Alpha` 복귀 배너. 앱 내부 이동 없음 |
| 다운로드(내부 origin) | `tmp/downloads/<uuid>/2048`에 정확히 2048바이트 기록 후 공유 시트 표시 |
| `isInspectable` | Alpha 런타임 `1`, Production 런타임 `0` (Info.plist `YES`/`NO`와 일치) |
| 재진입 route 보존 | `/my/teams`에서 백그라운드 → 종료 → 재실행 시 `/my/teams` 복원 |
| 손상된 복원 데이터 | 저장 슬롯을 깨뜨린 뒤 재실행 → 크래시 없이 `/home` |

### 로드 실패 화면

| 실패 | 재현 방법 | 관측 |
|---|---|---|
| DNS 실패 | `TEAMEET_WEB_ORIGIN`을 존재하지 않는 호스트로 빌드 | `domain=NSURLErrorDomain code=-1003 present=1` → "지금은 팀밋에 연결할 수 없어요" |
| 서버 5xx | 실제 `https://httpbingo.org/status/503` | `decidePolicyFor navigationResponse`가 가로채 "팀밋 서버에 문제가 생겼어요 (오류 503)" |
| 오프라인 | `NSURLErrorNotConnectedToInternet`을 델리게이트 핸들러에 주입 | `code=-1009 present=1` → "인터넷에 연결되어 있지 않아요" |
| 취소 | `NSURLErrorCancelled`를 델리게이트 핸들러에 주입 | `code=-999 present=0` — 오류 화면 뜨지 않음 |
| 복구(자동) | 경로 복구 신호 | 버튼 없이 재로드되어 오버레이 사라짐 |
| 복구(수동) | 버튼이 호출하는 `model.retry()` | 재로드 후 오버레이 사라짐 |
| 5xx + 경로 복구 | 503 화면에서 경로 복구 신호 | **재로드하지 않음**(의도) — 서버 장애에 부하를 더하지 않는다 |

라이트/다크 각각, 그리고 최대 접근성 Dynamic Type에서 잘림 없이 렌더되는 것을 캡처로 확인했다.

### 실행으로 새로 알게 된 것

- **정책 취소는 `WebKitErrorDomain 102`로 되돌아온다.** 5xx를 잡아 `.cancel`을 반환하면 WebKit이
  곧바로 `didFailProvisionalNavigation`을 102로 호출한다. 이 코드를 거르지 않으면 방금 세운
  `serverError` 상태를 `unreachable`로 덮어써 잘못된 문구가 뜬다. 다운로드로 전환할 때도 같은
  102가 온다. 즉 이 필터는 방어가 아니라 **필수 경로**다.
- 반대로 **로딩 중 다른 링크로 이동하는 경우, 이 WebKit은 실패 콜백을 아예 호출하지 않았다.**
  같은 시나리오에서 Android가 보이던 오류가 iOS에선 애초에 발생하지 않는다.
- 이 두 관찰은 `WebShellFailurePolicyTests`가 이미 고정하고 있던 계약과 일치한다.

### 결정 2 종료 증거 (테스트가 앱 컴파일 오류를 잡는가)

```
BASELINE   Executed 25 tests, with 0 failures  → ** TEST SUCCEEDED **
RED        TeameetApp.swift:29:29: error: cannot convert value of type 'String' to specified type 'Int'
           ** TEST FAILED **
RESTORE    app source restored byte-identical → ** TEST SUCCEEDED **
```

### 최종 테스트 (원복된 소스)

```
TeameetAlpha       Executed 59 tests, with 0 failures (0 unexpected) → ** TEST SUCCEEDED **
TeameetProduction  Executed 59 tests, with 0 failures (0 unexpected) → ** TEST SUCCEEDED **
```

Swift 6 언어 모드에서 `@preconcurrency`·`nonisolated(unsafe)` 없이 통과했다.

### S4에서 하지 못한 것

- **실제 네트워크 차단으로 오프라인을 만들지 못했다.** 시뮬레이터는 호스트의 네트워크 스택을
  공유하고 `simctl`에 네트워크 조작 명령이 없다. 호스트 Wi-Fi를 끄는 것은 공용 머신이라 하지
  않았다. 오프라인 화면과 자동 재시도는 델리게이트 핸들러와 경로 복구 콜백에 **정확한 오류
  객체·신호를 주입**해 확인했고, 판정 로직 자체는 유닛 테스트가 고정한다. 실제 Wi-Fi 토글은
  S11 실기기 QA로 남긴다.
- **화면 터치를 자동화하지 않았다.** 전역 좌표 클릭은 시뮬레이터가 아닌 다른 창을 누를 수
  있어(실제로 한 번 발생) 중단했다. 재시도 버튼은 버튼의 action 클로저가 호출하는
  `model.retry()`를 직접 실행해 검증했다. 제스처 단위 검증이 필요하면 XCUITest 타깃을
  별도로 세우는 편이 안전하다.

## Validation Evidence (2026-08-29, S1–S3)

- `xcodebuild test -scheme TeameetAlpha -destination 'platform=iOS Simulator,name=iPhone 17'`:
  25 tests, 0 failures, `** TEST SUCCEEDED **`.
- `xcodebuild build`: `TeameetAlpha`, `TeameetProduction` 모두 `** BUILD SUCCEEDED **`
  (Firebase SPM 링크 포함, Swift 6 언어 모드).
- 빌드 산출물 `Info.plist` 실판독 — Alpha `kr.co.teameet.alpha` / `Teameet Alpha` /
  `https://alpha.teameet.co.kr` / inspectable `YES`, Production `kr.co.teameet` / `Teameet` /
  `https://teameet.co.kr` / inspectable `NO`. 양쪽 다 `CFBundleShortVersionString = 0.1.0`으로
  `version.properties` SSOT가 번들까지 도달함을 확인.
- 시뮬레이터 설치·실행: `kr.co.teameet.alpha` PID 기동, `launchctl`에 프로세스 생존,
  크래시 리포트 없음.
- **Red 증명** — ① Java 배제문자 게이트를 제거하니
  `testRejectsAuthorityConfusionPayloads` 실패, ② 포트 없음을 443으로 합치니
  `testTreatsAnExplicitDefaultPortAsADifferentOrigin` 실패, 원복 후 다시 25/25 green.
- `generate-ios-version-xcconfig.sh` / `require-ios-production-ref.sh` negative control 통과
  (`versionName=0.1` 거부, `versionCode=0` 거부, `GITHUB_REF_NAME=dev` 거부, `main` 허용).

### 실측으로 확정한 빌드 사실 (모르면 반드시 다시 밟는 함정)

**(a) 배포 타깃 iOS 16.0** — Firebase가 바닥을 정한다.

```
$ curl -fsSL https://raw.githubusercontent.com/firebase/firebase-ios-sdk/12.18.0/Package.swift \
    | grep -m1 'platforms:'
  platforms: [.iOS(.v15), .macCatalyst(.v15), .macOS(.v10_15), .tvOS(.v15), .watchOS(.v7)],
```

최소 iOS 15.0이므로 16.0 타깃과 충돌하지 않는다. SPM 산출물은 `FirebaseMessaging`과
`FirebaseCore` 두 라이브러리 product를 앱 타깃에 **둘 다** 명시해야 한다.

**(b) xcconfig 값에 리터럴 `//`를 넣을 수 없다** — 유일한 해법은 `/$()/`다.

xcconfig 파서가 `//`를 주석 시작으로 읽어 **변수 치환보다 먼저** 값을 잘라 버린다.
슬래시를 별도 변수로 빼는 우회도 통하지 않는다(`SLASHES = //` 자체가 주석에 삼켜져
변수가 아예 생기지 않고 `TEAMEET_WEB_ORIGIN`이 `https:alpha.teameet.co.kr`이 된다).
두 슬래시 사이에 빈 매크로 확장을 끼우면 raw 텍스트에 인접한 슬래시가 없어 주석 스캐너가
발동하지 않고, 확장 후 값은 `//`가 된다.

```
Config/Alpha.xcconfig:
  SLASHES = /$()/
  TEAMEET_WEB_ORIGIN = https:$(SLASHES)alpha.teameet.co.kr

$ xcodebuild -showBuildSettings -configuration 'Alpha Debug' | grep -E ' (SLASHES|TEAMEET_WEB_ORIGIN) = '
    SLASHES = //
    TEAMEET_WEB_ORIGIN = https://alpha.teameet.co.kr
```

**(c) `INFOPLIST_KEY_<커스텀>`은 자체 키에 조용한 no-op다.**

Xcode가 이미 아는 키(`CFBundleDisplayName` 등)에만 적용된다. 자체 키는
`-showBuildSettings`에 빌드 설정으로는 멀쩡히 보이지만 번들 `Info.plist`에는 도달하지
않는다. 실패가 조용해서 특히 위험하다. 해법은 `project.yml`의 명시적 `info:` 블록에
`$(VAR)` placeholder를 두고 `INFOPLIST_EXPAND_BUILD_SETTINGS`가 치환하게 하는 것이다.
빌드된 산출물로 확인한다(소스가 아니라):

```
$ plutil -p "$DD/Build/Products/Alpha Debug-iphonesimulator/Teameet.app/Info.plist"
  "CFBundleIdentifier" => "kr.co.teameet.alpha"
  "CFBundleDisplayName" => "Teameet Alpha"
  "CFBundleShortVersionString" => "0.1.0"
  "TeameetWebOrigin" => "https://alpha.teameet.co.kr"
  "TeameetWebViewInspectable" => "YES"
$ plutil -p "$DD/Build/Products/Production Debug-iphonesimulator/Teameet.app/Info.plist"
  "CFBundleIdentifier" => "kr.co.teameet"
  "CFBundleDisplayName" => "Teameet"
  "TeameetWebOrigin" => "https://teameet.co.kr"
  "TeameetWebViewInspectable" => "NO"
```

**(d) `xcodebuild test`도 패키지 그래프를 해석한다.** 앱 타깃을 컴파일하지 않아도 SwiftPM이
링크하지 않는 바이너리까지 내려받는다 — `SourcePackages/artifacts` 841MB, 그중
`grpc-binary` 609MB. S8의 CI는 SourcePackages를 캐시해야 한다.

**(e) DerivedData 경로를 고정하지 않으면 엉뚱한 빌드를 판독한다.** 같은 프로젝트 이름의
스파이크가 있으면 `~/Library/Developer/Xcode/DerivedData/Teameet-*`가 둘 이상 생긴다.
실제로 이 세션에서 프로브의 `.app`을 읽고 결함 3건으로 오진했다. 산출물 검증은 항상
`-derivedDataPath`를 명시한 빌드의 경로로 한다.

### 알려진 한계

- `TeameetTests`가 host application 없는 순수 로직 번들이라 `xcodebuild test`는 앱 타깃을
  컴파일하지 않는다. S4~S7 코드의 컴파일 오류는 이 명령으로 잡히지 않으므로, CI가 서명 없는
  시뮬레이터 빌드를 **반드시** 별도 단계로 돌려야 한다(S8).
- Java 파서 동등성은 이 워크스테이션에 JDK가 없어 JVM으로 대조하지 못했다. 근거는
  `java.net.URI` javadoc의 문자 범주 정의(`other` = 비US-ASCII 중 `isISOControl`·`isSpaceChar`가
  아닌 것, `escaped` = `%` + 16진수 2자리)이며, Swift 쪽 동작만 실행으로 확인했다.
