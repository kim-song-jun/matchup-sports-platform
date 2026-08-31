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

> **어느 쪽을 올리나 — 동작이 바뀌면 `versionName`, 같은 동작의 재업로드면 `versionCode`.**
> App Store Connect 는 둘 다 받아들이므로 규칙이 없으면 갈린다. 판단 기준은 테스터가 읽는
> 문장이다: 푸시가 새로 동작하게 된 빌드는 "0.1.0 의 두 번째 것" 이 아니라 **"0.1.1 로
> 업데이트"** 여야 무엇이 달라졌는지 전달된다. 서명이나 업로드만 다시 한 경우는 `versionCode`
> 만 올린다. `versionCode` 는 어느 쪽이든 항상 올라간다 — 같은 번호는 재업로드가 거부된다.

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

## TestFlight 배포 (S12) — 계획

> 목표: 사용자가 링크 하나로 테스터를 초대할 수 있는 상태. 아래 수치와 규칙은 전부 Apple 문서를
> 읽어 옮긴 것이고, 출처를 각 항목에 달았다. 기억으로 적은 값은 없다.

### 먼저 알아야 할 것 — "링크" 는 심사를 거친다

TestFlight 에는 두 종류의 테스트가 있고, **원하는 것은 외부 테스트**다.

| | 내부 테스트 | 외부 테스트 |
|---|---|---|
| 대상 | 앱에 접근 권한이 있는 **App Store Connect 사용자 최대 100명** | App Store Connect 사용자가 아닌 사람, **앱당 최대 10,000명** |
| 초대 방법 | 계정 지정 | 이메일 또는 **공개 링크** |
| 심사 | 없음 | **첫 빌드는 App Review 로 보내진다** |
| 공개 링크 | 없음 | "누구나" 또는 "조건 필터", 인원 상한 1~10,000 설정 가능 |

- 외부 그룹을 만들려면 **내부 그룹이 먼저 있어야 한다.**
- 심사는 **첫 빌드만** 전체 심사를 받고 이후 빌드는 전체 심사가 아닐 수 있다. 승인돼야 테스트가 시작된다.
- 빌드는 업로드 후 **90일** 동안만 테스트할 수 있고, 그 뒤에는 테스터가 쓸 수 없다.
- TestFlight 대상 빌드는 **프로비저닝 프로파일에 application identifier 가 들어 있어야 한다** —
  지금 쓰는 ad-hoc 서명으로는 안 된다.

출처: [TestFlight Overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/) ·
[Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers/)

> **Beta App Review 소요 기간은 Apple 이 공표하지 않는다.** 며칠이라고 적을 근거가 없어 적지 않는다.
> 일정을 세울 때 "승인 대기" 를 길이가 정해지지 않은 구간으로 두고, 그 앞의 (B) 를 최대한 당기는 것이
> 유일하게 통제 가능한 부분이다.

### 내부 테스트만 하는 최소 경로 — 심사 없이 오늘 시작할 수 있는 것

외부 테스트(공개 링크)는 첫 빌드가 App Review 를 거치지만, **내부 테스트는 그 심사가 없다.**
Apple 문서는 심사를 외부 테스터에 결부해 서술한다: "**If you invite external testers**, your beta
build may require review."
([TestFlight Overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/))

내부 테스터는 **앱에 접근 권한이 있는 App Store Connect 사용자 최대 100명**이다. 즉 테스터 각자가
계정을 가져야 하고, 아무에게나 링크로 뿌릴 수는 없다 — 그건 외부 테스트다.
([Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/))

