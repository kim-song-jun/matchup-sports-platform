# App Review 메모 초안 · 연령 등급 · UGC 대응 근거

> 입력 위치: App Store Connect > 팀밋 > 1.0 > **앱 심사 정보**(로그인 정보·연락처·메모).
> 심사자는 영어로 읽는 경우가 많아 메모 본문은 영어로, 이 문서의 설명은 한국어로 적었다.
> **데모 계정 비밀번호는 이 저장소(PUBLIC)에 절대 적지 않는다.** ASC 입력란에만 넣는다.

## 1. 로그인 정보 (ASC 입력란)

| 항목 | 값 |
|---|---|
| 로그인 필요 | 예 |
| 사용자 이름 | `<심사용 계정 이메일 — 저장소 밖에서 전달>` |
| 비밀번호 | `<심사용 계정 — 저장소 밖에서 전달>` |

데모 계정은 **프로덕션(`teameet.co.kr`)에** 있어야 한다 — 프로덕션 앱은 alpha 서버를 보지 않는다. 조건:
휴대폰 본인인증·약관 동의 완료, 팀 1개 이상 소속(가능하면 팀장), 참가한 매치·받은 후기·채팅방이 각각 1건 이상,
탈퇴 흐름을 끝까지 눌러볼 수 있는 상태(팀장이면 탈퇴가 제한되므로 **탈퇴 시연용 일반 계정을 하나 더** 두는 것을 권한다).

## 2. 심사 메모 (Notes) — 그대로 붙여넣기용

```
Teameet (팀밋) is a matching app for amateur futsal and soccer players in Korea: find pickup matches, run a team, challenge other teams, and join local tournaments with live scores.

SIGN-IN
- Use the demo account above (email login on the first screen). It is already phone-verified and belongs to a team with past matches, reviews and chats.
- Sign in with Apple is on the same login screen ("Apple로 계속하기"). New accounts created that way can browse everything; creating or joining matches additionally requires Korean mobile phone verification, which is a Korean identity-verification requirement for our service. Please use the demo account to test those actions.

ACCOUNT DELETION
- In the app: 마이(My) tab > 계정 설정(Account settings) > 회원 탈퇴(Delete account) > choose a reason > 탈퇴 요청.
- Login and push notifications stop immediately; the remaining data is deleted after an operator check. Web: https://teameet.co.kr/account-deletion

USER-GENERATED CONTENT (Guideline 1.2)
- Chat: tap the menu next to any message from another user to report the message or block the user. Blocked users' messages and notifications are hidden in every chat room; blocks can be managed from the chat screen.
- Team contact requests can be reported and the sending team blocked from the contact card.
- Any user, team or content can also be reported from 마이 > 문의하기 (category "신고"). Reports notify our operators immediately and are handled within 24 hours.
- Our Terms of Service prohibit abusive, hateful, sexual, threatening and spam content; violating accounts are warned, restricted or removed.

NATIVE FEATURES (why this is more than a website)
- Push notifications through APNs with an in-app explanation before the system prompt; tapping a notification opens the exact match, team or chat screen.
- Native Sign in with Apple sheet.
- Universal Links: login redirects and shared links open inside the app.
- Offline and server-error screens with retry and automatic reconnection when the network returns.
- Files (e.g. result sheets) are saved through the iOS share sheet.
- Swipe-back navigation, safe-area aware layout, and session restoration after relaunch.

PAYMENTS
- The app sells no digital goods. Tournament entry fees are for real-world events and are paid by bank transfer outside the app (Guideline 3.1.3(e)).

Contact for review: <연락처 — 저장소 밖에서 전달>
```

붙여넣기 전 확인할 것(사용자): ① "24시간 내 처리"를 운영이 실제로 지킬 수 있는지 — 못 지키면 문구를 바꾼다.
② 채팅의 신고 버튼 위치 설명이 현재 화면과 맞는지(`community-page.tsx:244` 의 메시지 옆 아이콘 버튼).
③ 탈퇴 경로의 메뉴 이름(`my.view-model.ts:80`·`:112` — "계정 설정" > "회원 탈퇴")이 프로덕션 승격 후 화면과 일치하는지.

## 3. 메모의 근거 (코드)

