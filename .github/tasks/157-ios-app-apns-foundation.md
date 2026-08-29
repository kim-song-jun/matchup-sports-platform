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

## Progress Snapshot

- [x] `git fetch origin`, PR #821 상태 확인(OPEN, base `dev`, MERGEABLE, head `b5ff48945`)
- [x] `feat/ios-webview-shell` worktree 생성(base `origin/feat/android-fcm-foundation`)
- [x] Android 참조 구현 전량 정독(셸·브리지·푸시·빌드·테스트·CI·릴리스 스크립트)
- [x] 웹 브리지 계약과 백엔드 기기 API 계약 확인, Prisma에 `ios` enum 존재 확인
- [ ] Phase 1 프로젝트 골격 + 순수 정책 + 유닛 테스트 green
- [ ] Phase 2 WebView 셸
- [ ] Phase 3 JS 브리지
- [ ] Phase 4 푸시 파이프라인
- [ ] Phase 5 백엔드 최소 표면
- [ ] Phase 6 환경 분리·CI·릴리스 문서
- [ ] 시뮬레이터 수동 검증
- [ ] 실기기 QA (Firebase iOS 앱 등록·APNs 키 발급 이후)
