# App Privacy (앱 개인정보 "영양 성분표") 답변 초안

> 입력 위치: App Store Connect > 팀밋 > 앱 개인정보. **법적 신고이므로 최종 답은 사용자가 한다.**
> 이 초안은 저장소 코드(2026-09-25 `origin/dev`)와 운영 중인 페이지를 근거로 했다. 근거가 코드에 없는 항목은
> "확인 필요"로 남겼다. 앱은 WKWebView 셸이라 **웹(`apps/v1_web`)과 서버(`apps/v1_api`)가 수집하는 것이 곧 앱이 수집하는 것**이다
> — Apple 도 앱 안에 띄운 웹 콘텐츠의 수집을 앱의 수집으로 본다.

Apple 정의 요약: **수집(collect)** = 기기 밖으로 보내 실시간 요청 처리에 필요한 시간보다 오래 접근 가능한 상태로 두는 것.
**연결(linked)** = 계정·기기 식별자 등으로 사용자 신원과 묶이는 것. **추적(tracking)** = 다른 회사 앱·웹 데이터와 결합해
광고 목적으로 쓰거나 데이터 브로커와 공유하는 것.

## 1. 첫 질문 — "데이터를 수집합니까?"

**예.** 회원가입·프로필·경기 신청·채팅이 모두 서버에 저장된다.

## 2. 데이터 유형별 답변

모든 항목의 "추적에 사용" = **아니요** (3절 근거).

| Apple 데이터 유형 | 수집 | 사용자와 연결 | 목적 | 코드 근거 |
|---|---|---|---|---|
| 연락처 정보 > **이름** | 예 | 예 | 앱 기능 | 가입·실명(`V1UserProfile.realName`, `displayName`), 대회 신청 입금자명(`V1TournamentRegistration.depositorName`), Apple 로그인 이름(`AppleSignInController.swift` → `fullName`) |
| 연락처 정보 > **이메일 주소** | 예 | 예 | 앱 기능 | `V1User.email`, Apple 로그인 이메일 |
| 연락처 정보 > **전화번호** | 예 | 예 | 앱 기능 (본인 확인·부정 이용 방지) | `V1User.phone`, `phoneVerifiedAt`, 쓰기 요청 게이트 `v1-auth.guard.ts:127` `PHONE_VERIFICATION_REQUIRED` |
| 위치 > **대략적인 위치** | 예 | 예 | 앱 기능 (주변 지역 추천) | 사용자가 "현재 위치" 를 누를 때만 좌표 전송 → 서버가 지역으로 변환해 저장 (`my-api-clients.tsx:1250`, `onboarding-client.tsx:255`) |
| 위치 > 정확한 위치 | **아니요** (아래 주 1) | — | — | 좌표는 지역 판정·날씨 조회에 실시간으로만 쓰이고 사용자 테이블에 좌표 컬럼이 없다 (`V1User`·`V1UserProfile` 필드 확인) |
| 사용자 콘텐츠 > **사진 또는 비디오** | 예 | 예 | 앱 기능 | 프로필 이미지 `V1UserProfile.profileImageUrl`, 업로드 `V1User.uploadAssets`, 가입 화면 `signup-client.tsx:642` |
| 사용자 콘텐츠 > **이메일 또는 문자 메시지** | 예 | 예 | 앱 기능 | 채팅 `V1ChatMessage.body` (앱 내 메시지) |
| 사용자 콘텐츠 > **고객 지원** | 예 | 예 | 앱 기능 | 문의·신고 `V1Inquiry` (`/my/inquiries`) |
| 사용자 콘텐츠 > **기타 사용자 콘텐츠** | 예 | 예 | 앱 기능 | 자기소개 `bio`, 팀 소개, 경기 후기(평점+정해진 태그, `submit-review.dto.ts`), 경기 기록 |
| 검색 기록 | 예 | 예 | 앱 기능 | `V1User.searchHistories` (`/search`) |
| 식별자 > **사용자 ID** | 예 | 예 | 앱 기능 | 계정 id, 세션 쿠키 `teameet_v1_session` |
| 식별자 > **기기 ID** | 예 | 예 | 앱 기능 (푸시 발송) | `V1PushDevice.installationId`·`token`(APNs)·`deviceModel`·`appVersion`, 셸 `Push/InstallationIdentity.swift` |
| 구입 항목 > **구입 내역** | 예 (주 2) | 예 | 앱 기능 | 대회 참가비 입금 상태 `V1TournamentPayment` |
| 사용 데이터 > **제품 상호 작용** | 예 | **아니요** (주 3) | 분석 | Google Analytics 4 — `components/providers/google-analytics.tsx`, 이벤트 `lib/analytics.ts` `trackEvent` (예: `match_view`, `team_create_complete`). 프로덕션 번들에 측정 ID 가 실제로 들어 있음을 확인(2026-09-25) |
| 진단 > **기타 진단 데이터** | 예 | 예 | 앱 기능 | 클라이언트 오류 수집 `error-logs/error-log.service.ts` (`userId`, `userAgent` 저장) |
| 기타 데이터 유형 | 예 | 예 | 앱 기능 | 생년월일·성별 `V1UserProfile.birthDate`/`gender`, 종목·포지션·실력 레벨 |

