# Task 20261125: 한 사람 한 계정 — 카카오·애플·이메일 어느 쪽으로든 로그인

Status: In Progress
**Owner**: 오케스트레이터(Opus) → 서버·데이터 계층 레인(Sonnet), 화면 레인은 별도 웹 PR
**Created**: 2026-11-01
**Related**: [20261124-auth-recovery-account-linking.md](./20261124-auth-recovery-account-linking.md) (소셜 연결 API·"원래 계정에 로그인하면 자동 연결"까지 끝낸 앞선 작업)

## Context
앞선 작업(20261124)으로 이메일 가입자가 카카오·애플을 자기 계정에 붙일 수 있게 됐다(`POST /auth/link/kakao|apple|pending`).
반대 방향이 비어 있다. 카카오·애플로 가입한 사람은 **이메일 + 비밀번호 로그인을 더할 길이 없다.**
그 결과 같은 사람이 카카오 계정과 이메일 계정을 따로 만들거나, 소셜 로그인이 막혔을 때 다른 수단이 없다.

사용자 결정(2026-10-31, 5B): 한 사람이 계정 하나로 카카오·애플·이메일 + 비밀번호 어느 쪽으로도 들어온다.
연결 원칙은 바뀌지 않는다 — **새 로그인 수단은 그 사람이 로그인해 있는 계정에만 붙인다.**
휴대폰 번호만으로 계정을 찾아 붙이는 방식은 다시 검토했고 **다시 기각했다.** 번호는 재배정되므로(남이 쓰던 번호를 받은 사람)
번호 소유만으로 계정을 열면 낯선 사람에게 계정이 넘어간다(#133 에서 막은 것과 같은 위험).

## Goal
카카오·애플로 가입한 사람이 로그인한 채로 이메일을 인증하고 비밀번호를 정하면, 같은 계정이 이메일 로그인·이메일 비밀번호 재설정·휴대폰 계정 찾기에서
모두 이메일 로그인을 가진 계정으로 보인다. 서버·웹 데이터 계층·문서가 이번 PR이고, 화면은 이 위에 쌓는 별도 웹 PR이다.

## Original Conditions (must all be satisfied)
- [x] 한 사람 한 계정: 카카오·애플·이메일 + 비밀번호 어느 쪽으로도 로그인한다 (사용자 결정 5B)
- [x] 새 로그인 수단은 로그인한 계정에만 붙인다. 휴대폰 번호만으로는 계정 소유를 증명하지 않는다(번호 재배정 위험으로 다시 기각)
- [x] `POST /auth/link/email/request { email }` — 활성 이메일 신원이 이미 있으면 409 `SOCIAL_LINK_PROVIDER_EXISTS`, 다른 사용자가 `v1_users.email` 또는 이메일 신원 키로 쓰면 409 `EMAIL_CONFLICT`, 운영자 계정 거절, 로그인한 지 30분 초과 거절, 인증번호 발송(쿨다운·발송 상한 재사용)
- [x] `POST /auth/link/email/verify { code }` — 가장 최근 인증번호 대조(불일치·시도 상한·만료는 `VerificationService.confirm` 과 같은 코드), 소비 후 10분짜리 `emailLinkToken`(계정·이메일에 묶임) 반환
- [x] `POST /auth/link/email/complete { emailLinkToken, password, passwordConfirm }` — 가입과 같은 비밀번호 규칙, 한 트랜잭션에서 충돌 재확인(P2002 → `EMAIL_CONFLICT`)·가입과 같은 이메일 신원 생성·`v1_users.email`/`emailVerifiedAt` 갱신·상태 로그 `email_login_added`
- [x] 완료 뒤 이메일 로그인, 이메일 비밀번호 재설정(`/auth/recovery/email/*`), 휴대폰 계정 찾기의 `providers` 에 `email` 이 모두 동작하고 테스트로 증명한다
- [x] 로그인한 지 얼마 안 됐는지는 **`request` 에서만** 확인한다. `complete` 는 다시 확인하지 않고 10분짜리 `emailLinkToken` 이 창을 정한다 (사용자 결정, 아래 Ambiguity Log)
- [x] `emailLinkToken` 을 에러 로그 마스킹 키에 추가한다
- [x] 인증번호는 **목적에 묶는다**: `v1_verification_tokens.purpose`(`contact` | `email_login_link`, 기본 `contact`). 이메일 연결의 `verify` 는 연결용 코드만 받고, `/verification/*` 는 연락처용 코드만 받으며, 한쪽이 코드를 새로 만들어도 다른 쪽 코드는 폐기되지 않는다 (리뷰 지적: 연락처 코드로 최근 로그인 확인을 우회할 수 있었다)
- [x] 이메일 로그인이 추가되면 소셜 연결과 같은 보안 알림(`social_identity_linked`)을 같은 트랜잭션에서 남기고 커밋 뒤에 전달한다
- [x] 인증 메일은 전용 문구("로그인 이메일 연결 인증번호")를 쓴다
- [x] 메일을 보낼 수단이 없으면 `request` 는 `sent: true` 로 속이지 않고 503 `EMAIL_SEND_UNAVAILABLE` 로 답한다
- [x] 문서(`docs/api/domains/auth.md`·`auth-and-session.md`)와 웹 데이터 계층(타입·MSW·변이 훅)을 같은 PR에서 갱신한다. 화면은 이 PR에 넣지 않는다
- [ ] 화면: B안 — 전용 단계 흐름 `/my/settings/login-methods/email` (진행 막대, 화면당 질문 하나). **별도 웹 PR**
- [ ] 화면: 가입 화면의 "이미 가입한 번호" 카드에서 원래 계정으로 로그인한 직후, 입력해 둔 이메일을 채운 채 위 흐름으로 바로 이동한다. **별도 웹 PR**
- [ ] 화면: 기존 연결된 줄의 라벨 "이메일 로그인"을 "이메일·비밀번호"로 바꾼다. **별도 웹 PR**
- [ ] 화면: 완료 화면은 가입 완료 그래픽을 재사용한다. **별도 웹 PR**
- [ ] 화면: "방금 입력한 이메일을 붙일까요?" 제안은 한 번만 보인다. **별도 웹 PR**

## User Scenarios
### Scenario 1: 카카오로 가입한 사람이 이메일 로그인을 더한다
As a 카카오로 가입한 회원, I want to 이메일과 비밀번호로도 로그인하고 싶다 so that 카카오가 막혀도 내 계정에 들어올 수 있다.

Steps:
1. 설정 › 로그인 방법에서 "이메일·비밀번호"를 연결한다.
2. 이메일을 입력하면 인증번호가 메일로 온다.
3. 인증번호를 입력하고, 비밀번호를 두 번 입력한다.

Expected result: 같은 계정이 이메일·비밀번호로도 로그인된다. 입력한 이메일이 계정 이메일이 된다.

### Scenario 2: 이메일로 가입하려다 이미 가입한 번호임을 알게 된 사람
가입 화면에서 이메일·비밀번호를 입력하고 휴대폰 인증을 마쳤더니 그 번호가 이미 가입돼 있다.
원래 계정(예: 카카오)으로 로그인하면, 방금 입력한 이메일을 그 계정에 붙일지 한 번 묻는다. 이메일은 그 탭의 `sessionStorage` 에만 두고 **비밀번호는 어디에도 저장하지 않는다**(붙일 때 비밀번호를 다시 정한다).

### Scenario 3: 다른 계정이 쓰는 이메일
인증번호를 보내기 전에 `EMAIL_CONFLICT` 로 막힌다. 그 계정에 대해 다른 것은 알려 주지 않는다.

### Scenario 4: 오래전에 로그인한 세션
`request` 에서 `RECENT_LOGIN_REQUIRED`(30분). 다시 로그인한 뒤 이어서 한다.

## Test Scenarios
### Happy path
- [x] request → verify → complete → 새 비밀번호로 이메일 로그인 성공 (단위: 인메모리 DB + 실제 scrypt, 통합: 실제 Postgres 16 + HTTP)
- [x] 완료 뒤 이메일 비밀번호 재설정이 동작하고 새 비밀번호로 로그인된다 (이전 쿠키는 끊긴다)
- [x] 완료 뒤 휴대폰 계정 찾기 `providers` 에 `email`, `hasPassword: true`
- [x] 계정이 이미 가진 연락처 이메일(카카오가 준 주소)을 그대로 로그인 이메일로 쓸 수 있다
### Edge cases
- [x] 인증번호를 다시 요청하면 이전 코드는 못 쓴다 / 쿨다운 30초 / 24시간 발송 상한(주소당 5, 계정당 10)
- [x] 메일 발송 실패 시 코드가 남지 않아 곧바로 다시 요청할 수 있다
- [x] 같은 이메일을 두 계정이 동시에 `complete` → 한쪽만 성공, 다른 쪽 `EMAIL_CONFLICT`, 반쯤 쓰인 행 없음 (통합)
- [x] 철회된 운영 권한(`revoked`)은 통과, 활성 운영 권한은 거절
- [x] `complete` 는 세션 나이를 보지 않는다 (토큰이 창을 정한다)
- [x] 연락처 코드(`/verification/email/request`)로는 연결을 끝낼 수 없다 / 연결 코드는 `/verification/email/confirm` 에서 거절된다 / 한쪽 코드를 새로 받아도 다른 쪽 코드는 그대로 쓸 수 있다 (단위 + 통합, 실제 HTTP 로 오래된 세션이 우회를 시도)
- [x] 메일이 못 나가는 서버는 503 `EMAIL_SEND_UNAVAILABLE`, 완료 시 알림이 저장되지 않으면 연결도 취소된다
### Error paths
- [x] 활성 이메일 신원이 있는 계정 `SOCIAL_LINK_PROVIDER_EXISTS`
- [x] 다른 사용자가 `v1_users.email` 로 쓰는 주소 / 이메일 신원 키로 쓰는 주소 `EMAIL_CONFLICT` (메일 발송·토큰 생성 없음)
- [x] 운영자 계정 `SOCIAL_LINK_ADMIN_FORBIDDEN`, 정지·삭제 `PERMISSION_DENIED`, 가입 미완료 `SIGNUP_INCOMPLETE`
- [x] 세션 30분 초과 `RECENT_LOGIN_REQUIRED` — 아무것도 읽거나 보내기 전에
- [x] 틀린 코드·시도 소진·만료 `VERIFICATION_CODE_MISMATCH`/`TOO_MANY_ATTEMPTS`/`NO_PENDING`
- [x] 다른 계정의 토큰, 주소를 바꾼 토큰, 만료된 토큰 `EMAIL_LINK_TOKEN_INVALID`
- [x] 비밀번호 두 칸이 다르거나 8자 미만 — DTO 400 `VALIDATION_ERROR`
- [x] DB 유니크 위반(P2002) → `EMAIL_CONFLICT` 이고 아무것도 남지 않는다 (단위: P2002 주입, 통합: 실제 유니크 인덱스)
### Mock data updates needed
- [x] `apps/v1_web/src/test/msw/auth-link-handlers.ts` 에 세 엔드포인트 핸들러(`EMAIL_LINK_MSW` 시나리오 값, 서버 DTO와 같은 검증)
- [x] `apps/v1_web/src/types/api.ts` 응답·본문 타입, `hooks/use-v1-api.ts` 변이 훅 3개와 훅 테스트
- [x] `V1VerificationToken` 에 `purpose` 가 생겼다(마이그레이션 `20261101090000_v1_verification_token_purpose`). 이 표의 행을 직접 만드는 픽스처·시드는 없다(통합 스펙은 기본값 `contact` 를 쓰고, 정리용 `deleteMany` 만 있다)
- [x] 웹 MSW 에 `EMAIL_LINK_MSW.emails.mailUnavailable`(503), `lib/auth-link-errors.ts` 에 `isEmailSendUnavailable`

## Parallel Work Breakdown
### Backend
- [x] `auth/link-caller-guards.ts` — 최근 로그인·운영자·상태 검사를 소셜 연결과 이메일 연결이 함께 쓰도록 한 곳으로 모음(복사 없음)
- [x] `auth/email-link-token.ts`, `email-link.service.ts`, `email-link.controller.ts`, `dto/link-email.dto.ts`, `dto/account-password.decorator.ts`(가입과 같은 비밀번호 규칙을 한 곳에)
- [x] `VerificationService` — 재발송 쿨다운·코드 대조를 이름 붙은 메서드로 분리해 이메일 연결이 재사용(휴대폰 동작은 그대로), `VerificationModule` 이 서비스를 내보냄
- [x] `common/logging/mask-sensitive.ts` 에 `emailLinkToken`
- [x] 목적 묶음: `prisma/schema.prisma` 의 `V1VerificationPurpose` + `V1VerificationToken.purpose`, 추가만 하는 멱등 마이그레이션(enum 생성은 `duplicate_object` 가드, 열은 `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT 'contact'`), `VerificationService` 의 대조·소비·폐기·발송을 목적으로 한정
- [x] 전용 메일 문구(`login_email_link`), 발송 불가 503, 완료 시 알림 (`EmailLinkService`)
### Frontend (데이터 계층만)
- [x] 타입·MSW·변이 훅 — 화면 없음
- [ ] 화면(B안)과 가입 → 로그인 → 이메일 붙이기 진입점은 이 위에 쌓는 **별도 웹 PR**  ← UI 변경이므로 사용자가 B안을 이미 골랐고(아래), 구현 PR 에서 갤러리를 첨부한다
### Docs
- [x] `docs/api/domains/auth.md` (엔드포인트·에러 코드·보안 노트), `docs/api/auth-and-session.md`
### Sequential
- [x] 통합 스펙을 일회용 Postgres 16 컨테이너에서 실행(컨테이너는 끝난 뒤 삭제)
- [ ] 머지 후 alpha 실측 — 화면 PR 이후 실제 계정으로(데이터를 바꾸므로 사용자 승인 후)

## Acceptance Criteria
- [x] Original conditions 중 서버·데이터 계층·문서 항목 전부 충족, 화면 항목은 별도 PR
- [x] Test scenarios 전부 green (단위 + 통합 + 웹 훅)
- [x] 범위 내 tech debt 해결 — 최근 로그인 검사가 소셜 연결 서비스 안에만 있던 것을 공용으로, 비밀번호 규칙을 한 곳으로
- [x] Security 노트 반영
- [x] Mock data 업데이트 완료 (스키마 변경 없음)
- [ ] Code review: Critical=0, Warning=0
- [ ] 화면 PR: A·B·C 3안 → 사용자 선택(B안 선택 완료) → 구현, 갤러리 첨부

## Tech Debt Resolved
- `assertRecentLogin`·운영자/상태/가입 미완료 검사가 `AccountLinkService` 의 비공개 함수·인라인 코드였다. 이메일 연결이 복사하지 않고 쓰도록 `link-caller-guards.ts` 로 옮겼다.
- 비밀번호 규칙(`@IsString() @MinLength(8)`)이 DTO 마다 흩어져 있었다. 가입(`RegisterDto`)과 이메일 연결이 같은 `IsAccountPassword` 를 쓴다. (재설정 DTO 두 개는 자기 한글 메시지를 달고 있어 이번에는 건드리지 않았다.)
- `VerificationService.requestPhone` 안에 인라인이던 재발송 쿨다운과 `confirm` 안에 인라인이던 코드 대조를 이름 붙은 메서드로 분리했다(동작 동일).

## Security Notes
- **소유 증명**: 계정은 로그인한 세션으로, 이메일 주소는 메일로 받은 인증번호로 증명한다. 휴대폰 번호는 계정 소유를 증명하지 않는다(번호 재배정으로 낯선 사람에게 계정이 넘어가는 위험이라 다시 기각).
- **최근 로그인 확인은 `request` 에서만**(사용자 결정): `complete` 는 다시 확인하지 않는다. 이 결정이 성립하려면 `verify` 가 받는 코드가 반드시 최근 로그인을 통과한 `request` 가 만든 것이어야 한다. 처음 구현은 이 전제가 깨져 있었다 — `verify` 가 이메일 채널의 미사용 코드를 아무거나 받았고, 세션 나이를 보지 않는 `/verification/email/request` 가 계정 이메일(`PATCH /me/profile` 로 자유롭게 정할 수 있다)로 코드를 만들어 주었으므로 30분 넘은 세션이 연결을 끝낼 수 있었다. 그래서 **코드를 목적에 묶었다**: 코드마다 `purpose` 를 저장하고(`contact` | `email_login_link`), 대조·소비·폐기를 모두 한 목적 안에서만 한다. 연락처 코드는 `verify` 에서, 연결 코드는 `/verification/email/confirm` 에서 `VERIFICATION_NO_PENDING` 으로 거절되고, 한쪽이 새 코드를 만들어도 다른 쪽 코드는 폐기되지 않는다. 쿨다운과 24시간 발송 상한만은 목적을 가리지 않고 센다(막으려는 것은 그 주소로 나간 메일의 양이다). `emailLinkToken` 은 메일로 받은 연결용 인증번호를 맞춘 뒤에만 나오고, 10분 뒤 만료되며, 계정과 주소에 묶여 있다. 그 창 안에서 세션을 훔친 쪽이 비밀번호를 정해 로그인 수단을 더할 수 있다는 위험은 이 10분으로 한정된다. 나중에 다시 확인하기로 바꾸면 컨트롤러가 `request` 처럼 세션 나이를 넘기게 하고 `complete` 맨 앞에 `assertRecentLogin` 한 줄을 더하면 된다.
- **토큰**: `V1_SESSION_SECRET` 으로 서명한 무상태 토큰(`verification/proof-token.ts`), 목적 접두어 `email_login_link`, 계정은 키 달린 다이제스트로만 싣는다. 다른 증명(휴대폰·이메일 재설정·소셜 연결)과 서로 통하지 않는다. 비밀 값이 없으면 발급은 예외, 검증은 거절(fail-closed). 에러 로그에서 `emailLinkToken`·`password`·`passwordConfirm`·`code` 는 가려진다.
- **남용**: 메일 발송 경로는 분당 5회 + 주소 쿨다운 30초 + 24시간 상한(주소당 5, 계정당 10). 6자리 코드는 토큰당 5회 시도 + 분당 10회.
- **열거**: 다른 계정이 쓰는 주소는 `EMAIL_CONFLICT` 하나로만 알린다. 로그인한 사용자만 호출할 수 있고 `GET /auth/check-email` 이 이미 공개로 같은 사실을 답한다.
- **동시성**: 계정 행 `FOR UPDATE` + advisory lock(계정 → 주소), 마지막 방어선은 `v1_users.email`·`(provider, providerUserKey)` 유니크 인덱스(P2002 → `EMAIL_CONFLICT`). 가입은 잠금을 잡지 않으므로 인덱스가 그 경합을 막는다.
- **운영자 계정**은 브라우저 세션으로 로그인 수단을 바꾸지 않는다(`SOCIAL_LINK_ADMIN_FORBIDDEN`).
- 비밀번호는 가입과 같은 scrypt 해시로만 저장하고 응답·로그에 남기지 않는다. 웹은 비밀번호를 저장하지 않는다(진입점 2의 `sessionStorage` 에는 이메일만).

## Risks & Dependencies
- 운영 메일 발송 권한(SES)은 20261124 L0 에서 열었다. 발송이 막히면 `503 EMAIL_SEND_FAILED` 가 나고 코드는 남지 않는다.
- `purpose` 열은 이 PR 의 마이그레이션이 만든다(추가만 하는 변경이라 롤링 배포 중 옛 API 가 쓴 행도 기본값 `contact` 가 된다). 옛 API 는 연결용 코드를 만들 일이 없다.
- 보안 알림의 알림함 행은 연결과 같은 트랜잭션에 저장하므로, 저장이 실패하면 연결도 취소된다(소셜 연결과 같은 선택).
- 같은 계정의 `(user_id, provider)` 유니크가 없다는 앞선 작업의 후속(스키마)은 그대로다. 이메일 신원은 계정 잠금으로 직렬화한다.
- 화면 PR 은 이 PR 위에 쌓는다(타입·훅·MSW 를 그대로 쓴다).

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-31 | 사용자 | 한 사람이 어느 수단으로든 같은 계정에 들어오게 할 때 연결 원칙은? | 5B — 로그인한 계정에만 새 수단을 붙인다. 휴대폰 번호만으로 계정을 찾아 붙이는 방식은 번호 재배정으로 낯선 사람에게 계정이 넘어가는 위험이라 다시 기각 |
| 2026-10-31 | 오케스트레이터 | `complete` 도 최근 로그인을 다시 확인하나? | 사용자 결정(2026-11-01): `request` 에서만 확인. `complete` 는 확인하지 않고 10분짜리 `emailLinkToken` 이 창을 정한다 |
| 2026-10-31 | 오케스트레이터 | 화면 안: A 인라인 / B 전용 단계 흐름 / C 바텀시트 | 사용자 결정(2026-11-01): B — `/my/settings/login-methods/email`, 가입처럼 진행 막대와 화면당 질문 하나 |
| 2026-10-31 | 오케스트레이터 | 가입 화면의 "이미 가입한 번호" 카드에서 원래 계정으로 로그인한 뒤 | 사용자 결정(2026-11-01): 입력해 둔 이메일을 채운 채 위 흐름으로 바로 이동. 이메일은 그 탭의 `sessionStorage` 에만 두고 비밀번호는 저장하지 않는다 |
| 2026-10-31 | 오케스트레이터 | 연결된 줄의 기존 라벨 "이메일 로그인" | 사용자 결정(2026-11-01): "이메일·비밀번호"로 바꾼다 |
| 2026-10-31 | 오케스트레이터 | 완료 화면의 그래픽 | 사용자 결정(2026-11-01): 가입 완료 그래픽 재사용 |
| 2026-10-31 | 오케스트레이터 | "방금 입력한 이메일을 붙일까요?" 제안을 몇 번 보이나 | 사용자 결정(2026-11-01): 한 번만 |
| 2026-11-01 | 서버 레인 | 이메일 연결 시 보안 알림(`social_identity_linked` 같은)을 보낼지 | 조정자 결정(2026-11-01): 소셜 연결이 이미 알리므로 이메일 로그인 추가도 같은 방식으로 알린다 — 같은 타입(`name` = "이메일·비밀번호")을 같은 트랜잭션에서 만들고 커밋 뒤 전달. 웹 알림 목록은 서버의 제목·본문과 `targetType`(`system`) 으로 그리므로 화면 쪽 새 라벨은 필요 없다 |
| 2026-11-01 | 서버 레인 | 인증 메일 문구를 로그인 수단 추가용으로 따로 둘지 | 조정자 결정(2026-11-01): 전용 문구 — 제목 "[Teameet] 로그인 이메일 연결 인증번호", `OtpEmailPurpose` 에 `login_email_link` 추가(발송 실패 알림 라벨 포함) |
| 2026-11-01 | 독립 리뷰 | `verify` 가 이메일 채널의 아무 미사용 코드나 받아 `/verification/email/request` 코드로 최근 로그인 확인을 우회할 수 있다 | 조정자 결정(2026-11-01): 코드를 목적에 묶는다(`purpose` 열 + 마이그레이션). 최근 로그인은 `request` 에서만 확인한다는 사용자 결정은 그대로 — 목적 묶음으로 그 전제가 다시 성립한다 |
| 2026-11-01 | 독립 리뷰 | 메일을 보낼 수단이 없는 서버가 `sent: true` 로 답한다 | 조정자 결정(2026-11-01): 로그인 추가 인증과 같게 503 `EMAIL_SEND_UNAVAILABLE` |
