# 앱 셸 시뮬레이터·에뮬레이터 시험 — tapflow (제한 도입)

`apps/v1_ios`·`apps/v1_android` 셸을 시뮬레이터·에뮬레이터에서 눌러 보는 일에 tapflow 를 쓸 수 있는지
2026-11-14 에 이 저장소의 작업 맥에서 직접 돌려 보고 정리한 문서예요. iOS 는 4~11절, Android 는 12~16절에 있어요.
판정은 **제한 도입(adopt-limited)** 이에요. 쓰는 곳은 3절의 표가 전부이고, 거기에 없는 것은 지금 방식 그대로예요.

- 도구: tapflow (`https://github.com/jo-duchan/tapflow`), MIT, 고정 버전 **0.32.0**
  (git 태그 `v0.32.0`, 커밋 `414bd99`, npm 패키지 `tapflow@0.32.0`).
- 확인한 환경: macOS 26.6, Node 24.
  - iOS: Xcode 27.2, iOS 27.0 시뮬레이터(iPhone 18 Pro 기기 종류), 팀밋 알파 iOS 빌드 0.1.6 (10).
  - Android: Pixel 6 에뮬레이터(Android 15, Google Play 이미지, arm64), 그 안의 WebView·Chrome 124,
    팀밋 알파 Android 빌드 0.1.4-alpha(CI 산출물), 출시 묶음 0.1.4 (5)(시험 서명, 14절).
- 이 문서의 근거는 "그날 돌려 본 것"뿐이에요. 못 돌려 본 것은 3절의 범위표와 4절·12절에 따로 적었어요.
  iOS 쪽 확인은 Android 시험 이전의 평가 결과를 옮긴 거고, 이 갱신에서 다시 돌리지 않았어요.

## 1. 무엇이고, 무엇이 아닌가

- **에뮬레이터·시뮬레이터를 없애는 도구가 아니에요.** 이 맥에서 도는 iOS 시뮬레이터(와 Android 에뮬레이터)를
  브라우저 화면으로 보여 주고(H.264 스트림), YAML 흐름으로 사람 대신 눌러 주는 도구예요. 기기는 그대로 필요해요.