| 항목 | 내부 테스트 | 근거 |
|---|---|---|
| Beta App Review | **불필요** | 심사는 외부 테스터 초대에 결부돼 서술된다 |
| 테스터 상한 | 100명 (App Store Connect 사용자) | Add internal testers |
| 테스터 조건 | 각자 App Store Connect 계정 + 앱 접근 권한 필요 | 같은 문서 |
| **앱 레코드** | **필요** | 빌드 업로드 전에 앱 레코드를 먼저 만들어야 한다 ([Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)) |
| **Business 계약 동의** | **필요** | "You can't add an app to your account until the Account Holder signs the latest agreement in the Business section." — 앱 레코드 생성 자체가 막힌다 |
| **수출규정(암호화)** | **필요** | 암호화를 쓰는 앱은 업로드·테스트·배포 전에 판단이 필요하다. 베타 빌드에도 붙인다 ([Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/)) |
| 개인정보처리방침 URL | **확인하지 못함** | 심사 지침 5.1.1(i) 은 "App Store Connect metadata field" 에 링크를 요구하지만, **내부 TestFlight 를 막는다는 서술은 문서에서 찾지 못했다.** 추측으로 "필요 없다" 고 쓰지 않는다 — App Store 제출에는 확실히 필요하므로 어차피 준비하는 편이 낫다 |
| 세금·은행 정보 | **확인하지 못함** | 무료 앱 내부 테스트에 필요한지 명시한 문서를 찾지 못했다. Business 계약과는 별개 항목이다 |

**정리 — 사용자가 오늘 시작할 것 (내부 테스트 기준)**

1. Account Holder 가 App Store Connect > Business 에서 **최신 계약 동의** ← 이게 없으면 2번이 막힌다
2. **앱 레코드 생성** — 번들 ID `kr.co.teameet.alpha`
3. Xcode 에 Apple 계정 로그인 (프로파일 자동 발급용)
4. 테스터로 쓸 사람을 **App Store Connect 사용자로 초대**하고 앱 접근 권한 부여
5. 업로드 후 내부 그룹 생성 → 빌드 추가 → 테스터 추가

#### 수출규정(암호화) — 조사 결과

> **2026-08-31 확정 — 이제 빌드가 스스로 답한다.** `ITSAppUsesNonExemptEncryption: false` 를
> `project.yml` 의 `info:` 에 넣었으므로 업로드마다 다시 답할 필요가 없다. 넣기 전에는 올린
> 빌드의 `usesNonExemptEncryption` 이 계속 null 이었고, 그 상태의 빌드는 **TestFlight 그룹에
> 아예 붙지 않는다** — Apple 이 돌려주는 말은 `Build is not in an internally testable state`
> 로, 암호화를 언급하지 않아 서명 쪽을 뒤지게 만든다(빌드 1·3 에서 실측).
> 값은 사용자가 확인한 법적 신고다(2026-08-31): 이 앱의 암호화는 OS 가 제공하는 HTTPS 뿐이고
> 직접 구현한 것도 번들된 암호 라이브러리도 없다.

Apple 의 분류표는 세 갈래다
([Export compliance documentation for encryption](https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation-for-encryption/)):

| 앱이 쓰는 암호화 | 필요한 서류 |
|---|---|
| **Apple 운영체제 안의 암호화로 한정** | **없음** |
| OS 밖의 산업 표준 알고리즘 | 프랑스 배포 시 French encryption declaration |
| 국제 표준 기구가 인정하지 않은 독자 알고리즘 | CCATS + French declaration |

이 앱이 첫 번째 칸에 해당하는지 저장소에서 직접 확인했다:

| 확인 항목 | 결과 |
|---|---|
| SPM 패키지 | **0개** (`project.yml` 에 `packages:` 자체가 없다) |
| 빌드된 `.app` 의 내장 프레임워크 | **없음** |
| CryptoKit / CommonCrypto / 직접 구현한 AES·RSA | **없음** |
| 암호화 관련 import | `import Security` 하나 — Keychain, OS 제공 |
| 네트워크 암호화 | `WKWebView` 와 `URLSession` 의 HTTPS/TLS, 즉 OS 제공 |

APNs 프로바이더 토큰의 ES256 서명은 **서버(Node)** 에서 한다 — iOS 앱 바이너리에는 없다.

**따라서 사실관계는 "OS 안의 암호화로 한정" 에 해당한다.** 다만 이 답변은 사용자가 하는 **법적
선언**이므로 저장소가 값을 대신 넣지 않는다. 사용자가 위 사실관계를 확인하면 `project.yml` 의
`info.properties` 에 한 줄을 넣어 매 업로드마다 묻지 않게 할 수 있다:

```yaml
        ITSAppUsesNonExemptEncryption: false
```

넣지 않으면 업로드할 때마다 App Store Connect 에서 같은 질문에 답하게 된다 — 틀린 것은 아니고
번거로울 뿐이다.

