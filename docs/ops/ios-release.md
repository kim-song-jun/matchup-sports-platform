# iOS Release Runbook

`apps/v1_ios`는 배포된 v1 Web을 로드하는 셸이다. 화면은 웹 릴리스로 바뀌므로 스토어 제출은
셸 자체가 바뀔 때만 한다. Android 쪽 대응 문서: [`android-release.md`](./android-release.md).

## 안전 경계

- **프로덕션 산출물은 `main`에서만 만든다.** `scripts/release/require-ios-production-ref.sh`가
  `GITHUB_REF_NAME != main`이면 실패한다. `.github/workflows/ios-alpha.yml`이 이 가드를
  **양방향으로** 돌린다 — `main` 통과, `dev` 거부, 미설정 거부. 한 방향만 확인하면 항상 0을
  반환하는 스크립트도 초록이 된다.
- `dev → main` 승격은 사용자만 한다. 에이전트는 어떤 방식으로도 하지 않는다.

## 버전의 사실 원천

`apps/v1_ios/version.properties` 하나다. Android와 **별도 파일**인 것은 두 스토어가 각자
일정으로 심사하기 때문이다.

```
versionCode=1     → CURRENT_PROJECT_VERSION (CFBundleVersion)
versionName=0.1.0 → MARKETING_VERSION       (CFBundleShortVersionString)
```

`scripts/release/generate-ios-version-xcconfig.sh`가 이 값을
`apps/v1_ios/Config/Version.generated.xcconfig`로 쓴다. **이 파일은 gitignore 대상이라 깨끗한
체크아웃에는 없고**, `Shared.xcconfig`가 무조건 include하므로 생성하지 않으면
`could not find included file 'Version.generated.xcconfig'`로 빌드가 실패한다. CI는 xcodegen
앞에서 이 스크립트를 돌린다. 로컬에서 처음 클론했을 때도 같은 순서로 한다.

```bash
bash scripts/release/generate-ios-version-xcconfig.sh
cd apps/v1_ios && xcodegen generate
```

`Teameet.xcodeproj`도 생성물이고 gitignore 대상이다. **정의는 `project.yml`이다** — 프로젝트
파일을 Xcode에서 직접 고치면 다음 `xcodegen generate`에 지워진다.

## 빌드 구성

| Scheme | Configuration | Origin | `aps-environment` |
|---|---|---|---|
| `TeameetAlpha` | `Alpha Debug` / `Alpha Release` | `https://alpha.teameet.co.kr` | `development` |
| `TeameetProduction` | `Production Debug` / `Production Release` | `https://teameet.co.kr` | `production` |

Android의 product flavor에 대응한다. 번들 ID는 `kr.co.teameet.alpha` / `kr.co.teameet`이며
서버의 `APNS_BUNDLE_ID`와 짝이 맞아야 한다([`ios-apns-setup.md`](./ios-apns-setup.md)).

## 서명 — 푸시 QA를 하려면 여기를 읽어라

**CI의 서명 없는 빌드(`CODE_SIGNING_ALLOWED=NO`)로는 푸시 등록 경로를 탈 수 없다.**
엔타이틀먼트가 없으므로 `registerForRemoteNotifications`가
`NSCocoaErrorDomain code=3000 "No valid 'aps-environment' entitlement string found"`으로
실패하고, 등록 코드에 닿지도 못한다. CI 초록은 **컴파일 게이트**일 뿐이다.

푸시 QA에는 ad-hoc 서명이 필요하다 — Xcode의 "Sign to Run Locally"(`CODE_SIGN_IDENTITY=-`).
시뮬레이터 빌드는 Xcode가 `Teameet.app-Simulated.xcent`를 만들어 `aps-environment`를 넣어
주므로, 그 상태에서는 권한 요청·토큰 수신·알림 탭까지 실제로 돈다.

> **직접 `codesign`으로 진짜 `aps-environment`를 주입하지 마라.** SpringBoard가 앱 실행 자체를
> 거부한다(`FBSOpenApplicationServiceErrorDomain code=1`). Xcode가 시뮬레이터용 entitlements를
> 대신 넣는 것을 우회하려는 시도이며, 다음 사람이 같은 우회를 다시 밟기 쉬워서 적어 둔다.

산출물의 엔타이틀먼트는 빌드된 `.app` 옆의 `.xcent`로 확인한다(서명 없는 빌드의 서명 자체에는
비어 있다).

```bash
plutil -p "<DerivedData>/Build/Intermediates.noindex/Teameet.build/Alpha Debug-iphonesimulator/Teameet.build/Teameet.app-Simulated.xcent"
```

**`-derivedDataPath`를 반드시 명시한다.** 같은 이름의 다른 빌드가 있으면 엉뚱한 산출물을 읽고
결함으로 오진한다(실제로 그렇게 3건을 오진한 적이 있다).

## `.p8` 취급

발급·환경변수 매핑은 [`ios-apns-setup.md`](./ios-apns-setup.md)에 있다. 여기서 반복할 것은
하나다: **`.p8` 파일과 그 내용은 이 저장소에 절대 들어가지 않는다. 저장소가 public이다.**
다운로드는 한 번뿐이므로 팀의 비밀 저장소에 보관하고, 서버에는 호스트 `deploy/.env`로만
넣는다.

## Universal Links

`/callback/*` 링크가 Safari 대신 앱을 열게 하는 것이 목적이다(카카오 로그인 리다이렉트).
서버 쪽 절차와 미완 사유는 [`../../deploy/aasa/README.md`](../../deploy/aasa/README.md)에 있다.
**현재 Apple Team ID가 없어 association 파일을 만들 수 없고, 링크는 여전히 Safari로 열린다.**

## 롤백

셸은 화면을 담고 있지 않으므로, 화면 문제의 롤백은 **웹 릴리스 롤백**이다. 셸 자체를 되돌려야
하는 경우(크래시·권한·딥링크 회귀)에만 스토어 롤백이 필요하며, 그때는 이전 빌드를 다시
제출한다 — App Store에는 즉시 되돌리기가 없다는 점을 감안해 셸 변경은 작게 나눈다.

## 기기가 있어야만 닫히는 항목

- 실제 APNs 게이트웨이로의 발송과 수신(`.p8` 필요)
- 서버 → APNs → 기기 종단 전달, 다기기 fan-out
- alpha 토큰이 production 발송 대상이 아님을 보이는 negative control
- background / terminated 상태 전달
- 실제 APNs 오류 응답(`BadDeviceToken` 등)에서의 기기 폐기 동작

시뮬레이터로 이미 확인한 것(권한 허용, 알림 탭 → 딥링크 착지, 등록 실패 시 정직한 상태 보고)은
`scripts/ios/verify-push-slice.sh`로 재현한다.