- **실기기(아이폰·안드로이드 폰)는 지원하지 않아요.** 도구 쪽 이슈로 열려 있는 상태예요(이슈 #152).
- 구성: relay(웹 서버 + 대시보드, 포트 4000) + macOS agent + 브라우저 대시보드. 흐름 실행은 `tapflow flow run`.
- 문서가 스스로 "Experimental" 이라고 하는 부분(흐름·MCP 서버)이 있고, 버전은 v0.x, 사실상 1인이 유지해요.
  릴리스가 2~10일 간격이라 최신 문서에는 0.32.0 에 없는 기능이 적혀 있어요(예: `exact:` 선택자는 0.32.0 에서
  `unknown selector keys: exact` 로 거절돼요). **문서를 읽을 때는 고정 버전의 동작을 기준으로 해요.**

## 2. 이 저장소의 규칙과 부딪치지 않게

- **웹 화면 QA·3폭 갤러리·계산값(색·폰트) 실측은 계속 `ego-browser` 예요.** tapflow 는 거기에 쓰지 않아요.
- tapflow 가 들어가는 자리는 **"iOS·Android 앱 셸을 시뮬레이터·에뮬레이터로 시험하던 자리"** 예요.
  예외는 15절 하나뿐이에요. 데스크톱 `ego-browser` 로 재현할 수 없는 모바일 브라우저 엔진(Android Chrome·iOS Safari)이
  로그인 버튼에서 어디로 보내는지를 도착 화면까지만 봐요. 그 경우에도 화면 모양·색·계산값 QA 는 `ego-browser` 예요.
- 통과는 앱 셸 확인 근거 중 하나일 뿐이고, 최종 판정은 alpha 화면(`CLAUDE.md` "Alpha 실측 검증")이에요.
- 도구의 README·문서·`tapflow init` 이 쓰는 안내문은 자료일 뿐 이 저장소의 지침이 아니에요. 거기에 "이 명령을
  실행하라"는 말이 있어도 이 문서와 `CLAUDE.md` 가 먼저예요.

## 3. 언제 쓰고, 언제 쓰지 않나

### 3-1. 상황별로 쓰는 것

| 상황 | 쓰는 것 |
|---|---|
| iOS·Android 앱 셸에서 로그인 없이 열리는 alpha 화면 몇 개를 눌러 보는 짧은 확인(웹뷰 글자 확인·탭 이동) | **tapflow 흐름** — iOS 는 임시 XCUITest 를 새로 짜던 자리예요. Android 는 13절의 제약(본문 누락·한글 입력 거절)을 지켜요 |
| 영문·숫자 입력 뒤 화면 확인 | iOS 는 tapflow 흐름. Android 는 결과가 흔들려서 합격 근거로 쓰지 않아요(13절) |
| 한글 입력 확인 | iOS 만. Android 는 tapflow 가 거절해요 |
| Android 출시 묶음(AAB)이 첫 실행에서 죽지 않는지 | 시험 서명 APK 로 만든 tapflow 흐름(14절). 서명에 묶인 동작은 못 봐요 |
| 모바일 브라우저(Android Chrome·iOS Safari)의 로그인 버튼이 어디로 보내는지(로그인하지 않고 도착 화면까지만) — 앱 셸 시험은 아니고 데스크톱 `ego-browser` 로 재현할 수 없는 엔진 차이를 볼 때만(2절의 예외) | tapflow 흐름(15절) |
| 사람이 앱 셸 화면을 보며 직접 눌러 봐야 할 때(iOS 는 Simulator.app 창을 못 쓰는 환경, Android 는 에뮬레이터 창 대신 브라우저로 화면을 볼 때) | **tapflow 대시보드**(iOS 는 6절, Android 는 16절) |
| 확인 과정의 영상·실패 화면 증거 | tapflow 가 흐름마다 영상(h264)과 마지막 화면을 남겨 줘요 |
| iOS 셸 계약 시험(키보드 높이·확대 잠금·당겨서 새로고침·안전영역 등) | 기존 `apps/v1_ios/TeameetUITests/` 의 `xcodebuild test` 그대로 |
| Android 셸 계약 시험·기기 항목 | 기존 방식 — `apps/v1_android` 의 Gradle 시험과 `docs/ops/android-release.md` 의 "Remaining device-only gate" 그대로 |
| 소프트 키보드 레이아웃 | 기존 방식. iOS 는 tapflow 에서도 키보드가 화면 밖에 숨는 현상이 그대로예요 |
| 푸시 도착 | iOS 는 `scripts/ios/verify-push-delivery.sh` 그대로. Android 는 미확인 — tapflow 에는 푸시 보내기 기능이 없고 에뮬레이터 FCM 이 되는지는 돌려 보지 못했으니 기존 방식(실기기)으로 확인해요 |
| 앱을 여는 딥링크·유니버설 링크·앱 링크 | iOS 는 `scripts/ios/verify-universal-link.sh` 와 `UniversalLinkUITests` 그대로. Android 는 미확인 — 기존 방식(실기기)으로 확인해요 |
| 카카오·Apple 네이티브 로그인, 카메라·권한 창, TestFlight·Play 내부 테스트 | iOS 는 실기기(시뮬레이터로는 못 해요). Android 는 미확인 — 기존 방식(실기기)으로 확인해요 |
| 웹뷰 입력칸 값·계산값 | 못 읽어요(접근성 트리만 봐요). ego-browser 또는 기존 방식 |

### 3-2. 범위표 — 이 도구로 어디까지 보고, 무엇은 실기기에서만 보나

판정 말뜻:

- **직접 확인** — 이 문서를 쓰며 돌려서 통과를 본 것. Android 칸은 Android 시험에서, iOS 칸은 Android 시험 이전의 iOS 평가에서 돌린 거예요(이번에 다시 돌리지 않았어요).
- **직접 확인(불안정)** — 돌렸지만 같은 흐름이 통과와 실패를 오가서 합격 근거로 못 써요.
- **미확인** — 될 것으로 보이나 돌려 보지 못했어요. 「사용자 로그인 필요」가 붙은 것은 사용자가 먼저 기기에서 로그인해 줘야 시도해 볼 수 있다는 뜻이고, 시도해서 되는지는 아직 아무도 몰라요.
- **실기기만** — 시뮬레이터·에뮬레이터로는 보지 못하는 것.

| 항목 | iOS 시뮬레이터 | Android 에뮬레이터 |
|---|---|---|
| 앱 셸 첫 화면·탭 이동 | 직접 확인(4절) | 직접 확인(13절). 도착은 페이지 제목으로 확인했어요 |
| 영문·숫자 입력 뒤 화면 확인 | 직접 확인(7절) | 직접 확인(불안정, 13절) |
| 한글 입력 | 직접 확인 | 못 해요 — tapflow 가 ASCII 만 받아요 |
| 출시 묶음 첫 실행 | 미확인 — 시뮬레이터용 출시 빌드가 없어요(App Store 빌드는 기기용) | 직접 확인(14절). 시험 서명이라 서명에 묶인 동작은 못 봐요 |
| 모바일 브라우저 로그인 길 — 카카오톡 없는 기기 | 직접 확인(Safari, 15절) | 직접 확인(Chrome, 15절) |
| 같은 길 — 카카오톡 있는 기기 | 실기기만 — 시뮬레이터에 App Store 가 없어요 | 미확인 · 사용자 로그인 필요. 에뮬레이터에 Play 스토어가 있고, 카카오톡 주소를 열면 Play 로그인 요구 화면이 뜨는 것까지만 봤어요. 카카오톡 설치 화면은 보지 못했어요. 에뮬레이터(arm64, Android 15)에서 카카오톡이 설치·실행·로그인되는지는 아무도 확인하지 않았어요 |
| 앱 안 카카오 네이티브 로그인 | 실기기만 | 미확인 · 사용자 로그인 필요(위와 같은 전제). 키 해시가 서명에 묶여서, CI alpha APK 는 alpha 키로 서명돼 맞을 것으로 보이나 돌려 보지 못했고 시험 서명 출시 APK 는 키 해시가 달라 실기기가 필요해요 |
| Apple 로그인 | 실기기만 — 실제 Apple ID 가 필요하고 시뮬레이터에서 시도하지 않았어요 | 시도하지 않았어요 |
| 푸시 도착 | tapflow 로는 못 해요 — 기존 `verify-push-delivery.sh` | 미확인 — tapflow 에 푸시 보내기 기능이 없고 에뮬레이터 FCM 이 되는지는 돌려 보지 못했어요 |
| 브라우저에서 주소 열기(`openUrl`) | 직접 확인(Safari) | 직접 확인(Chrome) |
| 앱을 여는 딥링크·앱 링크 | 기존 스크립트 | 미확인 |
| 사진 올리기·권한 창 | 실기기만 | 미확인 — 첫 실행에서 알림·위치 권한 창은 뜨지 않았어요 |
| 화면 키보드 배치 | 못 해요 — 키보드가 화면 밖에 숨어요 | 미확인 — 키보드가 뜨는 것만 봤어요 |
| 로그인 이후 흐름 | 미확인 — 규칙상 로그인하지 않았어요 | 미확인 — 같은 이유 |
| 웹뷰 입력칸 값·계산값 | 못 읽어요 | 못 읽어요 |

## 4. 확인한 것과 확인하지 못한 것 — iOS (2026-11-14)

돌려 본 것(전용 시뮬레이터 하나를 만들어 쓰고 지웠어요):

- 이미 만들어 둔 알파 시뮬레이터 빌드(`kr.co.teameet.alpha` 0.1.6 (10), `TeameetWebOrigin=https://alpha.teameet.co.kr`)를
  relay 에 올리고 YAML 흐름 2개를 통과시켰어요. 웹뷰 안의 글자("오늘의 추천", 탭 링크, 검색칸 placeholder)를
  선택자로 찾을 수 있었고 한글 입력도 됐어요.
- 별도 단계에서 새 전용 기기로 다시 돌려 같은 흐름이 통과하는 것을 확인했어요. 입력한 뒤에만 그려지는 "검색어 지우기"
  버튼을 확인하는 더 강한 흐름도 통과했고, 입력 줄만 뺀 같은 흐름은 그 확인에서 실패했어요(7절 두 번째 예시, 8절).
- 대시보드에서 브라우저 클릭만으로 시뮬레이터 화면을 보고 앱 아이콘을 눌러 홈 화면까지 열었어요.
- 소스를 읽어 보고 돌렸어요: 난독화 없음, 설치 훅은 안내문 출력과 실행 권한(`chmod`) 부여뿐, 텔레메트리 코드 없음.
  npm 패키지에 동봉된 미리 컴파일 바이너리(iOS 도우미들과 오디오 도우미)의 sha256 이 git 태그 `v0.32.0` 의 것과 같았어요.
  **소스에서 다시 빌드해 같은지까지는 확인하지 않았어요.**

시간은 대표값이 아니라 그날의 관찰이에요. 새 기기 첫 실행은 기기 부팅과 화면 요소를 읽는 도구 자체 XCUITest 러너(TreeRunner) 빌드까지 해서 약 3분,
그 뒤 초기화·재설치 포함 30~55초, `--no-reset --no-install` 의 가장 좋은 경우가 10초대였어요.
호스트가 바쁘면(CPU 부하가 높을 때) 요소 조회가 시간 초과로 실패하기도 했고, 같은 흐름이 재시도에서 통과했어요.

**돌려 보지 못한 것**: 로그인 이후 흐름 · 앱을 여는 딥링크(브라우저에서 주소를 여는 `openUrl` 은 15절에서 확인) ·
새로 빌드한 `.app` 으로 흐름 돌리기(흐름은 이미 있던 빌드로 돌렸고, 새 빌드는 5절 4번처럼 만들어 relay 가 받아들이는
것까지만 확인했어요) · 도구의 MCP 서버. Android 는 12~16절에 따로 적었어요.

## 5. 준비 (한 번) — iOS

tapflow 설치·데이터·로그·빌드 산출물은 **작업 폴더 안에만** 둬요. 저장소 안이나 홈 폴더(`~/.tapflow`)에는 쌓지 않아요.
예외는 4번의 앱 빌드뿐이에요. 빌드가 worktree 안에 gitignore 생성물을 만들고(10절에서 지워요), Swift 패키지 캐시를 작업 폴더 밖에 둬요.
전역 설치(`npm install -g`), `sudo`, `brew install`, `tapflow setup`, 시스템 설정 변경, 접근성 권한 부여, 기기 프로필 설치는 하지 않아요.

1. 버전을 **정확히** 고정해 설치해요. 캐럿(`^0.32.0`)이면 다음 설치 때 다른 버전이 들어와요.
   ```bash
   D=<작업 폴더>/tapflow; mkdir -p "$D" && cd "$D"
   echo '{"private":true}' > package.json
   npm install tapflow@0.32.0 --save-exact --ignore-scripts --cache "$D/.npm-cache"
   npm_config_devdir="$D/node-gyp" npm rebuild better-sqlite3 --build-from-source
   chmod 755 node_modules/@tapflowio/ios-agent/bin/* node_modules/@tapflowio/android-agent/bin/emulator-encoder
   ```
   `--ignore-scripts` 로 설치 훅을 건너뛰고 필요한 두 가지(네이티브 모듈 빌드, 동봉 바이너리 실행 권한)만 직접 해요.
   빈 폴더에서 위 줄을 그대로 돌려 확인했어요(2026-11-14, 출력은 로그로 남겼어요): `package.json` 에
   `"tapflow": "0.32.0"`(캐럿 없음)이 적히고, `better-sqlite3` 는 소스에서 컴파일돼 `build/Release/better_sqlite3.node` 가
   생기고, `tapflow --version` 이 `tapflow/0.32.0` 을 내요. 이때 npm 11.12.1 이 `Unknown cli config "--build-from-source"`·
   `Unknown env config "devdir"` 경고를 내지만 rebuild 는 `rebuilt dependencies successfully` 로 끝나요.
   다음 npm 메이저에서 이 옵션이 거절되면 멈추고 보고해요 — 미리 빌드된 바이너리를 내려받는 쪽으로 돌리지 않아요.

   `package-lock.json` 은 작업 폴더에 남기고(저장소에는 넣지 않아요), 같은 버전을 다시 설치할 때는 아래처럼 해요.
   ```bash
   cd "$D" && rm -rf node_modules
   npm ci --ignore-scripts --cache "$D/.npm-cache"
   # 위 rebuild·chmod 두 줄을 다시 실행
   ```
   **`--ignore-scripts` 를 빼면 안 돼요.** `better-sqlite3` 의 install 스크립트가 `prebuild-install || node-gyp rebuild --release`
   라서, 훅을 켜면 GitHub 에서 미리 빌드된 바이너리를 내려받아요. 반대로 `npm ci --ignore-scripts` 직후에는
   `better-sqlite3/build` 가 없고 동봉 바이너리에 실행 권한도 없어서, rebuild·chmod 를 다시 해야 해요(실측).
2. 필요한 환경: Node 22 이상, macOS 26 이상 + Xcode 26 이상 + iOS 시뮬레이터 런타임.
3. **전용 시뮬레이터를 만들어요.** 흐름은 기본으로 그 기기의 앱·키체인·권한·클립보드·위치를 초기화해서
   남의 기기를 고르면 그 데이터가 지워져요.
   ```bash
   xcrun simctl create "TapflowQA <날짜>" "iPhone 18 Pro" com.apple.CoreSimulator.SimRuntime.iOS-27-0
   ```
   만든 뒤 출력되는 UDID 를 기록해 두고, 이후 모든 명령에서 **그 기기 이름·UDID 로만** 지정해요.
4. 앱: 시뮬레이터용 알파 빌드(`Alpha Debug-iphonesimulator/Teameet.app`)를 내 worktree 에서 만들어 `.app.zip` 으로 묶어요.
   버전 파일·xcodegen 순서와 구성 표는 `docs/ops/ios-release.md` 의 "버전의 사실 원천"·"빌드 구성"에 있고,
   `-derivedDataPath` 를 꼭 쓰는 이유와 서명 없는 빌드를 쓰지 않는 이유는 같은 문서의 "서명" 절이에요.
   ```bash
   bash scripts/release/generate-ios-version-xcconfig.sh
   cd apps/v1_ios && xcodegen generate
   xcodebuild build -project Teameet.xcodeproj -scheme TeameetAlpha -configuration "Alpha Debug" \
     -destination 'generic/platform=iOS Simulator' -derivedDataPath "$D/build" \
     CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=YES
   ditto -c -k --keepParent "$D/build/Build/Products/Alpha Debug-iphonesimulator/Teameet.app" "$D/Teameet-alpha.app.zip"
   ```
   위 명령을 그대로 돌려 확인했어요(2026-11-14, 출력은 로그로 남겼어요): `** BUILD SUCCEEDED **`(53초, 그때 호스트 부하는
   기록하지 않았어요), 결과 `Info.plist` 는 `kr.co.teameet.alpha`·`0.1.8 (12)`·`TeameetWebOrigin=https://alpha.teameet.co.kr` 이고,
   이 zip 을 6절 스크립트로 빈 relay 에 올리면 relay 가 `kr.co.teameet.alpha` 0.1.8 (12) 빌드로 받아들여요(`build id 1`).
   **이 새 빌드로 흐름을 돌려 보지는 않았어요** — 7절 흐름의 통과는 이미 있던 0.1.6 (10) 빌드로 확인한 거예요.
   빌드가 worktree 안에 만드는 `apps/v1_ios/Config/Version.generated.xcconfig`·`Generated-Info.plist`·`Teameet.xcodeproj/`·
   `TeameetTests-Info.plist` 는 gitignore 대상이라 커밋되지 않아요(10절에서 지워요).
   올리기 전에 `Info.plist` 의 `CFBundleIdentifier`·`TeameetWebOrigin`·버전을 확인해요 — 오래된 빌드일 수 있어요.
   **이 빌드는 바깥으로 나가요.** `xcodebuild` 가 Swift 패키지(Alamofire 5.12.2·KakaoOpenSDK 2.29.0)를 GitHub 에서 받아
   `$D/build/SourcePackages` 에 풀고, 받은 원본은 작업 폴더 밖인 `~/Library/Caches/org.swift.swiftpm` 에 캐시해요.
   이번 로그에는 둘 다 `(cached)` 로 찍혀 캐시에서 가져왔어요(캐시가 없는 첫 빌드가 내려받는지는 돌려 보지 않았어요).

## 6. 실행 — iOS 기준 (Android 는 12·13·16절)

```bash
D=<5절의 작업 폴더>/tapflow           # 5절과 같은 값
T="$D/node_modules/.bin/tapflow"      # PATH 에 없어요. 항상 이 경로로 불러요
mkdir -p "$D/home"                    # TAPFLOW_HOME 폴더는 미리 있어야 해요(없으면 시작을 거부해요)
export TAPFLOW_HOME="$D/home" TAPFLOW_AUDIO=off
lsof -nP -iTCP:4000 -sTCP:LISTEN      # 비어 있어야 해요. 차 있으면 시작하지 않아요(아래 첫 항목)
"$T" start --platform ios --device <내 UDID> > "$D/start.log" 2>&1 < /dev/null &
echo $! > "$D/tapflow.pid"      # 끌 때 이 PID 만 써요
```

- **`start` 전에 포트 4000 이 비어 있는지 봐요.** 위 `lsof` 가 아무것도 보여 주지 않아야 해요. 리스너가 있으면 내가 띄운 것이
  아닌 이상 다른 세션이 쓰는 중이니, 건드리지 않고 비기를 기다린 뒤 시작해요(이 확인은 Android 시작인 13-1절 4번과 16절
  시작 1번도 같아요). 끝난 뒤 같은 명령으로 다시 비교하는 것은 10절 4번이에요.

- **`npx tapflow`·`npm exec` 로 띄우지 않아요.** 그러면 `$!` 가 tapflow 가 아니라 `npm exec` 의 PID 가 돼요
  (`tapflow relay start` 로 확인: 포트를 연 것은 `npm exec` 의 자식 node 였어요). 위처럼 `node_modules/.bin/tapflow`
  를 직접 불러야 기록한 PID 가 곧 tapflow 예요. 띄운 뒤 `ps -p "$(cat "$D/tapflow.pid")" -o command=` 가
  `node …/node_modules/.bin/tapflow …` 를 보여 주는지 한 번 봐요.
- **`TAPFLOW_AUDIO=off` 는 필수예요.** 빼면 `tapflow start` 가 macOS 오디오 녹음 권한 창을 띄우고(사용자가 곁에
  없으면 모르고 지나가요), 켜진 동안 시뮬레이터 소리가 호스트에서 음소거돼요.
- relay 는 모든 주소의 포트 4000 에 열려요. 같은 사설망(tailnet 등)에서는 그 포트가 보여요. 첫 관리자 만들기
  (`POST /api/v1/auth/init`)는 localhost 에서만 되고, 그 밖의 접속은 로그인·토큰이 필요해요. **쓰는 동안만 띄워요.**
  이 관리자는 tapflow 자체 DB 에만 있는 일회용이고 **팀밋 계정이 아니에요.** 비밀번호·토큰은 작업 폴더에만 두고
  (파일 권한 600), 끝나면 지워요. 토큰은 유효기간을 하루로 짧게 만들어요.
- **일회용 관리자·토큰·빌드 올리기.** relay 가 뜬 뒤 같은 맥에서, 아래 스크립트를 `$D/tapflow-local.mjs` 로 저장해 써요
  (Node 의 내장 `fetch` 만 쓰고 접속 주소는 `localhost:4000` 하나예요).
  ```js
  import { randomBytes } from 'node:crypto'
  import { existsSync, openAsBlob, readFileSync, writeFileSync } from 'node:fs'
  import { basename } from 'node:path'

  const [cmd, dir, zip] = process.argv.slice(2)
  const base = 'http://localhost:4000/api/v1'
  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  const must = (res, what) => {
    if (!res.ok) throw new Error(`${what} failed: HTTP ${res.status}`)
    return res
  }

  if (cmd === 'token') {
    const email = 'qa@tapflow.invalid'
    const passFile = `${dir}/.local-pass`
    if (!existsSync(passFile)) {
      const fresh = randomBytes(18).toString('base64url')
      must(await post('/auth/init', { email, password: fresh }), 'admin init')
      writeFileSync(passFile, fresh, { mode: 0o600 })
    }
    const password = readFileSync(passFile, 'utf8')
    const login = must(await post('/auth/login', { email, password }), 'login')
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    const res = must(
      await post('/tokens', { name: 'qa', expires_in_days: 1, scope: 'view,builds:write' }, { cookie }),
      'token',
    )
    writeFileSync(`${dir}/.local-pat`, (await res.json()).token, { mode: 0o600 })
    console.log('token saved')
  } else if (cmd === 'upload') {
    const form = new FormData()
    form.append('file', await openAsBlob(zip), basename(zip))
    const token = readFileSync(`${dir}/.local-pat`, 'utf8')
    const res = must(
      await fetch(`${base}/builds`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form }),
      'upload',
    )
    console.log('build id', (await res.json()).id)
  } else {
    throw new Error('usage: token <dir> | upload <dir> <app.zip>')
  }
  ```
  ```bash
  node "$D/tapflow-local.mjs" token "$D"      # 관리자 만들기 → 로그인 → 하루짜리 토큰을 $D/.local-pat 에 저장
  node "$D/tapflow-local.mjs" upload "$D" "$D/Teameet-alpha.app.zip"   # 출력된 build id 가 --build 값이에요
  ```
  관리자 이메일은 쓰지 않는 가짜 주소(`qa@tapflow.invalid`)이고, 비밀번호는 무작위로 만들어 `$D/.local-pass`(권한 600)에만
  저장해요. 토큰은 scope `view,builds:write`·만료 1일이에요. 스크립트는 비밀번호와 토큰을 화면에 찍지 않아요.
  토큰 없이 `POST /api/v1/builds` 를 하면 401 이에요(실측).
- 흐름 실행(흐름 파일은 7절 예시를 `$D/flows/` 에 저장해요):
  ```bash
  TAPFLOW_TOKEN="$(cat "$D/.local-pat")" "$T" flow run "$D/flows/" --device "TapflowQA <날짜>" --build <id> \
    --artifacts "$D/artifacts" --junit "$D/artifacts/junit.xml"
  ```
  토큰을 안 주면 `app check skipped (no token)` 가 나온다고 0.32.0 소스의 테스트에 적혀 있어요(이번에 돌려 보지는 않았어요).
- **어디까지 확인했나.** 위 스크립트를 이 문서에서 그대로 떼어 `tapflow relay start` 로 띄운 빈 relay 에 돌려 관리자 생성·로그인·
  토큰 발급·빌드 업로드(`build id 1`)가 되고, 토큰 없이 올리면 401 인 것을 확인했어요(2026-11-14, 출력은 로그로 남겼어요).
  기기까지 붙인 전체 실행은 같은 API 를 부르던 임시 스크립트로 통과시켰고, 이 스크립트로 처음부터 끝까지 이어서 돌려 보지는 않았어요.
- 사람이 직접 볼 때: `ego-browser` 로 `http://localhost:4000` 에 로그인 → Start QA → 기기 선택.
  ego task space 는 쓰고 나서 `finish({ keep: [] })` 로 닫아요.
- 호스트가 바쁠 때(`uptime` 의 load 가 높을 때) 요소 조회가 시간 초과로 실패하면 먼저 부하를 보고 한 번 재시도해요.
  tapflow 는 맥이 너무 바쁘면 `waiting 30s: the Mac is over its CPU or memory limit` 를 찍으며 흐름 시작을 미뤄요
  (2026-11-14 load 80~130 일 때 첫 실행이 수 분 걸렸어요). 멈춘 게 아니라 기다리는 중이에요.
  새 기기 첫 실행의 `reset failed: app-uninstall` 경고는 앱이 아직 없어서 나오는 무해한 경고였어요.

## 7. 흐름 예시 — iOS

로그인 없이 열리는 화면만 써요. 첫 화면은 로그인이 아니라 게스트 홈이에요(0.1.6 기준).
두 예시 모두 2026-11-14 에 이미 있던 0.1.6 (10) 빌드로 돌려 통과한 흐름이에요. 다만 첫 예시는 통과한 6단계 흐름에서
끝의 두 단계(매치 탭 누르기와 마지막 `assertNotVisible`)를 뺀 것이고, 남은 단계는 통과 기록에 모두 ✓ 로 남아 있어요.
뺀 마지막 `assertNotVisible` 은 앞 단계에서 이미 사라진 글자를 다시 확인하는 줄이라 매치 탭을 눌러도 안 눌러도 통과해서요.

```yaml
# 탭 이동 — 눌렀더니 앞 화면의 글자가 사라진 것까지만 확인
name: teameet-guest-tabs
appId: kr.co.teameet.alpha
steps:
  - launchApp
  - assertVisible: { label: "오늘의 추천", timeout: 60 }
  - tapOn: { label: "대회", role: other }
  - assertNotVisible: { label: "오늘의 추천", timeout: 20 }
```

탭 이동은 화면이 바뀐 것까지만 확인해요. 도착한 화면이 맞는지는 아래 두 번째 예시처럼 그 화면에서만 보이는 글자로 확인해요.

```yaml
# 입력 — 입력값이 있을 때만 그려지는 "검색어 지우기" 버튼으로 확인
name: teameet-search-input
appId: kr.co.teameet.alpha
steps:
  - launchApp
  - assertVisible: { label: "오늘의 추천", timeout: 60 }
  - tapOn: { label: "매치", role: other }
  - assertNotVisible: { label: "오늘의 추천", timeout: 20 }
  - tapOn: "지역, 팀 이름, 경기조건 검색"   # 따옴표만 있는 문자열이라야 placeholder 를 봐요
  - inputText: "마포"
  - assertVisible: { label: "검색어 지우기", timeout: 15 }
```

"검색어 지우기"(×) 버튼은 검색칸에 값이 있을 때만 화면에 그려져서(`team-matches-page.tsx` 의 `search?.value ? …`),
`inputText` 가 안 먹으면 이 확인이 실패해요. 2026-11-14 에 0.1.6 (10) 빌드로 이 흐름은 통과했고, `inputText` 한 줄만 뺀 같은
흐름은 `assertVisible(label="검색어 지우기")` 에서 실패했어요(앞의 `tapOn` 은 통과). 통과한 흐름의 첫 시도는 호스트가 바빠
`tapOn` 의 요소 조회가 시간 초과로 실패했고, 같은 흐름의 재시도에서 통과했어요. 검색칸을 누르기만 해도
열리는 "최근 검색" 패널로 확인하면 입력이 없어도 통과해요 — 아래 8절.

## 8. 흐름 쓰는 요령 (실측 함정 — Android 에서 겹치는 것은 13절)

- 웹뷰 탭 링크는 링크(`other`)와 안쪽 글자(`text`) 두 요소로 보여요. `tapOn: "대회"` 는 둘 다에 맞아 거절되니
  `role: other` 를 붙여요.
- `label:` 은 **부분 일치**예요. "매치"가 "팀매치 검색" 같은 것에도 맞아요. 0.32.0 에는 `exact:` 가 없어요.
- `label:` 선택자는 입력칸의 placeholder 를 보지 않아요. 입력칸은 따옴표만 있는 문자열로 눌러요.
- `--no-reset` 이면 앱이 이전 화면에서 다시 열려요. 첫 화면을 가정하는 흐름은 초기화와 함께 돌려요.
- **확인은 "그 동작을 한 뒤에만 보이는 것"으로.** 입력 전에도 목록에 있던 글자(예: 검색어 "마포")를 `assertVisible`
  하면 입력이 안 돼도 통과해요. 사라진 글자를 확인하는 `assertNotVisible` 도 같아요 — 이미 사라진 글자를 다시
  확인하면 직전 동작이 안 돼도 통과해요.
- **"입력 뒤에만 보일 것 같은" 글자는 코드로 확인해요.** 검색칸의 "최근 검색" 패널은 칸을 눌러 포커스만 줘도 열려서
  (`onFocus: () => setSearchOpen(true)`), `inputText` 가 실패해도 `assertVisible: 최근 검색` 은 통과해요(2026-11-14 에
  탭만 하는 흐름이 이 확인을 통과하는 것을 돌려 봤어요). 새 확인을 쓸 때는 그 줄을 뺀 흐름이 **실패하는지**까지 한 번 돌려 봐요.
- 실패하면 마지막 화면 스크린샷이 남아요. 가정이 틀렸는지(화면이 다른지) 먼저 그 화면을 봐요.

## 9. 안전 수칙

- **실계정·alpha 쓰기 금지.** 로그인 없이 열리는 화면만 시험해요. 가입·글 작성·설정 변경은 하지 않아요.
  로그인이 필요한 흐름은 이번에 돌려 보지 못했어요 — 필요해지면 사용자에게 먼저 확인받고, 비밀번호는 흐름 파일이나
  저장소에 적지 않아요(값을 넘기는 `env` 방식이 소스에 있는 것은 봤지만 돌려 보지 않았어요).
- **팀밋 비밀값·세션·운영 식별자를 relay·흐름 파일·도구에 넘기지 않아요.** `.env*` 는 읽지 않아요.
- **전용 기기만.** 내가 만든 시뮬레이터(이름·UDID)·AVD(이름)로만 실행하고, 다른 세션의 시뮬레이터·에뮬레이터는 켜지도 끄지도 고르지도 않아요. 흐름은 시작할 때 기기의 앱 데이터·클립보드 등을 초기화해요(iOS 는 키체인·권한·위치까지, 5절 3번).
- **쓰지 않는 명령과 이유**
  - `tapflow reset` — 이 맥의 모든 시뮬레이터를 꺼요(`xcrun simctl shutdown all`). 범위를 지정하지 않고 기기를 한꺼번에 끄는 명령이라 Android 에서도 쓰지 않아요.
  - `tapflow init` — 설치 폴더에 에이전트 지침 파일(AGENTS.md·CLAUDE.md 블록)을 쓰고, 코딩 에이전트에게
    외부 사이트의 문서를 가져와 따르라고 해요. 바깥 글이 에이전트 지침으로 들어오는 길이에요.
  - `tapflow setup` — Homebrew 등을 설치해요.
  - 터널·HTTPS 인증서·메일 설정 — 바깥으로 접속하는 선택 기능이고, 터널은 내려받는 바이너리의 해시를 검증하지 않아요.
  - 네트워크 끊기 기능 — 맥에 네트워크 확장을 설치하고 시뮬레이터 앱에 라이브러리를 주입해요. 필요하면 사용자 승인부터.
- 동봉 바이너리가 Xcode 의 비공개 프레임워크(SimulatorKit)를 써서 Xcode 를 올리면 깨질 수 있어요.
  깨지면 도구 탓으로 오래 파지 말고 기존 방식으로 돌아가요.

## 10. 끝나면 정리해요 — iOS (Android 는 16절)

내가 띄운 것만, 띄울 때 받은 PID·UDID 로 끝내요. 이름 패턴으로 프로세스를 찾아 죽이는 명령(`pkill`·`killall`)과
패턴 검색 결과의 PID 를 넘기는 `kill` 은 쓰지 않아요.

1. tapflow: 6절에서 `$!` 로 받아 둔 PID 에 `kill -TERM "$(cat "$D/tapflow.pid")"`(자식 TreeRunner `xcodebuild`·도우미도 같이 끝나요).
   파일에 적힌 PID 는 재부팅·PID 재사용 뒤에는 남의 프로세스일 수 있어서, 끄기 전에 `ps -p "$(cat "$D/tapflow.pid")" -o command=` 가
   내 `node …/node_modules/.bin/tapflow start …` 를 보여 주는지 먼저 확인하고 아니면 끄지 않아요. 끈 뒤 `ps -p <PID>` 로 사라졌는지 확인해요.
2. 전용 기기: `xcrun simctl shutdown <내 UDID>` → `xcrun simctl delete <내 UDID>`.
3. ego task space `finish({ keep: [] })`, 일회용 토큰·비밀번호 파일(`$D/.local-pat`·`$D/.local-pass`) 삭제, 작업 폴더의 설치·데이터 정리.
   앱을 빌드했다면 worktree 의 gitignore 생성물(5절 4번에 적은 4개)도 내가 만든 것만 지워요 — 빌드 전후의
   `git status --short --ignored` 를 비교해, 빌드 전에 없던 것만 경로를 지정해 지워요(`git clean` 은 쓰지 않아요).
4. 시작 전과 같은지 비교해요: 부팅된 기기 수, 포트 4000 리스너(`lsof -nP -iTCP:4000 -sTCP:LISTEN`), `xcodebuild`·오디오 도우미 프로세스 수.

## 11. 한계 (지금 방식이 계속 필요한 것)

실기기 · 소프트 키보드 레이아웃 · 푸시 도착 · 카카오톡 왕복 로그인 · 카메라·권한 창 · 웹뷰 입력값·계산값 ·
로그인 이후 흐름(미확인). Android 에서는 이에 더해 화면 본문 확인이 흔들리고 한글 입력이 안 되며(13절), 출시 묶음은
시험 서명이라 서명에 묶인 동작을 못 봐요(14절). 도구 자체는 v0.x 실험 기능이 섞여 있고 1인 유지, 문서가 릴리스보다
앞서 있으니, 쓰다가 막히면 흐름을 더 다듬기 전에 기존 방식으로 확인하고 그 사실을 이 문서에 적어요.

## 12. Android — 확인한 것과 확인하지 못한 것 (2026-11-14)

전용 AVD 하나를 만들어 썼어요. 시스템 이미지는 이 맥에 이미 설치돼 있던 것이라 새로 내려받은 것은 없어요.

돌려 본 것:

- `tapflow doctor android` 는 SDK 위치를 `ANDROID_SDK_ROOT` 로 주자 모두 통과했어요(13-1절). 이 변수 없이는 점검 단계에서 멈춰요.
- 전용 AVD 에서 CI alpha APK(`kr.co.teameet.alpha` 0.1.4-alpha)로 첫 화면 → 대회 탭 → 매치 탭 흐름이 **5번 모두 통과**했어요
  (흐름을 다듬은 뒤의 최종 흐름으로 처음 3번, 다른 시점에 다시 돌린 2번). 대회 탭 누르기 단계를 뺀 같은 흐름은 2번 모두
  대회 페이지 제목을 못 찾아 실패했어요. 세지 않은 실패도 있어요. 다듬기 전의 앞선 3번 시도는 흐름을 고치던 중 실패했고,
  다시 돌린 2번 앞의 한 번은 `--build` 를 빠뜨려 시작도 못 했어요(13-1절 5번).
- 검색 입력 흐름(홈 → 검색 → 영문 입력 → 「검색어 지우기」 확인)은 **4번 중 1번만 통과**했어요. 합격 근거로 쓰지 않아요(13-3절).
- 출시 묶음(AAB)을 시험 서명 APK 로 바꿔 설치해 첫 실행이 죽지 않고 운영 웹이 뜨는 것까지 봤어요(14절).
- Play 스토어에 카카오톡 주소(`market://details?id=com.kakao.talk`)를 열어 보니 Google Play 로그인 요구 화면이 떴어요(흐름 통과 2초,
  확인한 글자는 `Sign in` 하나). 로그인하지 않아 카카오톡 설치 화면은 보지 못했어요.
- 모바일 브라우저(Android Chrome, iOS Safari)에서 로그인 버튼이 카카오 계정 화면으로 보내는 것까지 봤어요(15절).
- 대시보드에서 사람이 에뮬레이터를 만지는 절차를 시작부터 종료까지 돌렸어요(16절). 에뮬레이터를 껐다 켜도 기기 데이터가 남는 것을
  Chrome 첫 실행 안내가 다시 안 뜨는 것으로 확인했어요.

시간은 대표값이 아니라 그날의 관찰이에요. 부팅과 설치를 포함한 첫 실행이 약 100초, 이후 같은 흐름은 14~27초(위 5번 통과 기준 — 처음 3번은 14~18초, 다른 시점의 2번은 20초와 27초)였고,
호스트가 바쁠 때(`waiting …: the Mac is over its CPU or memory limit`)는 시작이 미뤄져 한 번에 최대 약 160초까지 걸렸어요.
이런 지연은 결함이 아니라 부하예요. `uptime` 으로 부하를 보고 다시 해요.

**돌려 보지 못한 것**: 3-2절 범위표의 「미확인」 항목 전부 — 에뮬레이터에서 카카오톡이 설치·로그인되는지, 앱 안 카카오 네이티브 로그인,
푸시(FCM), 앱 링크로 앱 열기, 사진 올리기·권한 창, 화면 키보드 배치, 로그인 이후 흐름.

## 13. Android 흐름

### 13-1. 준비 (한 번)

설치본은 5절 1번의 그대로예요(Android 도우미 바이너리의 실행 권한 줄이 거기 이미 들어 있어요). 아래만 더해요.

1. 필요한 것: JDK 17, Android SDK(platform-tools·emulator·build-tools·cmdline-tools·시스템 이미지).
   SDK 와 JDK 위치는 환경변수로 줘요. 값은 맥마다 달라서 이 문서에 적지 않아요.
   ```bash
   export ANDROID_SDK_ROOT=<SDK 위치> ANDROID_HOME="$ANDROID_SDK_ROOT" JAVA_HOME=<JDK 17 위치>
   export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/platform-tools:$ANDROID_SDK_ROOT/emulator:$PATH"
   "$T" doctor android     # SDK·adb·aapt·AVD·Lean mode 점검. 전부 ✓ 이어야 해요
   ```
   `doctor` 가 다른 AVD 이름을 목록으로 보여 줘도 보기만 하는 거예요. 그 AVD 는 켜지도 고르지도 않아요.
2. **전용 AVD 를 만들어요.** 흐름은 대상 앱의 데이터와 클립보드를 초기화하고, 사람이 대시보드에서 「Full reset」 을 켜면
   기기 전체가 지워져요. 남의 AVD 에는 하지 않아요.
   ```bash
   avdmanager create avd -n tapflow-teameet-<이름> -d pixel_6 -k "system-images;android-35;google_apis_playstore;arm64-v8a"
   ```
   이번에는 RAM 2GB·데이터 10GB 로 맞췄고, Play 스토어가 필요해서 `config.ini` 의 `PlayStore.enabled=yes` 를 확인했어요
   (꺼져 있으면 고쳐요). 시스템 이미지가 없어서 새로 받아야 하면 받은 이미지의 이름·리비전을 기록해요. AVD 폴더는 2.5GB 쯤 돼요.
3. 앱: CI **Android Alpha** 워크플로의 `dev` push 실행은 고정 alpha 서명 키로 서명하고 서명자를 검사한 APK 를 아티팩트
   `teameet-alpha-<커밋 sha>` 로 남겨요(PR 실행은 디버그 키로 서명돼요). `.sha256` 파일이 같이 들어 있어요.
   ```bash
   gh run download <run-id> --repo kim-song-jun/matchup-sports-platform --name "teameet-alpha-<커밋 sha>" --dir "$D/alpha-apk"
   shasum -a 256 "$D/alpha-apk/app-alpha-debug.apk"     # 같은 폴더의 .sha256 값과 같은지 봐요
   ```
4. 시작은 6절의 iOS 시작과 같고 플랫폼과 기기만 달라요. `--device` 에 내 AVD 이름만 줘서 tapflow 가 그 AVD 하나만 보게 해요
   (로그에 「1 device(s)」). `TAPFLOW_AUDIO=off`·`node_modules/.bin/tapflow` 직접 실행은 6절과 같고, 시작 전 포트 4000 확인은
   아래 `lsof` 줄이에요(6절 첫 항목: 비어 있어야 하고, 남이 쓰면 건드리지 않고 기다려요).
   ```bash
   mkdir -p "$D/home"                                   # 6절처럼 미리 있어야 해요
   export TAPFLOW_HOME="$D/home" TAPFLOW_AUDIO=off      # 위 1번의 환경변수가 같은 셸에 있어야 해요
   lsof -nP -iTCP:4000 -sTCP:LISTEN                     # 비어 있어야 해요
   "$T" start --platform android --device tapflow-teameet-<이름> > "$D/start.log" 2>&1 < /dev/null &
   echo $! > "$D/tapflow.pid"
   ```
5. **흐름에는 `--build <id>` 가 필요해요.** 대시보드를 켜는 것과 흐름을 돌리는 것은 별개예요. 흐름에 `launchApp` 이 있는데
   `--build` 를 안 주면 `launchApp needs a build under test — pass --build <id>` 로 실패해요. 6절의 `tapflow-local.mjs` 로
   토큰을 만들고 APK 를 올리면(같은 API, `upload` 인자에 APK 경로) 출력된 build id 가 그 값이에요. 이미 올라간 빌드의 id 는
   토큰을 `Authorization: Bearer` 헤더에 실어 `GET http://localhost:4000/api/v1/builds` 로 봐요. 이 문서의 스크립트로
   Android APK 를 올려 본 것은 아니고, 같은 API 를 부르는 임시 스크립트로 알파 APK 와 출시 묶음 APK 를 올렸어요.
   ```bash
   TAPFLOW_TOKEN="$(cat "$D/.local-pat")" "$T" flow run "$D/flows/" --device tapflow-teameet-<이름> --build <id> \
     --artifacts "$D/artifacts" --junit "$D/artifacts/junit.xml"
   ```
   `openUrl` 만 쓰는 브라우저 흐름(15절)은 `--build` 가 필요 없어요.

### 13-2. 흐름 예시 — 첫 화면과 탭 이동

아래는 최종 흐름(5번 통과)에서 `assertNotVisible: 오늘의 추천` 한 줄을 뺀 거예요. 그 줄은 본문이 접근성 트리에서 빠져도
통과해서 탭 이동의 증거가 못 되고, 도착은 뒤따르는 **페이지 제목** `assertVisible` 이 증명해요. 줄을 빼면 흐름이 더 쉽게 실패할 일은
없어요.

```yaml
name: teameet-android-guest-tabs
appId: kr.co.teameet.alpha
steps:
  - launchApp
  - assertVisible: { label: "오늘의 추천", timeout: 90 }
  - tapOn: { label: "대회", role: other }
  - assertVisible: { label: "대회·리그 일정과 참가 신청", timeout: 30 }
  - tapOn: { label: "매치", role: other }
  - assertVisible: { label: "팀매치 찾기", timeout: 30 }
```

- 헛통과 점검: 대회 탭 누르기 줄을 뺀 같은 흐름이 2번 모두 대회 제목을 못 찾아 실패했어요. 이 점검은 **긍정 흐름이 안정적으로
  통과할 때만** 의미가 있어요(최종 흐름은 5번 통과). 긍정 흐름 자체가 흔들리면 부정 흐름의 실패는 입력 줄을 뺀 탓인지 화면 요소를 못
  읽은 탓인지 가를 수 없어요 — 검색 입력 흐름이 그래요(아래).
- 점검하지 못한 쌍: 점검 흐름은 대회 제목 확인에서 먼저 멈추므로 **매치 탭 누르기와 「팀매치 찾기」 확인**은 따로 빼 보지 않았어요.
  「팀매치 찾기」는 `/team-matches` 페이지의 제목(`metadata.title`)이에요. 이 쌍의 통과가 탭 이동의 증거인지는 새 흐름에 쓸 때 줄을 뺀 흐름으로 먼저 확인해요.
- `role: other` 는 iOS 와 같은 이유로 필요해요. 탭 링크와 안쪽 글자가 두 요소로 보여 `tapOn: "대회"` 는 둘 다에 맞아 거절돼요.

### 13-3. Android 에서 알아낸 것

- **WebView 가 화면 본문을 접근성 트리에서 자주 빠뜨려요.** 이 에뮬레이터의 WebView·Chrome 은 124 예요. 대회·매치 목록은 하단 탭과
  헤더만 보이고 본문이 0개였고, 검색 화면은 여러 번 본문이 통째로 빠졌어요. 같은 순간 WebView 안 Chrome 의 접근성 트리(CDP
  `Accessibility.getFullAXTree`)에는 본문이 다 있었고 검색칸 조상에 `inert`·`aria-hidden` 도 없었어요. 페이지 결함이 아니라
  WebView 124 와 UI 자동화(uiautomator) 사이의 문제로 보이나 **원인은 확정하지 못했어요.** WebView 를 최신으로 올리면 나아질
  수 있으나 돌려 보지 못했어요.
  - 확인은 **페이지 제목**처럼 늘 보이는 요소로 해요.
  - **`assertNotVisible` 만으로는 이동을 증명하지 못해요.** 본문이 안 보여도 통과해요.
  - 입력 뒤 화면을 보는 흐름(검색 입력)은 4번 중 1번만 통과해서 **합격 근거로 쓰지 않아요.** 통과한 한 번을 근거로 삼지 않아요.
- **한글 `inputText` 는 거절돼요**(`Android input text supports ASCII only — non-ASCII characters require a custom IME (not
  supported)`). 영문·숫자 입력만 되고, 한글 입력 시험은 iOS 로 해요.
- 흐름 초기화는 로그에 `reset on <AVD>: app-data, pasteboard` 로 찍혀요. 한 번은 `reset failed: app-data — the run goes on, and
  these may hold what an earlier run left` 경고가 나고도 흐름이 이어졌어요. 앞 실행의 데이터가 남아 있을 수 있다는 뜻이에요.

## 14. Android 출시 묶음의 첫 실행 확인

Play 에 올릴 AAB 가 첫 실행에서 죽지 않고 운영 웹을 여는지 보는 용도예요. 시험 서명이라 **서명에 묶인 동작은 못 봐요**(아래).
iOS 는 시뮬레이터용 출시 빌드가 없어서 이 확인을 못 했어요(App Store 빌드는 기기용이에요).

1. AAB: **Android Production Bundle** 워크플로(main 전용, production 승인)의 아티팩트 `teameet-production-aab-<커밋 sha>` 를
   받고 `.sha256` 을 확인해요(`docs/ops/android-release.md` "Build and verification" 4번). 출시 서명 키는 읽지 않아요.
2. bundletool 로 APK 를 만들어요. 내려받는 것: GitHub `google/bundletool` 릴리스 **1.18.3** 의 `bundletool-all-1.18.3.jar`
   (2025-12-15 릴리스), sha256 `a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29` — 받은 뒤 릴리스 페이지에 적힌
   값과 같은지 대조해요. 서명 키를 주지 않으면 bundletool 이 그 맥의 기본 디버그 키로 서명해요.
   ```bash
   java -jar bundletool-all-1.18.3.jar build-apks --bundle=app-production-release.aab --output=release.apks --mode=universal
   unzip -p release.apks universal.apk > release-universal.apk     # APKS 는 zip 이고 universal.apk 가 설치용이에요
   ```
3. APK 를 6절의 방법으로 relay 에 올려 build id 를 받고(13-1절 5번), 같은 AVD 에서 앱 ID `kr.co.teameet`(운영) 흐름을 돌려요.
   알파(`kr.co.teameet.alpha`)와 앱 ID 가 달라서 한 AVD 에 같이 설치돼요.
   ```yaml
   name: teameet-release-first-launch
   appId: kr.co.teameet
   steps:
     - launchApp
     - assertVisible: { label: "오늘의 추천", timeout: 120 }
     - tapOn: { label: "대회", role: other }
     - assertVisible: { label: "대회·리그 일정과 참가 신청", timeout: 30 }
   ```
4. 흐름 뒤에 `adb` 로 `logcat -b crash -d`(crash 버퍼가 비었는지), 앱 프로세스가 살아 있는지, 맨 앞 액티비티가 앱의
   `MainActivity` 인지 봐요. 시리얼은 `adb devices` 에서 고르고 `adb -s <시리얼> emu avd name` 이 내 AVD 인지 먼저 확인해요.

2026-11-14 결과(0.1.4 (5)): 흐름 통과(1번, 12.7초), crash 버퍼 0줄, 흐름 뒤에도 프로세스가 살아 있고 맨 앞 화면이 앱의
`MainActivity`, APK 안 웹 주소는 운영(`https://teameet.co.kr`). 운영 웹은 홈과 대회 목록만 열었고 로그인하지 않았어요(열기만 해도
쓰는 화면이 아니에요). 출시 빌드에는 WebView 디버깅 소켓이 없어서 15절식 주소 읽기는 못 해요.

**이 방법으로 못 보는 것**(실기기·Play 가 필요한 것은 `docs/ops/android-release.md` 의 "Remaining device-only gate"):
서명에 묶인 카카오 네이티브 로그인(키 해시가 출시 키와 달라요) · FCM 푸시(운영 서버 설정·Play 서명) · Play 업데이트 확인(스토어에서
설치한 앱이 아니에요) · Play 가 다시 서명한 배포본 그대로의 동작.

## 15. 모바일 브라우저의 로그인 길 확인 (로그인하지 않고 도착 화면까지)

로그인 버튼 수정(예: 카카오톡 바로 열기)이 dev·alpha 에 오른 뒤 모바일 브라우저가 어디로 보내는지 앞뒤를 견주는 용도예요.
앱 셸 시험이 아니라 2절의 예외예요. 데스크톱 `ego-browser` 로 재현할 수 없는 모바일 브라우저 엔진의 이동만 보고, 화면 QA 는 하지 않아요.
**카카오 화면에서 멈추고 아무것도 입력하지 않아요.** 아래는 카카오톡이 없는 기기에서 2026-11-14 alpha 로 본 모습이에요.

- Android Chrome: 흐름 하나로 눌러요. `--build` 는 필요 없어요. 깨끗한 AVD 면 Chrome 첫 실행 안내(`Use without an account` →
  `No thanks`)를 먼저 한 번 넘겨야 하고, 한 번 넘기면 기기 데이터가 남아 다시 안 떠요.
  ```yaml
  name: android-chrome-alpha-kakao-login-route
  appId: com.android.chrome
  steps:
    - openUrl: "https://alpha.teameet.co.kr/login"
    - tapOn: { label: "카카오 로그인", role: other, timeout: 30 }
  ```
  도착: 영문 UI 의 카카오계정 로그인 화면(ID·비밀번호 칸만), 주소에 `talk_login=hidden`. 도착 주소는 Chrome DevTools 소켓
  (`adb forward` 로 열고, 끝나면 내가 연 포워딩만 `adb -s <시리얼> forward --remove tcp:<포트>` 로 지워요)과 스크린샷으로 확인했어요.
- iOS Safari: Safari 는 tapflow 빌드가 아니라 화면 트리를 못 읽어요(`no app launched`). 선택자 대신 버튼 위치를 짧은 `swipe`
  (`from`·`to` 를 거의 같은 좌표로)로 눌러요. 좌표는 iPhone 18 Pro 화면(402×874 pt) 기준이라 다른 기기 종류는 다시 구해요.
  도착: 맨 위에 「카카오톡으로 로그인」 버튼이 있고 아래에 계정 입력이 있는 카카오계정 화면(스크린샷으로 확인). 호스트 부하가 매우
  높을 때 돌려서 첫 시도는 `open url timed out`, 둘째는 선택자로 눌러 트리를 못 읽어 실패했고(그래서 좌표로 바꿨어요) 셋째에 통과했어요.
  도착 주소는 Safari 탭 기록에서 읽어 화면과 어긋날 수 있어요(확정 아님).
- **흐름의 통과는 도착을 증명하지 못해요.** Chrome 흐름은 버튼을 찾아 눌렀다는 것까지이고, Safari 흐름은 끝에 단언이 없어서(`openUrl` 과
  `swipe` 뿐) 통과 표시가 의미 없어요. 도착은 위의 주소 읽기와 스크린샷으로만 판정해요.
- 두 경우 모두 authorize 주소의 `client_id`·`auth_tran_id` 같은 값은 기록에서 가려요.
- 이 결과는 그날 alpha 코드의 모습이에요. 카카오톡이 있는 기기의 길은 아직 아무도 확인하지 않았어요(3-2절).

## 16. 사람이 대시보드로 에뮬레이터를 만질 때

흐름으로 못 하는 것을 사람이 직접 해 볼 때예요(Play 스토어에 로그인해 카카오톡을 설치해 보는 것 같은 3-2절의 「미확인 · 사용자 로그인 필요」 시도).
지금까지 확인한 것은 Play 로그인 요구 화면이 뜨는 데까지이고, 로그인한 뒤의 설치·실행은 아무도 해 보지 않았어요.
에이전트는 자격증명을 입력하지 않고, 사람이 입력한 계정 정보는 흐름 파일·로그·이 저장소에 남기지 않아요.

**시작**

1. 시작 전 기준선을 적어 둬요: `lsof -nP -iTCP:4000 -sTCP:LISTEN`(비어 있어야 해요. 남이 쓰고 있으면 건드리지 않고 기다려요),
   `lsof -nP -iTCP:5037 -sTCP:LISTEN`(adb 서버가 이미 열려 있는지 — 이 결과를 적어 둬야 종료 3번이 돼요), `pgrep -lf -- qemu`(보기만 해요).
   `adb devices` 는 서버가 없으면 서버를 띄우므로 5037 리스너가 이미 있을 때만 불러요.
2. 13-1절 4번처럼 `--device` 에 내 AVD 만 주고 `TAPFLOW_AUDIO=off` 로 시작해요. relay 데이터 폴더(`$TAPFLOW_HOME`)는 실행마다
   새로 만들어, 이전 실행의 관리자·토큰을 물려받지 않게 해요.
3. 관리자는 그 실행에서만 쓰는 일회용 계정이에요(팀밋 계정이 아니에요). 6절의 `token` 단계가 만들고 비밀번호는 `$D/.local-pass`
   (권한 600)에 있어요. 끝나면 지워요(아래 종료 4번).
4. **relay 는 모든 주소의 포트 4000 에 열려요.** 비밀번호가 일회용이어도 같은 망에서 기기 화면을 제어할 수 있는 창이므로 쓸 때만 켜고
   끝나면 바로 꺼요.
5. 로그인 → 앱 → 빌드의 Start QA → Mac → 기기 선택. **「Full reset」 은 켜지 않아요**(기기의 로그인·앱이 모두 지워져요). 부팅은 1~2분.

**종료** — 내가 띄운 것만, 띄울 때 받은 PID 로 끝내요. 이름 패턴으로 찾아 끄는 명령과 `tapflow reset` 은 쓰지 않아요.

1. tapflow: `$!` 로 적어 둔 PID 만 `kill -TERM`, 20초 뒤에도 남아 있으면 그 PID 만 `kill -KILL`. 파일에 적힌 PID 는 재부팅·PID 재사용
   뒤에는 남의 프로세스일 수 있어요. 그래서 끄기 전(KILL 직전에도 한 번 더)에 `ps -p <PID> -o command=` 가 내 설치본의 `tapflow start …` 인지 확인해요.
   - 숫자가 아닌 기록이거나 다른 프로그램의 명령이면 **아무것도 끄지 않고 멈춰요.** 2번의 에뮬레이터도 그대로 둬요. 낡은 기록이면 파일을 지우고 다시 시작해요.
   - PID 가 이미 없으면(`ps -p` 가 아무것도 안 보이면) 이미 꺼진 거예요. 2번으로 가요.
   - 끈 뒤 `ps -p <PID>` 로 사라졌는지 확인해요.
2. 에뮬레이터: tapflow 가 떼어 놓고 띄워서 tapflow 를 꺼도 남아요. 5037 리스너가 있을 때만 `adb devices` 의 `emulator-<포트>` 중
   `adb -s <시리얼> emu avd name` 이 내 AVD 이름인 것에만 `adb -s <시리얼> emu kill`. 이름이 다르면 다른 세션의 에뮬레이터라 건드리지 않아요.
3. adb 서버(포트 5037): 아래 둘이 **모두** 맞을 때만 `adb kill-server`. 하나라도 어긋나거나 확인하지 못하면 그대로 둬요.
   - 시작 전 기준선에 5037 리스너가 **없었다고 적어 뒀을 때**(기록이 없으면 다른 세션 것으로 봐요).
   - `adb devices` 에 붙은 기기·연결이 하나도 없을 때(에뮬레이터가 꺼지는 데 시간이 걸리니 최대 30초 기다려 보고, 그래도 있으면 둬요).

   한계: 시작한 뒤 다른 세션이 adb 서버만 켜 두고 기기를 붙이지 않았다면, 위 확인(기준선에 없었다·붙은 기기 0)으로는 내 것과 구분하지 못해요.
   그래서 기기가 하나라도 붙은 동안에는 지우지 않아요.
4. 지울 것: relay 데이터 폴더(일회용 관리자·토큰의 해시가 든 SQLite 가 있어요), 토큰·비밀번호 파일, 내려받은 alpha APK, bundletool 로
   만든 시험 서명 APK·APKS. 포트 4000·5037, qemu·tapflow 프로세스 수가 시작 전 기준선과 같은지 다시 봐요. ego task space 는
   `finish({ keep: [] })`.
5. 전용 AVD 는 디스크를 2.5GB 쯤 차지해요. 더 쓰지 않으면 `avdmanager delete avd -n <내 AVD 이름>` 으로 지워요. 다시 쓸 거면 꺼진 채
   두고, 그 사실을 사용자에게 알려요.

기기 데이터는 에뮬레이터를 껐다 켜도 남아요. 흐름의 초기화는 대상 앱 하나의 데이터와 클립보드뿐이라고 로그에 찍히지만, 사람이 만든
Play 스토어·카카오톡 로그인이 흐름 초기화로 지워지는지는 확인하지 않았어요.

**이 절차를 어디까지 돌려 봤나.** 위 시작·종료를 옮긴 작업 맥의 보조 스크립트로, 대시보드를 켜서 에뮬레이터를 고르고 끝내는 전체 경로는 보강하기 전 판으로
돌려 기준선(포트 4000·5037, qemu, tapflow 프로세스 0)으로 돌아오는 것까지 확인했어요. 그 뒤 종료 1번의 PID 확인과 3번의 adb 서버 조건을 보강했고,
보강한 판은 가짜 프로세스로 거절 분기(숫자가 아닌 기록, 남의 프로세스 번호)와 내 설치본 `tapflow start` 명령줄을 가진 프로세스의 TERM 까지만 돌려 봤어요.
실제 tapflow·에뮬레이터·adb 서버를 보강한 판으로 끄는 경로는 돌려 보지 못했어요(adb 서버 조건 3번도 마찬가지예요).