| 주장 | 근거 |
|---|---|
| Apple 로그인은 iOS 앱 로그인 화면에만 나타남 | `apps/v1_web/src/components/auth/apple-login-button.tsx` (`isNativeAppleSignInAvailable`), 배치 `auth-page.tsx:42` · 셸 `Auth/AppleSignInController.swift` |
| 앱 안 탈퇴 | `/my/settings/withdrawal` → `WithdrawalPageClient` → `POST /api/v1/me/withdrawal-request` (`profile.controller.ts:146`), 상태 `withdrawal_pending` 후 모든 인증 요청 차단 + Apple 토큰 해지(`v1-auth.guard.ts:89`) |
| 웹 탈퇴 안내 | `apps/v1_web/src/app/account-deletion/page.tsx` — **프로덕션 404, 승격 필요** |
| 채팅 신고·차단 | API `chat.controller.ts` `POST rooms/:roomId/messages/:messageId/report`·`/block`, `GET/DELETE blocked-users`; UI `components/community/chat-safety-dialog.tsx` |
| 신고 → 운영자 즉시 알림 | `chat.service.ts` 신고 시 `V1Inquiry(category='report')` + Slack 알림 outbox 이벤트 |
| 팀 컨택 신고·차단 | `components/community/team-contact-status-card.tsx:239` "신고하기", API `team-contacts.controller.ts` `contact-blocks` |
| 일반 신고(문의) | `components/my/my-inquiries-client.tsx:53` 카테고리 `report`, 사유 5종 `lib/v1-status-labels.ts:104` |
| 어드민 조치 | 신고 팀 차단 `admin.controller.ts:308`, 후기 숨김 `reviews.controller.ts:72` |
| 약관의 금지 행위 | `terms-client.tsx:480` (욕설·비방·차별·혐오·성희롱·위협·폭력, 광고·스팸) 및 제재 조항 |
| 푸시·사전 안내 | `Push/PushCoordinator.swift`, `Push/PushPromptView.swift`, 탭 착지 `Navigation/DeepLinkRoute.swift` |
| 유니버설 링크 | `Navigation/UniversalLink.swift`, entitlements `applinks:$(TEAMEET_APP_LINK_HOST)` |
| 오프라인·오류 화면 | `WebShell/LoadFailureView.swift`, `WebShell/NetworkReachability.swift`, `WebShell/WebShellFailurePolicy.swift` |
| 공유 시트 저장 | `WebShell/DownloadHandler.swift:98` `UIActivityViewController` |
| 스와이프 뒤로·안전영역·세션 복원 | `WebShellViewController.swift:209`, `WebShell/SafeAreaBridge.swift`, `WebShell/WebShellSessionStore.swift` |
| 외부 링크는 Safari 로 | `Navigation/AllowedNavigation.swift` (허용 목록 밖은 `UIApplication.shared.open`) |

## 위험 항목

제출 전에 판단이 필요한 것, 심각도 순.

1. **[거절 가능성 높음] 프로덕션 미승격** — 프로덕션에 Apple 로그인 API(`/api/v1/auth/apple/nonce` 404)·계정 삭제 안내(404)·AASA(404)가 없다.
   이 상태면 4.8(Apple 로그인 버튼이 동작 안 함)·5.1.1(v)(삭제 경로 누락)로 거절된다. → `dev → main` 승격(사용자).
