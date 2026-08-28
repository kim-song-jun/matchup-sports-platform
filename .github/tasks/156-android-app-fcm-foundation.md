# Task 156 — Android App + FCM Foundation

Status: ACTIVE
Base branch: `dev`
Working branch: `feat/android-fcm-foundation`
Target: `both` (`apps/v1_api`, `apps/v1_web`, Android native surface, deploy/docs)
Mode: CODE

## Objective

기존 Teameet v1 웹 경험을 Android 앱으로 제공하고, 기존 Web Push를 보존하면서 Android 네이티브 FCM 알림을 추가한다. 첫 vertical slice는 로그인한 사용자가 Alpha Android 앱에서 `inquiry_answered` 알림을 받고, 알림을 눌러 정확한 문의 화면으로 이동하는 것이다.

## Current Evidence (2026-08-28)

- v1 정본은 `apps/v1_api`, `apps/v1_web`이다.
- `apps/v1_web`에는 현재 Capacitor 의존성, `capacitor.config.*`, Android 프로젝트, 정적 export 분기가 없다.
- `apps/v1_web/next.config.ts`는 production에서 `output: 'standalone'`을 사용한다.
- 브라우저 푸시는 `V1PushSubscription` + `WebPushService` + VAPID로 이미 동작한다.
- 알림 본문과 목적지는 `V1Notification`의 `title`, `body`, `deepLink`와 `NotificationsService`가 보유한다.
- Android FCM registration token 모델과 Firebase Admin 발송 서비스는 v1에 없다.
- legacy `apps/web`의 Capacitor/FCM 코드는 V1 Scope Override에 따라 구현 근거로 사용하지 않는다.
- `.github/tasks/next-session-plan-72-onward.md`의 “Android Chrome WebView에서 Web Push API 재사용” 서술은 v1 runtime evidence가 없으므로 이 task가 supersede한다.

## Architecture Gate

Phase 0에서 아래 후보를 route/runtime evidence로 평가했다.

1. **Bundled Capacitor app (우선 검증)**
   - 장점: 공식 Capacitor 배포 모델, 네이티브 플러그인/FCM 연동이 단순하다.
   - 위험: 현재 Next App Router의 동적 v1 route 전체를 정적 산출물로 만들 수 있는지 미확정이다.
2. **Dedicated Android WebView shell + FCM bridge (차선)**
   - 장점: 현재 배포된 Next 앱을 재사용하고 웹 변경을 앱 재출시 없이 반영할 수 있다.
   - 위험: auth/cookie, 외부 OAuth, 탐색 allowlist, JS bridge, 파일 업로드를 네이티브에서 직접 안전하게 관리해야 한다.
3. **Trusted Web Activity**
   - 비교 기준으로만 검증한다. 네이티브 FCM과 웹 상태 연동이 목표를 복잡하게 만들면 채택하지 않는다.

Capacitor `server.url`로 원격 운영 사이트를 직접 로드하는 방식은 사용하지 않는다. Capacitor 공식 config 문서가 이를 live reload 전용이며 production 용도가 아니라고 명시한다.

Phase 0 exit decision:

- 모든 앱 대상 v1 route, 인증, 업로드, 뒤로가기, 딥링크를 bundled asset으로 보존할 수 있으면 Capacitor를 선택한다.
- 정적 export가 silent route narrowing 또는 대규모 프레임워크 마이그레이션을 요구하면 Android WebView shell을 선택한다.
- 선택 결과와 탈락 사유를 이 문서의 Decision Log에 기록한 후에만 native scaffold를 커밋한다.

## Scope

### Phase 0 — Production-safe shell spike

- 앱 대상 v1 route inventory를 확정한다.
- 동적 route, auth cookie, OAuth/callback, Socket.IO, upload/download, external link를 점검한다.
- Capacitor bundled build 가능성을 최소 스파이크로 검증한다.
- Android emulator 또는 실기기에서 login → home → detail → back 흐름을 검증한다.
- 선택한 shell과 repository path를 확정하고 `AGENTS.md`의 valid v1 source map을 같은 변경에서 갱신한다.

### Phase 1 — Android device contract

- Prisma에 Android 설치 단위 push device 모델과 migration을 추가한다.
- 한 사용자의 여러 기기, 동일 설치의 token refresh, logout revoke를 지원한다.
- Alpha/production 환경 혼선을 DB/API와 Firebase project 양쪽에서 차단한다.
- FCM token은 응답과 로그에서 노출하지 않고 sensitive device identifier로 취급한다.
- 인증된 register/refresh/revoke API와 DTO, throttling, integration test를 추가한다.
- `docs/api/domains/supporting-domains.md`를 같은 변경에서 sync한다.