**수집하지 않음으로 답할 것:** 건강 및 피트니스, 금융 정보(결제 수단·카드 — 앱 안 결제 없음), 민감한 정보,
연락처(주소록), 브라우징 기록, 음성·오디오, 게임 플레이 콘텐츠, 광고 데이터, 충돌 데이터(Crashlytics·Sentry 없음 —
`apps/v1_web/package.json`·`apps/v1_api/package.json` 에 관련 의존성 없음), 성능 데이터, 물리적 주소.

### 주석

1. **정확한 위치** — 좌표는 서버로 전송되지만 지역 판정 후 저장되지 않고, 홈 화면 날씨를 위해 Open-Meteo 에도
   전송된다(개인정보처리방침 11항). Apple 정의상 "실시간 처리 후 보관하지 않음"은 수집이 아니다. 다만 제3자
   (Open-Meteo)가 받은 좌표를 보관하는지 우리가 보증할 수 없으므로, **보수적으로 "정확한 위치 — 수집, 연결 안 됨,
   앱 기능"을 추가로 신고하는 것도 타당하다.** 사용자 판단.
2. **구입 내역** — 참가비는 앱 밖 계좌이체이고 앱은 입금 여부만 기록한다. 신고하지 않아도 되는 해석도 있으나,
   입금 상태가 계정과 묶여 저장되므로 신고를 권한다.
3. **GA 연결 여부** — GA 설정에 `user_id` 를 넘기는 코드가 없다(`google-analytics.tsx` 의 `gtag('config', id, { send_page_view: false })`).
   이벤트 파라미터는 `matchId`·`teamId` 같은 콘텐츠 id 뿐이다. 그래서 "연결 안 됨"으로 적었다. 나중에 `user_id` 를
   붙이면 "연결됨"으로 바꿔야 한다.
4. **Android 전용** — FCM 토큰·기기 제조사는 Android 에만 해당한다(개인정보처리방침 11항). iOS 는 위 "기기 ID" 행이 APNs 에 대응한다.

## 3. 추적(Tracking)과 ATT 판정

**결론: 추적하지 않음 → `AppTrackingTransparency` 권한 요청 불필요, "추적에 사용" 전 항목 "아니요".**

| 확인 항목 | 결과 | 근거 |
|---|---|---|
| 광고 SDK·IDFA | 없음 | 셸에 SPM 패키지 0개(`apps/v1_ios/project.yml` 에 `packages:` 없음), `AdSupport`·`AppTrackingTransparency` import 없음 |
| 앱 안 광고 | 없음 | 웹에 광고 네트워크 스크립트 없음 (`googletagmanager` 는 GA 전용) |
| 데이터 브로커 공유 | 없음 | 개인정보처리방침 5항(제3자 제공 원칙적 금지) |
| GA 데이터의 광고 활용 | **사용자 확인 필요** | 코드는 광고 기능을 켜지 않는다. 그러나 **GA4 관리 화면의 "Google 신호 데이터" 와 Google Ads 연결**이 켜져 있으면 추적에 해당할 수 있다. 둘 다 꺼져 있음을 GA 관리자에서 확인할 것 |
| 셸의 기기 식별자 | 추적 아님 | `Push/InstallationIdentity.swift:34` 는 IDFV·IDFA 가 아니라 앱이 직접 만든 무작위 `UUID()` 를 Keychain 에 두고 푸시 설치 식별에만 쓴다 |
| 셸의 암호 API | 참고 | `CryptoKit` import 2곳은 Apple 로그인 nonce 해시(`Auth/AppleNonceHash.swift`) — OS 제공 기능이라 수출 규정 `ITSAppUsesNonExemptEncryption=false` 판단은 유지된다. 다만 `docs/ops/ios-release.md` 의 "CryptoKit 없음" 표는 이제 사실과 다르다 |

## 4. 개인정보처리방침과의 정합성 (제출 전 보완 권장)

App Store 심사자는 신고 내용과 방침을 대조한다(5.1.1). 현재 방침(`/terms?document=privacy`, 최종 변경 2026-08-31)은:

- **Android 절(11항)만 있고 iOS 절이 없다.** APNs 토큰·기기 모델·앱 버전, Apple 로그인(이름·이메일, 이메일 가리기 릴레이 주소),
  카메라·사진 선택(파일 선택기를 직접 실행한 경우만), 위치 권한 조건을 iOS 기준으로 적어야 한다.
- **Google Analytics 를 수탁자·제공 대상으로 명시하지 않는다**(6항은 위탁 업무를 일반적으로만 적음). "서비스 이용 통계 분석을 위해
  Google Analytics 를 사용하며 쿠키·기기·이용 기록이 Google 에 전송된다" 수준의 문장 추가를 권한다.
- 방침 2항의 "환불 계좌정보"는 코드에 저장 필드가 없다(`schema.prisma` 검색 결과 0건). 실제로 문의 채널로만 받는다면
  방침은 그대로 두되 App Privacy 는 "고객 지원" 항목으로 충분하다.

수정 위치: `apps/v1_web/src/components/auth/terms-client.tsx` 의 `getPrivacyPolicySections()` — 웹 변경이며 이 문서 PR 범위 밖이다.