### 준비된 것 — 지금 저장소에 있다

| 산출물 | 상태 |
|---|---|
| `apps/v1_ios/ExportOptions.plist` | `method: app-store-connect`, teamID, **수동 서명**, 심볼 업로드 |
| `scripts/ios/asc-profile.mjs` | App Store 프로파일을 ASC API 로 생성·설치 (기기 등록 불필요) |
| `scripts/ios/archive-and-export.sh` | archive → export → (`--upload` 일 때만) 업로드 |
| 빌드 번호 강제 | `version.properties` 가 원천. 같은 버전·빌드 번호로 두 번 업로드하면 스크립트가 먼저 막는다 |
| `DEVELOPMENT_TEAM` | project.yml 에 설정 |

### 자동 서명은 이 프로젝트에서 동작하지 않는다 (2026-08-31 실측)

이 문서의 이전 판은 "`-allowProvisioningUpdates` 를 붙여 뒀으므로 계정이 준비되면 Xcode 가
프로파일을 스스로 만든다" 고 적고 있었다. **틀렸다.** 실제로는 이렇게 멈춘다:

```
error: Communication with Apple failed: Your team has no devices from which to generate
a provisioning profile.
error: No profiles for 'kr.co.teameet.alpha' were found: Xcode couldn't find any iOS App
Development provisioning profiles matching 'kr.co.teameet.alpha'.
** ARCHIVE FAILED **
```

**Xcode 의 archive 액션은 언제나 *개발용* 프로파일을 요구하고**, Apple 은 등록된 기기가 없는
팀에 그것을 발급하지 않는다. 이 프로젝트에는 아이폰이 없고 TestFlight 는 애초에 기기가 필요
없으므로, 이 조건은 영원히 충족되지 않는다.

**해법은 기기 등록이 아니다.** 배포 프로파일에는 기기 목록이 없다 — 그래서 배포 프로파일을
직접 만들어 이름으로 지정하면 개발용 프로파일 단계를 통째로 건너뛴다.

```bash
# 한 번만. 인증서는 Xcode → Settings → Accounts → Manage Certificates → + → Apple Distribution
export ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_FILE=/path/outside/the/repo/AuthKey_XXXX.p8
node scripts/ios/asc-profile.mjs create "Teameet Alpha App Store" kr.co.teameet.alpha
```

그 다음부터는 `archive-and-export.sh` 가 그 프로파일을 이름으로 지정해 수동 서명한다.
archive 와 export 는 **같은 방식으로 서명해야 한다** — export 만 자동으로 두면 Xcode 가
관리형 프로파일을 새로 발급하고, 관리형 프로파일은 수동 서명 빌드가 이름으로 지정할 수 없다.

> **서명 실패를 서명을 끄는 것으로 "해결" 하지 마라.** 서명 없이 만든 archive 는 완벽하게
> 유효하고 완벽하게 서명된 .ipa 로 export 되는데, 그 앱에는 엔타이틀먼트가 하나도 없다.
> 아무것도 실패하지 않고, 설치되고, 열리고, 푸시만 영원히 오지 않는다. 실제로 한 번 그렇게
> 만들었다 — 그래서 스크립트에 게이트가 있다.

업로드는 `--upload` 플래그가 있을 때만 실행된다. **업로드는 되돌릴 수 없다** — 잘못 올린 빌드는
삭제가 아니라 만료 처리만 된다.

### 세 갈래와 병목

**(A) 지금 바로 할 수 있는 것 — 우리**

1. Release 아카이브 구성: `TeameetAlpha` 스킴의 `archive` 액션은 이미 `Alpha Release` 를 가리킨다.
2. `ExportOptions.plist` — `method: app-store-connect`, 팀 ID, 업로드 심볼 여부.
3. 버전·빌드 번호 체계: `apps/v1_ios/version.properties` 가 원천이다. TestFlight 는 **같은 버전에
   같은 빌드 번호를 두 번 받지 않는다** → 업로드마다 `versionCode` 증가가 필요하고, 그 규칙을
   스크립트로 강제한다.
4. 업로드 스크립트 뼈대(`xcodebuild archive` → `-exportArchive` → `xcrun altool`/`notarytool` 계열).
5. 이 문서 — 절차·실패 모드.