### Phase 2 — Delivery fan-out

- Firebase Admin SDK 기반 `FcmPushService`를 Web Push와 별도 adapter로 추가한다.
- `V1Notification`의 기존 title/body/deepLink를 Android payload의 source of truth로 사용한다.
- Web Push와 FCM을 함께 fan-out하되 한 채널 실패가 알림 row 생성을 성공처럼 위장하거나 다른 채널을 취소하지 않게 한다.
- invalid/unregistered token은 비활성화하고 transient failure는 추적 가능한 실패로 기록한다.
- notification/business key를 payload에 포함해 중복 탭/처리를 방지한다.
- inquiry, match/team/tournament, chat, worker 직접 발송 경로가 공통 dispatcher를 사용하도록 수렴시킨다.

### Phase 3 — Android client

- Alpha와 production application ID/flavor를 분리한다.
- Android 13+ `POST_NOTIFICATIONS` 권한을 사용자 맥락 안에서 요청한다.
- 로그인/세션 hydrate 후 FCM token을 등록하고 refresh/reinstall/logout 수명주기를 처리한다.
- foreground/background/terminated 수신과 notification channel을 구현한다.
- 알림 탭의 상대경로 deep link를 allowlist 검증 후 앱 내부 route로 연다.
- 로그아웃 상태에서는 인증 후 원래 목적지를 복원한다.
- 외부 OAuth/결제/지도 링크는 검증된 Custom Tab/외부 앱 경계로 분리한다.

### Phase 4 — Environment and release

- Firebase Alpha와 production 프로젝트를 분리한다.
- Firebase Admin credential은 앱/Git에 포함하지 않고 기존 secret delivery 경로로 주입한다.
- Alpha application artifact를 Play internal testing 또는 controlled device install로 배포한다.
- app version/versionCode, signing, AAB build, rollback 절차를 문서화한다.
- `dev` merge는 Alpha만 배포하며 `main` 승격은 사용자가 수행한다.

### Phase 5 — QA and operations

- foreground/background/terminated, permission allow/deny, token refresh, logout, multi-device를 실제 기기에서 검증한다.
- Alpha token이 production 발송 대상이 되지 않는 negative control을 둔다.
- inquiry notification tap이 정확한 inquiry detail로 이동하는 첫 vertical slice를 증명한다.
- Android API level과 Samsung/stock Android 조합의 verdict를 기록한다.
- FCM delivery failure/invalid token 관측 경로와 runbook을 추가한다.

## Data Contract Draft

Required responsibilities:

- installation 단위 registration token 소유권
- user/session과 platform/environment 연결
- token refresh와 revoke
- 마지막 성공/실패 및 활성 상태

금지:

- `V1User`에 token 하나만 직접 저장
- FCM token 평문 로그
- Alpha/production 공용 Firebase project 또는 공용 application ID
- Firebase service account JSON 커밋
- 앱 안에 Firebase Admin credential 포함

최종 model/field 이름은 Phase 1 RED test와 migration 설계에서 확정한다.

## Acceptance Criteria

1. Given Alpha Android 앱에 로그인한 사용자
   When inquiry 답변이 생성되면
   Then 앱이 background/terminated 상태에서도 휴대폰 알림창에 알림이 표시된다.
2. Given 해당 알림
   When 사용자가 탭하면
   Then 정확한 `/my/inquiries/:id` 계열 canonical route가 열리고 다른 엔티티로 fallback하지 않는다.
3. Given Android 13+ 신규 설치
   When 사용자가 알림 권한을 거부하면
   Then 앱의 다른 기능은 정상 동작하고 허용으로 가장한 UI가 표시되지 않는다.
4. Given 한 사용자가 두 기기를 등록했을 때
   When 알림이 생성되면
   Then 두 활성 기기에 발송되고 로그아웃/revoke한 기기에는 발송되지 않는다.
5. Given invalid FCM token
   When 발송 결과가 unregistered를 반환하면
   Then token이 비활성화되며 다른 기기/Web Push 발송은 계속된다.
6. Given Alpha와 production 설정
   When build/deploy guard를 실행하면
   Then package ID, Firebase project, API origin의 교차 연결을 실패로 검출한다.
7. Existing browser Web Push registration, delivery, preferences, and deep links remain green.

## Validation

