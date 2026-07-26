# 휴대폰 인증 MT SMS OTP 전환 (솔라피) — 설계

**작성일:** 2026-07-25 · **대상 스택:** v1 (`apps/v1_api` + `apps/v1_web`, alpha 전용)

## Context / 배경

회원가입(이메일·카카오) 휴대폰 번호 인증을 **옥토모 무료 MO(polling)**로 구현했으나, 옥토모 `messageExists` 반영이 **간헐적으로 수 분 지연**되어 코드 5분 TTL을 초과 → 인증 실패가 발생한다(실폰 테스트로 확인: 발신번호 매칭·본문은 정상, 순수 옥토모 반영 지연이 원인). GPT-5.6 Pro 조사 결론도 "무료 MO = polling+비동기 반영 → 몇 분 지연은 **구조적 문제**, 실시간 인증에 부적합"으로 동일.

→ **MT SMS OTP**(서버가 인증번호를 발송, 사용자가 입력)로 전환한다. 발송은 우리가 하므로 즉시·지연 없음. **원래 MT/OTP 구조가 email 경로에 그대로 살아있어** 재활용한다(옥토모 도입 시 우회한 것을 원복).

## Goal

옥토모 MO(polling) → **솔라피(SOLAPI) SMS OTP(MT)** 전환. 발신번호는 어댑터로 추상화(추후 알리고 등 추가 가능). 옥토모 관련 코드는 **완전 제거**.

## 재활용 자산 (이미 존재)

- `VerificationService.issue(channel, userId, target)` — 6자리 숫자 OTP 생성 → `codeHash`(bcrypt) 저장 → `V1VerificationToken` → `dispatcher.send()`.
- `VerificationService.confirm(user, channel, code)` — 코드 대조(`verifyPassword`) + `attemptCount`(MAX 5) + `phoneVerifiedAt`/`emailVerifiedAt` 세팅 + `$transaction`.
- `VerificationDispatcherService.send(channel, target, code)` — 발송 스텁(주석: "실제 provider 연동 시 send()에 어댑터 1개만 끼우면 된다"). `V1_VERIFICATION_DEV_ECHO`.
- `V1VerificationToken` 모델(codeHash·target·channel·expiresAt·attemptCount·consumedAt), TTL 5분.
- **email 경로가 이미 이 MT 흐름을 사용 중** — phone도 동일하게 되돌린다.

## 아키텍처

### 1. SMS 발송 어댑터 (신규)
- 인터페이스 `SmsSender { send(to: string, text: string): Promise<void>; enabled: boolean }`.
- `SolapiSmsSender` — 솔라피 REST(`POST https://api.solapi.com/messages/v4/send`, HMAC-SHA256 `Authorization: HMAC-SHA256 apiKey=…, date=…, salt=…, signature=…`), `from`=발신번호.
- `dispatcher.send(channel, target, code)`: `channel==='phone'`이고 어댑터 `enabled`면 SMS 발송(본문 예: `[Teameet] 인증번호 123456 (5분 내 입력)` — iOS 자동완성 고려해 코드 위치·형식 조정). 키 없으면 **dev-echo**(로그 + 응답 `devCode`).
- `channel==='email'`은 기존 로그 스텁 유지(이번 범위 밖).

### 2. 백엔드 phone MT 원복
- `VerificationService.requestPhone` → `phoneVerification.issueChallenge`(옥토모) 대신 **`this.issue('phone', user.id, phone)`**.
- `VerificationService.confirmPhoneArrived`(폴링) **제거** → `phone/confirm`은 **`this.confirm(user, 'phone', code)`**.
- `verification.controller` `phone/confirm`: `ConfirmPhoneArrivedDto`(phone) → **`ConfirmVerificationDto`(code)** 로 교체(또는 phone+code).

### 3. public `/auth/phone/*` (이메일 회원가입, pre-account) MT 전환
- 현재 옥토모(`phone-verification.service` polling + `V1PhoneVerificationChallenge`). pre-account라 userId 없음 → **phone 기준 OTP 저장** 필요.
- 결정: `V1PhoneVerificationChallenge` 모델을 **MT 스키마로 재정의**(옥토모 `code`(평문)·`channel` 제거 → `codeHash`·`attemptCount` 추가, `verifiedAt` 유지) — 마이그레이션 동반. `phone` unique 유지.
- `phone-verification-public.controller`: `issue`(옥토모 발급/QR) → **OTP 생성+`dispatcher.send`(SMS 발송)**, `verify`(폴링) → **입력 code 대조**. 성공 시 기존 `proofToken` 발급 흐름 유지(register 소비).