**(B) 사용자만 할 수 있는 것 — 여기가 시작점이다**

이것이 없으면 (A) 를 아무리 준비해도 업로드 자체가 불가능하다. 순서대로:

- [ ] App Store Connect 에서 **앱 레코드 생성** (번들 ID `kr.co.teameet.alpha`)
- [ ] 유료·무료 앱 **계약 동의**, 세금·은행 정보 (없으면 앱 레코드가 "준비 중" 에서 멈춘다)
- [ ] **개인정보처리방침 URL** — 필수 입력값이다
- [ ] **수출규정(암호화) 답변** — HTTPS 만 쓰는 앱도 답해야 한다
- [ ] **배포 인증서 + App Store 프로비저닝 프로파일** 발급 승인
- [ ] 내부 그룹 생성 → 외부 그룹 생성 → 공개 링크 발행 → 테스터 초대

**(C) Apple 이 시간을 쓰는 것**

- 첫 외부 빌드의 **Beta App Review**. 기간 미공표.

```
(B) 앱 레코드·계약·정책 URL·인증서   ──┐
(A) archive·업로드 스크립트·문서      ──┴─→ 업로드 → (C) Beta App Review → 공개 링크
```

**병목은 (B)** 다. (A) 는 (B) 와 무관하게 지금 끝낼 수 있고, (C) 는 (B) 가 끝나야 시작조차 안 된다.

### 심사지침 4.2 — 실재하는 위험

> "Your app should include features, content, and UI that elevate it beyond a repackaged website.
> If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."
> — [App Review Guidelines 4.2](https://developer.apple.com/app-store/review/guidelines/)

4.2.2 는 "web clippings" 를 명시적으로 든다. **이 앱은 구조상 WebView 래퍼가 맞다.** 숨길 것이
아니라, 네이티브로만 되는 것이 실제로 얼마나 있는지로 답해야 한다. 현재 가진 방어 재료:

| 재료 | 웹만으로는 안 되는 이유 |
|---|---|
| **APNs 네이티브 푸시** | 앱을 닫아도 알림이 온다. iOS 웹에는 이 경로가 없다 |
| **알림 탭 → 딥링크 착지** | 알림이 해당 화면으로 직접 연다 |
| **오프라인·실패 화면** | 네트워크가 없을 때 브라우저 오류 대신 앱 화면과 재시도 |
| **안전영역 처리** | 셸이 기기 인셋을 페이지에 주입한다. 웹만으로는 0 이다 |
| **유니버설 링크** | 로그인 리다이렉트가 앱 안에서 끝난다 (Team ID 확보 후) |
| **세션 지속** | 앱 재실행 시 브라우징 세션 복원 |

Beta App Review 가 정식 심사보다 가볍다고 알려져 있어도 **이 조항은 적용된다.** 리젝되면 위 목록을
심사 노트에 적어 재제출하는 것이 첫 대응이다.

### CI 자동화 — 하지 않는 쪽을 권한다

`.github/workflows/ios-alpha.yml` 은 서명 없는 시뮬레이터 빌드만 한다. archive·업로드를 CI 에
넣으려면 **배포 인증서(.p12)와 프로파일, App Store Connect API 키**를 secrets 에 넣어야 한다.

GitHub Actions secrets 는 public 저장소에서도 값이 노출되지 않고 fork PR 에는 전달되지 않는다.
그럼에도 처음에는 **로컬 archive + 수동 업로드**를 권한다:

- 업로드는 되돌릴 수 없다. 잘못 올린 빌드는 삭제가 아니라 만료 처리만 된다
- 첫 배포는 (B) 의 값들이 맞물리는지 확인하는 과정이라 사람이 보고 있어야 한다
- 자동화의 이득은 반복이 잦아진 뒤에 생긴다

반복이 잦아지면 그때 CI 로 옮기고, 그 시점에 `pull_request` 트리거에서는 업로드 잡이 돌지 않도록
막는다.

### 아직 못 정한 것

- production 번들(`kr.co.teameet`)도 앱 레코드를 만들지 여부. 알파만 먼저 올리는 편이 단순하다
- 스크린샷·설명 등 App Store 메타데이터는 TestFlight 만 쓸 거면 최소한만 있으면 된다