- RED → GREEN backend service/controller/integration tests
- Prisma migration replay + drift gate
- v1 API notification/Web Push regression suite
- v1 web push hook/service worker regression suite
- Android unit/instrumentation tests for allowlist, lifecycle, deep-link parsing
- signed Alpha build smoke on real device
- foreground/background/terminated manual notification matrix
- `git diff --check`, touched-path tech-debt grep, committed-tree dependency check

## Out of Scope

- iOS/APNs implementation
- 전체 웹 UI 재작성 또는 React Native 전환
- Firebase Firestore/Functions 도입
- 마케팅 캠페인 자동화
- production(`main`) 직접 승격

## Ambiguity Log

| Item | Current state | Required before |
|---|---|---|
| production application ID | `kr.co.teameet` 확정 | Play artifact 최초 업로드에서 중복 여부 확인 |
| Alpha application ID | `kr.co.teameet.alpha` 확정 | Alpha APK CI |
| Firebase projects/service accounts | 미확인 | 실제 FCM Alpha delivery |
| Google Play account type/created date | 미확인 | closed/production test schedule |
| Android min SDK/device matrix | min SDK 26 확정, 제조사 실기기 matrix 미검증 | Phase 5 QA |
| shell architecture | dedicated Android WebView shell 확정 | Phase 5 QA |

## Decision Log

- 2026-08-28: Android 우선, iOS 제외.
- 2026-08-28: 기존 Web Push는 유지하고 Android native notification channel을 추가한다.
- 2026-08-28: Firebase는 FCM delivery에만 사용하고 notification business logic은 v1 API가 소유한다.
- 2026-08-28: remote `CapacitorConfig.server.url` production packaging은 제외한다.
- 2026-08-28: **Dedicated Android WebView shell**을 선택했다. v1 Web은 181개 page 중 76개가 dynamic route이고 `generateStaticParams`가 없으며 cookie auth, same-origin API/upload/Socket.IO를 사용하므로 bundled static export는 route capability를 조용히 축소한다. TWA는 native FCM/session lifecycle bridge 목표에 맞지 않는다.
- 2026-08-28: Android 정본 경로는 `apps/v1_android`, production ID는 `kr.co.teameet`, Alpha ID는 `kr.co.teameet.alpha`, min SDK 26, target/compile SDK 36으로 확정했다.
- 2026-08-28: 로컬 Android SDK/Gradle 설치 없이 GitHub Actions(Java 17 + Gradle 9.1.0 + API 36)에서 unit test와 Alpha debug APK를 생성한다.

## Progress Snapshot

- [x] 최신 `origin/dev`, `origin/main` fetch 및 local fast-forward 완료
- [x] 최신 `origin/dev`에서 `feat/android-fcm-foundation` 생성
- [x] 현재 v1 Web Push/notification/Prisma/Next config baseline 확인
- [x] legacy Capacitor/FCM code가 v1 정본이 아님을 확인
- [x] Phase 0 route/auth/build spike (local Android SDK 부재로 native compile은 CI gate로 이관)
- [x] shell architecture decision
- [x] Phase 1 device contract + migration + controller/service unit tests
- [x] Phase 2 FCM delivery fan-out + invalid/transient token handling unit tests
- [x] Phase 3 Android client scaffold + origin-scoped bridge + permission/register/revoke/deep link
- [x] Phase 4 Alpha debug APK CI scaffold 및 환경 분리 문서
- [ ] Phase 5 real-device QA/operations

## Validation Evidence (2026-08-28)

- Backend targeted Jest: 5 suites, 51 tests passed (`push-device` DTO/service/controller, FCM delivery, notification fan-out).
- Web targeted Vitest: 2 files, 19 tests passed (native bridge correlation, native register/revoke, existing browser Web Push).
- `pnpm --filter v1_api exec tsc --noEmit`: passed.
- `pnpm --filter v1_web exec next typegen` followed by `tsc --noEmit`: passed; stale deleted-route types were regenerated without retaining a source diff.
- Prisma schema validation: passed.
- Fresh isolated PostgreSQL 16 replay: all 143 migrations, including `20260828000000_add_v1_push_devices`, applied successfully; owned test container removed.
- Alpha-over-production Docker Compose config parse: passed.
- `git diff --check`: passed; touched-path debt grep: no matches.
- Android Alpha CI run `33137141868` passed Java compile, API 36 unit task, Alpha debug APK assembly, and artifact upload after the initial Safe Browsing API compile regression was fixed. Real-device foreground/background/terminated delivery remains Phase 5 and cannot be claimed before Firebase Alpha configuration and APK installation.