### 4. 옥토모 완전 제거
- 삭제: `octomo.client.ts`(+spec), `phone-verification.service.ts`(polling, +spec), `apps/v1_web/src/lib/octomo-sms-link.ts`, `apps/v1_web/src/lib/device-kind.ts`(카드 전용이면).
- `V1PhoneVerificationChallenge`: 옥토모 필드 제거(위 §3 마이그레이션에 흡수).
- 환경변수 `OCTOMO_API_KEY`/`OCTOMO_API_BASE`/`OCTOMO_DEST_NUMBER`/`V1_VERIFICATION_DEV_ECHO`(echo는 유지) — deploy 배선(`deploy-alpha.yml`, `docker-compose.prod.yml`, `.env.prod.example`, `configuration.ts`) 정리.
- 관련 문서/메모리 갱신.

### 5. 프론트 카드 UX
- `phone-verification-card.tsx`: QR·딥링크·폴링·복사 전부 제거 → **표준 OTP UX**: ①"인증번호 받기" 버튼(→ issue=SMS 발송) → ②`6자리` 입력 필드(`inputMode="numeric"`, `autocomplete="one-time-code"`, `maxLength=6`) → ③"확인"(→ confirm) → 완료. 재전송(쿨다운), 남은시간, 에러 표시.
- 훅: `useV1PhoneIssue`(발송), `useV1PhoneVerify`(코드 입력 → proofToken/verified). authed/public 양쪽.

### 6. 환경변수 (운영 준비물 — 사용자)
- `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, `SOLAPI_SENDER_NUMBER`(발신번호 사전등록 — 전기통신사업법 §84조의2). 없으면 dev-echo.

## 스코프

- alpha(v1) 전용. authed(`/verification/phone/*`) + public(`/auth/phone/*`) 두 경로 모두 MT.
- **skeleton-first**: ① SmsSender 어댑터+솔라피+dev-echo → ② 백엔드 phone MT 전환(authed+public) → ③ 프론트 OTP UX → ④ 옥토모 제거 → ⑤ 테스트.

## Test Scenarios

- **happy**: issue → dev-echo devCode 반환 → confirm(정확 code) → verified/proofToken. authed는 `phoneVerifiedAt` 세팅, public은 proofToken→register 소비.
- **edge**: 만료(5분 후 confirm) → `VERIFICATION_NO_PENDING`. attemptCount 5회 초과 → `TOO_MANY_ATTEMPTS`. 재발급 시 이전 토큰 consume.
- **error**: 코드 불일치 → `VERIFICATION_CODE_MISMATCH`. 번호 충돌(`PHONE_CONFLICT`).
- **adapter**: 키 있으면 솔라피 HTTP 호출(mock), 없으면 dev-echo. 발송 실패 시 사용자에게 명확한 에러(fire-and-forget 아님 — 발송 실패는 사용자 알림).
- **mock updates**: 옥토모 관련 테스트/픽스처 제거, MT 테스트 추가.

## Security Notes

- OTP는 `codeHash`(bcrypt)로만 저장(평문 저장 안 함 — 옥토모 MO는 평문 저장이 불가피했으나 MT는 hash 가능). attemptCount 제한. TTL 5분.
- 솔라피 API 시크릿은 서버 전용(프론트 노출 금지). 발송 rate-limit(재전송 쿨다운).
- 발신번호 사전등록(법규).

## Risks & Dependencies

- **외부 의존**: 솔라피 계정·API키·발신번호 등록 필요(사용자). 준비 전엔 dev-echo로 개발/검증.
- **마이그레이션**: `V1PhoneVerificationChallenge` 스키마 변경(옥토모→MT). idempotent + drift 게이트 통과 필요.
- **两 경로**: authed/public 모두 바꿔야 회원가입(카카오/이메일) 전부 동작.

## Ambiguity Log

- public pre-account OTP 저장소: `V1VerificationToken`(userId 필수)이 아닌 `V1PhoneVerificationChallenge`(phone 기준) 재정의로 결정.
- SMS 본문 형식(iOS 자동완성): 구현 시 확정(코드 4~6자리, 도메인/형식).
