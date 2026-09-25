# 팀밋 iOS 앱 — App Store 제출 체크리스트

> 대상: 프로덕션 앱 `kr.co.teameet` (스킴 `TeameetProduction`, 표시 이름 `팀밋`).
> 알파 앱 `kr.co.teameet.alpha` 는 TestFlight 전용이며 이 문서의 제출 대상이 아니다.
> 빌드·서명의 상세 절차는 [`docs/ops/ios-release.md`](../../ops/ios-release.md), 푸시 서버 설정은
> [`docs/ops/ios-apns-setup.md`](../../ops/ios-apns-setup.md) 에 있다. 이 문서는 **제출까지의 순서**만 다룬다.

같은 폴더의 다른 문서:

| 문서 | 내용 |
|---|---|
| [`metadata-ko.md`](./metadata-ko.md) | 앱 이름·부제·설명·키워드·URL 초안 (한/영) |
| [`app-privacy.md`](./app-privacy.md) | 앱 개인정보(영양 성분표) 답변 초안 + ATT 판단, 코드 근거 |
| [`review-notes.md`](./review-notes.md) | 심사 메모 초안, 연령 등급 설문 답변, UGC(1.2) 대응 근거 |
| [`screenshots-spec.md`](./screenshots-spec.md) | 스크린샷·앱 미리보기 영상 규격 |

표기: **[준비됨]** = 저장소·스크립트로 이미 되어 있거나 에이전트가 할 수 있음 · **[사용자]** = 계정 권한·법적 판단이 필요해 사용자만 할 수 있음

## 0. 현재 상태 (2026-09-25, App Store Connect API 읽기 전용 조회)

| 항목 | 상태 |
|---|---|
| 앱 레코드 `kr.co.teameet` | **있음** — 이름 `팀밋`, 기본 언어 한국어(`ko`), SKU 입력됨, 버전 `1.0` = `PREPARE_FOR_SUBMISSION` |
| App ID `kr.co.teameet` capability | Push Notifications · Sign in with Apple · Associated Domains · In-App Purchase(기본) — **모두 켜져 있음** |
| 배포 인증서 / 프로파일 | Apple Distribution 인증서, `Teameet Production App Store` 프로파일 ACTIVE (둘 다 2027-08-31 만료) |
| 프로덕션 빌드 업로드 | **0건** (알파는 빌드 4~8 VALID) |
| 버전 메타데이터 | 설명·키워드·지원 URL·개인정보 URL·부제·카테고리·연령 등급·저작권 **전부 비어 있음** |
| 콘텐츠 권리 선언 | 미답변 |
| `teameet.co.kr` (main 배포) | `/terms?document=privacy` 200, `/terms?document=support` 200, **`/account-deletion` 404**, **AASA 404**, **`/api/v1/auth/apple/nonce` 404** |

마지막 줄이 가장 큰 막힘이다 — 프로덕션 웹이 dev 보다 크게 뒤처져 있어(`origin/main..origin/dev` 3,408 커밋)
**Apple 로그인·계정 삭제 페이지·유니버설 링크·APNs 배선이 프로덕션에 아직 없다.** 심사자는 프로덕션 앱으로
`teameet.co.kr` 을 보므로, 이 상태로 제출하면 4.8(Apple 로그인)·5.1.1(v)(계정 삭제)에서 거절될 가능성이 높다.

## 1. 선행 — 앱 바이너리 보완 (코드 변경, 제출 전 필수)

이 문서 작업은 Swift·Info.plist 를 건드리지 않았다(병렬 작업과 충돌 방지). 아래는 별도 변경으로 넣어야 한다.

- [ ] **[준비됨·미적용] `NSCameraUsageDescription` 추가** — 웹의 `<input type="file" accept="image/*">`
  (`apps/v1_web/src/components/auth/signup-client.tsx:642` 등)를 WKWebView 가 띄우면 iOS 가 "사진 찍기"를
  함께 보여준다. 이 키가 없으면 그 항목을 누르는 순간 앱이 **강제 종료**된다(심사 2.1 크래시 거절 사유).
  `apps/v1_ios/project.yml` 의 `info.properties` 에 없음을 확인했다.
- [ ] **[준비됨·미적용] `NSLocationWhenInUseUsageDescription` 추가** — 웹이 `navigator.geolocation` 을
  쓴다(`home-client.tsx:217`, `onboarding-client.tsx:255`, `my-api-clients.tsx:1250`). 키가 없으면 iOS
  WKWebView 에서 위치 요청이 항상 실패한다.