2. **[크래시 — #1280에서 해결] `NSCameraUsageDescription` 없음** — 사진 업로드 입력에서 "사진 찍기"를 고르면 강제 종료(2.1). README 1절.
3. **[5.1.1(v)] Apple 로그인 토큰 폐기 — 코드 준비됨, 키 등록 대기** — 셸이 `authorizationCode` 를 함께 넘기고
   (`AppleSignInController.swift`), 서버가 로그인 성공 직후 `/auth/token` 으로 교환해 refresh token 을 AES-256-GCM
   으로 봉인 저장한다(`apple-token.service.ts`). **탈퇴 요청 시점**(`POST /api/v1/me/withdrawal-request` 커밋 직후)에
   `/auth/revoke` 를 호출한다 — 운영자 최종 삭제는 기한이 없고 거치지 않는 경로도 있어서다. 해지 실패는 탈퇴를 막지
   않고 로그로 남는다. **키가 등록되기 전까지는 교환·해지가 꺼진 채로 동작**한다: 사용자가 Apple Developer >
   Keys 에서 Sign in with Apple 키(.p8)를 발급하고 GitHub secrets `APPLE_SIGN_IN_KEY_ID`·`APPLE_SIGN_IN_PRIVATE_KEY`·
   `APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY`(`openssl rand -base64 32`)를 등록해야 한다(팀 ID 는 `APNS_TEAM_ID` 재사용).
   키 등록 전에 로그인한 사용자는 저장된 토큰이 없어 해지 대상이 아니다 — 등록 후 다시 로그인해야 저장된다.
4. **[5.1.1(v)] 삭제는 "요청 → 30일 유예 → 삭제"** — Apple 은 수동 절차를 허용하되 "소요 시간을 알릴 것"을 요구한다.
   탈퇴 화면에 "탈퇴를 요청하면 30일 뒤 계정과 개인정보가 삭제돼요. 그 전에는 고객센터로 복구를 요청할 수 있어요."를
   보여 주고, 개인정보처리방침 v1.4 7절에 같은 30일 유예를 적었다(2026-09-26 사용자 결정). 유예 중 복구는 어드민이
   계정 상태를 `active` 로 되돌리는 경로다. 30일 뒤 삭제는 아직 자동 잡이 없어 **운영자가 어드민 삭제로 처리**해야 한다.
   `/account-deletion` 웹 안내에는 아직 기간 문구가 없다.
   또한 팀장·운영진은 탈퇴가 막힌다(`assertWithdrawable`) — 권한 이전 방법 안내가 화면에 있는지 확인.
5. **[1.2] 자동 필터 없음, 신고 버튼이 채팅·팀 컨택에만 있음** — 1.2 는 "부적절한 콘텐츠를 걸러내는 방법"을 요구한다.
   금칙어 필터가 코드에 없고(`v1_api/src` 검색 0건), 공개 프로필(`/users/[id]`)·매치 상세(`/matches/[id]`)·팀 소개에는
   신고 버튼이 없다(문의하기 경유만 가능). 어드민이 채팅 메시지를 숨기는 경로도 없다. 거절되면 메모의 "문의하기 > 신고"
   경로를 강조하고, 후속으로 프로필·팀 화면 신고 버튼과 금칙어 필터를 추가한다.
6. **[4.2] 최소 기능** — 위 "NATIVE FEATURES" 가 방어 재료다. 기존 분석은 `docs/ops/ios-release.md` "심사지침 4.2" 절.
7. **[2.1] 본인인증 벽** — 신규 가입자는 한국 휴대폰 인증 없이 쓰기 기능을 못 쓴다. 데모 계정으로 우회하도록 메모에 적었다.
8. **[#1280에서 해결] 위치 권한 문구 없음** — `NSLocationWhenInUseUsageDescription` 이 없어 위치 버튼이 iOS 에서 항상 실패한다. 거절 사유는 아니나 기능 결함.

## 연령 등급 설문 제안

ASC 의 현재 설문 항목(API `ageRatingDeclarations` 필드 기준, 전부 미답변 상태)에 대한 제안:

| 항목 | 제안 | 이유 |
|---|---|---|
| 자녀 보호 기능(Parental Controls) | 아니요 | 없음 |
| 연령 확인(Age Assurance) | 아니요 (사용자 확인) | 만 14세 이상 여부를 가입 시 동의로 받지만 연령을 검증하는 장치는 아님. 휴대폰 본인인증이 생년월일을 검증한다면 "예" 검토 |
| 무제한 웹 접근 | 아니요 | 셸은 허용 목록 밖 URL 을 Safari 로 넘긴다(`AllowedNavigation.swift`) |
| 사용자 생성 콘텐츠 | **예** | 채팅·팀 소개·프로필 사진 |
| 메시지 및 채팅 | **예** | 채팅·팀 컨택 |
| 광고 | 아니요 | 광고 없음 |
| 콘테스트 | 없음 (사용자 확인) | 실제 스포츠 대회(수상 포함)는 앱 내 경품 콘테스트와 다르다고 판단. 앱에서 상금·경품을 내걸면 "드묾" |
| 도박·모의 도박·루트박스 | 없음 / 아니요 | 없음 |
| 폭력(만화·사실적·잔혹) | 없음 | 스포츠 경기 기록뿐 |
| 성적 콘텐츠·노출, 선정적 주제 | 없음 | 없음 |
| 욕설·저속한 유머 | 없음 | 운영 콘텐츠에 없음(UGC 는 위에서 따로 신고) |
| 알코올·담배·약물, 공포, 무기 | 없음 | 없음 |
| 의료·건강·웰니스 | 없음 | 운동 참여 앱이나 건강 정보 제공 기능은 없음 |

산출 등급은 UGC·채팅 때문에 기본보다 올라갈 수 있다. **서비스는 만 14세 이상만 가입 가능**하므로(개인정보처리방침 4항),
산출 등급이 그보다 낮으면 "연령 등급 재정의"로 더 높은 등급을 고를지 **사용자가 결정**한다(가입 단계에서 이미 막고 있어 필수는 아님).
한국 등급(GRAC) 번호는 게임에만 해당하므로 비워 둔다.
