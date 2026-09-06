# App Store 제출 — 프로덕션(`kr.co.teameet`)

> 심사는 **alpha 가 아니라 프로덕션 앱**으로 받는다. TestFlight 에 올라간
> `kr.co.teameet.alpha`(팀밋 알파)는 alpha 서버를 보는 별개 앱이고, 스토어에 올리는 앱은
> 별개의 번들·별개의 App Store Connect 레코드이며 `teameet.co.kr` 을 본다.
>
> 이 문서의 요건은 2026-09-04 에 developer.apple.com 원문을 직접 읽고 저장소와 대조한 것이다.
> 결정 4건(구현 방식·화면 배치·진행 순서·스크린샷)은 같은 날 사용자가 확정했다.

## 1. 요건 대조 — 무엇이 남았나

| 조항 | 요구 | 상태 |
|---|---|---|
| 4.8 Login Services | 카카오 같은 제3자 소셜 로그인을 쓰면 ①이름·이메일만 수집 ②이메일 비공개 선택 ③동의 없는 광고 추적 없음 을 갖춘 로그인을 **동등하게** 제공 | **완료** — Sign in with Apple(네이티브). 면제 조항("자체 계정 시스템만 단독으로")은 카카오가 있어 해당 없음 |
| 5.1.1(i) 개인정보 처리방침 | 앱 안에서 쉽게 접근 | 완료 — 로그인 화면에서 `/terms?document=privacy` |
| 5.1.1(v) 계정 삭제 | 계정 생성이 있으면 **앱 안에서** 삭제를 시작할 수 있어야 | 화면 있음(`/my/settings/withdrawal`). 다만 "요청 → 운영팀 확인" 방식이라 **위험** — 아래 3절 |
| 2.1 App Completeness | 리뷰어용 데모 계정 + 켜져 있는 백엔드 | **사용자 준비 필요** — 아래 4절 |
| 4.2 Minimum Functionality | "재포장한 웹사이트" 이상 | **위험** — 리뷰 노트로 설명한다(아래 2절) |
| 자산 | 스크린샷 6.9″ `1290×2796` 또는 `1320×2868` 세로, 1~10장, PNG/JPEG, **알파채널 금지** | 캡처 하네스로 생성. iPad 는 `TARGETED_DEVICE_FAMILY=1` 이라 불필요 |
| 인프라 | 프로덕션 서버가 심사 대상 앱과 같은 코드 | **사용자 승격 필요** — `dev → main` |

## 2. 리뷰 노트 초안 (App Store Connect → App Review Information → Notes)

4.2 는 웹뷰 셸이 가장 자주 걸리는 조항이다. 리뷰어가 스스로 알아내게 두지 말고 적는다.

```
Teameet is a sports matching service for amateur clubs in Korea. The iOS app is a native
shell around our own web application, and the shell provides functionality the web cannot:

- Remote push notifications over APNs (match approvals, game start, team chat), including
  when the app is backgrounded or terminated.
- Sign in with Apple, presented natively with ASAuthorizationController.
- Universal Links, so a shared match or tournament link opens the app rather than Safari.
- Session restoration across app launches, native keyboard handling and safe-area layout.

The app can be browsed without an account ("로그인 없이 시작하기" on the first screen), so a
reviewer can see matches, teams and tournaments before signing in. A demo account is provided
below for the features that require one.

Account deletion: 마이 → 설정 → 회원 탈퇴 (My → Settings → Withdraw), reachable from inside
the app while signed in.
```

## 3. 5.1.1(v) 계정 삭제 — 남은 위험

현재 `/my/settings/withdrawal` 은 **탈퇴 요청**을 만들고 운영팀이 확인해 처리한다. Apple 의
요구는 "앱 안에서 삭제를 **시작**할 수 있을 것" 이므로 형식은 만족하지만, 순수 수동 처리
큐로만 끝나는 흐름은 반려된 전례가 있다. 반려 시 대응 순서:

1. 화면에 처리 기한을 명시한다(예: "영업일 3일 이내 처리").
2. 요청 상태를 앱에서 조회할 수 있게 한다.
3. 그래도 걸리면 즉시 비활성화 + 보관기간 후 삭제로 바꾼다.

## 4. 리뷰어 데모 계정 (2.1)

프로덕션 계정이므로 **사용자가 만들어 전달**한다. 조건:

- 이메일·비밀번호 로그인이 가능할 것(리뷰어는 카카오·Apple 계정을 쓰지 않는다).
- 약관 동의·휴대폰 인증이 끝나 있을 것 — 인증 게이트에 막히면 리뷰어는 그것을 결함으로 본다.
- 팀 하나에 소속되고 참가 중인 경기가 하나 이상 있을 것(빈 화면만 보면 4.2 위험이 커진다).
- **저장소에 적지 않는다.** App Store Connect 의 App Review Information 칸에만 넣는다.

## 5. 스크린샷

`scripts/ios/capture-store-screenshots.sh` 가 시뮬레이터(iPhone 16 Pro Max = 6.9″,
`1320×2868`)에서 실제 화면을 찍는다 — 홈·매치·대회·팀·마이 5장. 결정(D4-C)에 따라 **앞 2~3장은 카피를 얹고 나머지는
실화면 그대로** 쓴다.

```bash
TEAMEET_SHOT_EMAIL=<계정> TEAMEET_SHOT_PASSWORD=<비밀번호> \
  scripts/ios/capture-store-screenshots.sh
```

카피는 별도 단계다. 원본을 그대로 두고 앞 3장에만 얹는다:

```bash
node scripts/ios/compose-store-captions.mjs <위 스크립트가 만든 디렉터리>
# → <디렉터리>/captioned/01-home.png … 03-tournaments.png
```

카피 문구는 그 스크립트의 `CAPTIONS` 표 하나에만 있다. **화면에 실제로 보이는 것만 적는다** —
앱에서 찾을 수 없는 주장은 2.3(정확한 메타데이터) 반려 사유다.

- 알파채널이 있으면 App Store Connect 가 업로드를 거부한다. 두 스크립트는 평탄화하지 않고
  **검사**한다 — PNG 헤더(IHDR)의 colour type 을 읽어 출력하고, 알파가 있으면 파일 이름과 함께
  실패한다. 실측상 시뮬레이터 출력도 Playwright 출력도 이미 불투명 RGB(colour type 2)라
  변환 단계는 아무 일도 안 하면서 안전장치처럼 읽혔다.
- 승격 **후** 프로덕션 빌드로 다시 찍는다. 스크린샷은 리뷰어가 설치할 앱과 같아야 한다.
  지금 alpha 로 찍은 것은 하네스 검증용이며, 대회명이 테스트 데이터(`ttt`)라 그대로 못 쓴다.

## 6. Apple Developer / App Store Connect — 사용자 작업

1. **App ID `kr.co.teameet`**: Push Notifications 와 **Sign In with Apple** capability 를 켠다.
   Sign In with Apple 이 꺼져 있으면 프로비저닝 프로파일이 `com.apple.developer.applesignin`
   엔타이틀먼트를 주지 않고, 앱에서 시트가 오류 1000 으로 실패한다.
2. **배포 프로파일** 재발급(엔타이틀먼트가 늘었으므로): `scripts/ios/asc-profile.mjs`.
3. **App Store Connect 앱 레코드** 생성 — 현재 "팀밋 알파" 하나뿐이다.
4. 연령 등급·가격·판매 지역·카테고리, 개인정보 URL(`https://teameet.co.kr/terms?document=privacy`).
5. **App Privacy(영양성분표)**: 수집 항목은 이메일·이름·휴대폰·위치(활동 지역)·사용자 콘텐츠
   (채팅·후기)·식별자. 전부 "앱 기능" 목적이며 추적(Tracking) 없음 — 광고 SDK 를 쓰지 않는다.

## 7. 순서 (D3-A: 승격 먼저)

1. 이 브랜치를 dev 에 머지 → alpha 배포 → alpha 앱에서 Apple 로그인 실측.
2. **사용자**가 `dev → main` 승격 → 프로덕션 배포 승인 → 배포 확인.
   - 마이그레이션이 한 번에 여러 개 적용된다. 배포 후 `/api/v1/health` 와 주요 화면을 확인한다.
   - `APPLE_SIGN_IN_AUDIENCES` 는 compose 에 리터럴로 있으므로 별도 시크릿 등록이 없다.
3. 프로덕션 빌드 아카이브·업로드(`scripts/ios/archive-and-export.sh --upload`,
   `TEAMEET_ARCHIVE_SCHEME=TeameetProduction`).
4. 스크린샷 촬영 → 메타데이터 입력 → 심사 제출.