- [ ] 동영상 업로드 입력(`fixture-video-add-form.tsx`)이 카메라 녹화를 허용하면 `NSMicrophoneUsageDescription` 도 필요 — 확인 후 결정.
- [ ] 개인정보처리방침에 **iOS 앱 절**(APNs 토큰·기기 정보, Apple 로그인으로 받는 이름·이메일, 카메라·위치
  권한 사용 조건) 추가 — 현재는 Android 절(11항)만 있다. `apps/v1_web/src/components/auth/terms-client.tsx`.
- [ ] Apple 로그인 계정 삭제 시 **Apple 토큰 폐기(REST `/auth/revoke`)** — 심사 5.1.1(v) 요구. 현재 셸은
  `identityToken` 만 보내고 `authorizationCode` 를 전달하지 않아 서버가 폐기할 수단이 없다. 자세한 내용은
  [`review-notes.md`](./review-notes.md#위험-항목).

## 2. Apple Developer / App Store Connect 준비

1. **[사용자]** Account Holder 가 App Store Connect > 비즈니스에서 최신 **유료 앱 계약·무료 앱 계약** 동의 상태 확인.
2. **[준비됨]** App ID `kr.co.teameet` — Push·Sign in with Apple·Associated Domains 켜짐(위 0절 조회로 확인).
3. **[준비됨]** 배포 인증서·`Teameet Production App Store` 프로파일 — `scripts/ios/asc-profile.mjs list` 로 재확인.
   만료나 capability 변경 뒤에는 같은 이름으로 재발급: `node scripts/ios/asc-profile.mjs create "Teameet Production App Store" kr.co.teameet`.
4. **[사용자]** 앱 정보 입력 (ASC > 앱 > 앱 정보)
   - 이름: `팀밋` (현재 값). 부제: [`metadata-ko.md`](./metadata-ko.md) 참조
   - 기본 언어: 한국어 (설정됨) · 번들 ID: `kr.co.teameet` (설정됨)
   - SKU: **이미 입력돼 있고 생성 후에는 바꿀 수 없다.** 새로 만든다면 `teameet-ios-prod` 같은 내부 식별자를 권한다
   - 카테고리: **1차 `스포츠(Sports)`, 2차 `소셜 네트워킹(Social Networking)` 권장**
     - 근거: 핵심 행위가 경기 찾기·팀 운영·대회 기록 등 스포츠 활동 자체이고, 채팅·팀 컨택은 그 보조 수단이다.
       소셜 네트워킹을 1차로 두면 대형 SNS 와 경쟁하고 1.2(UGC) 심사 시선도 더 무거워진다.
   - 콘텐츠 권리: 사용자 업로드 이미지·대회 영상 링크 등 제3자 콘텐츠가 있는지 **사용자가 판단**해 답한다.
   - 연령 등급 설문: [`review-notes.md`](./review-notes.md#연령-등급-설문-제안) 제안 답변 사용.
5. **[사용자]** 가격 및 사용 가능 여부: 무료, **대한민국** 권장(서비스·약관·본인인증이 한국 기준). EU 를 넣으면 DSA 거래자 정보 입력이 추가로 필요하다.
6. **[사용자]** 앱 개인정보: [`app-privacy.md`](./app-privacy.md) 답변으로 입력. 개인정보처리방침 URL: `https://teameet.co.kr/terms?document=privacy`.

## 3. 프로덕션 백엔드 선행 조건

1. **[사용자] `dev → main` 승격** — 에이전트는 하지 않는다(저장소 정책). 이 승격이 아래 2~5 를 한 번에 가져온다.
   승격 후 확인(에이전트가 대신 측정 가능):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://teameet.co.kr/account-deletion          # 200
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://teameet.co.kr/api/v1/auth/apple/nonce  # 200 (503 이면 env 미설정)
   curl -sI https://teameet.co.kr/.well-known/apple-app-site-association | grep -i content-type  # application/json
   ```
2. **[준비됨]** APNs 환경변수 — `deploy.yml`(dev)이 `APNS_KEY_ID`·`APNS_TEAM_ID`·`APNS_PRIVATE_KEY` secret 을
   읽고 `APNS_BUNDLE_ID=kr.co.teameet` 으로 넣는다. production environment 에 네 secret 이 **존재함**을 확인했다(값은 미확인).
   `main` 의 `deploy.yml` 에는 이 배선이 아직 없다 → 1번 승격으로 들어간다.
3. **[준비됨]** `APPLE_SIGN_IN_AUDIENCES` — `deploy/docker-compose.prod.yml` 기본값 `kr.co.teameet`.
4. **[준비됨]** AASA — `deploy/aasa/apple-app-site-association` 에 `U9J95Q6XD3.kr.co.teameet` 등록(dev 기준).
5. **[사용자]** 승격 후 프로덕션에서 **심사용 데모 계정** 생성: 휴대폰 인증·약관 동의 완료, 팀 1개 소속,
   참가한 매치·후기·채팅이 1건 이상 보이도록. 계정 정보는 저장소가 아니라 ASC 심사 정보 칸에만 적는다.

## 4. 빌드·아카이브·업로드

1. **[준비됨]** 버전: `apps/v1_ios/version.properties` (현재 `versionName=0.1.4`, `versionCode=8`).
   **[사용자 결정]** 스토어 첫 버전 번호 — ASC 버전 레코드는 `1.0` 이다. 둘 중 하나로 맞춘다:
   `versionName=1.0.0` 으로 올리거나(권장, 스토어 표기와 일치), ASC 버전 문자열을 `0.1.x` 로 바꾸거나.
2. **[준비됨]** 프로젝트 생성: `bash scripts/release/generate-ios-version-xcconfig.sh && (cd apps/v1_ios && xcodegen generate)`
3. **[준비됨]** 아카이브·export(업로드 없음): `TEAMEET_ARCHIVE_SCHEME=TeameetProduction scripts/ios/archive-and-export.sh`
   — 스킴을 안 주면 알파가 만들어진다. 환경변수 `APP_STORE_CONNECT_KEY_ID`·`…_ISSUER_ID`·`…_KEY_FILE`(p8 은 저장소 밖).
   프로덕션 산출물은 `main` 에서만 만든다 — `scripts/release/require-ios-production-ref.sh`.
4. **[사용자]** 업로드 — 같은 명령에 `--upload`. **되돌릴 수 없다**(잘못 올린 빌드는 만료만 가능).
5. **[준비됨]** 수출 규정: `ITSAppUsesNonExemptEncryption=false` 가 빌드에 들어 있어 업로드마다 묻지 않는다.

## 5. TestFlight 내부 테스트 (심사 없음)

1. **[준비됨]** `TEAMEET_BUNDLE_ID=kr.co.teameet node scripts/ios/asc-testflight.mjs status` →
   `… prepare "<그룹 이름>" <빌드 번호>` 로 내부 그룹 생성·빌드 연결. **`TEAMEET_BUNDLE_ID` 를 빼면 알파 앱을 조작한다.**
2. **[사용자]** 테스터(ASC 사용자) 추가 — 개인정보라 스크립트에 넣지 않았다.
3. **[사용자]** 실기기 스모크: 로그인(이메일·카카오·Apple) → 푸시 권한 → 알림 탭 → 딥링크 착지 →
   사진 업로드에서 **"사진 찍기"** 선택(1절 크래시 확인) → 마이 > 계정 설정 > 회원 탈퇴 화면 진입 → 오프라인 화면.

## 6. 심사 제출

1. **[사용자]** 스크린샷 업로드 — [`screenshots-spec.md`](./screenshots-spec.md). 6.9" 세트 1~10장이면 충분.
2. **[사용자]** 메타데이터 입력 — [`metadata-ko.md`](./metadata-ko.md) (한국어 필수, 영어는 선택).
3. **[사용자]** 심사 정보: 연락처, 데모 계정, 메모 — [`review-notes.md`](./review-notes.md).
4. **[사용자]** 빌드 선택 → 출시 방식(`승인 후 수동 출시` 권장 — 현재 레코드는 `AFTER_APPROVAL` 자동) → 제출.
5. 거절 시: 사유 조항별 대응 재료는 `review-notes.md` 의 4.2·1.2·5.1.1 절에 있다.

## 의존 순서 요약

```
1 바이너리 보완(Info.plist 키·개인정보처리방침 iOS 절) ─┐
3.1 dev→main 승격 ─ 3.5 데모 계정 ─────────────────────┼─ 4 아카이브·업로드 ─ 5 TestFlight ─ 6 제출
2 ASC 정보·개인정보·연령 등급 (병렬 가능) ───────────────┘
```
