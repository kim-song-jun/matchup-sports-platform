# Auth And Session

> **v0 기준 서술 — v1 확인 필요.** 이 문서의 엔드포인트·에러 코드·상세 계약은 레거시 `apps/api`/`apps/web` 시절에 작성됐다. 파일 경로는 v1(`apps/v1_api`/`apps/v1_web`)로 갱신했지만, 계약 내용 자체가 v1 실제 동작과 일치하는지는 이번 변경에서 검증하지 않았다(2026-09-27, docs/api 레거시 분리 작업).

## 목적

프론트가 인증 토큰 발급/갱신/만료 처리 흐름을 추측 없이 구현하도록 하는 문서.

## 인증 endpoint 요약

| Method | Path | Auth | 설명 |
|---|---|---|---|
| POST | `/auth/register` | No | 이메일 회원가입 |
| POST | `/auth/login` | No | 이메일 로그인 |
| POST | `/auth/dev-login` | No | 개발 전용 로그인 |
| POST | `/auth/kakao` | No | 카카오 로그인 |
| POST | `/auth/kakao/token` | No | 카카오 액세스 토큰 로그인(네이티브 SDK) — 자세한 계약은 `domains/auth.md` |
| POST | `/auth/naver` | No | 네이버 로그인 |
| POST | `/auth/apple` | No | 애플 로그인 시도 |
| POST | `/auth/link/kakao` | Yes | 로그인한 계정에 카카오 로그인 연결(웹 `code`+`redirectUri` / 네이티브 `accessToken`) — 자세한 계약은 `domains/auth.md` |
| POST | `/auth/link/apple` | Yes | 로그인한 계정에 Apple 로그인 연결 — 자세한 계약은 `domains/auth.md` |
| POST | `/auth/link/pending` | Yes | 소셜 로그인 충돌 409 의 `linkToken` 으로, 원래 계정에 로그인한 직후 그 소셜 로그인을 자동 연결 — 자세한 계약은 `domains/auth.md` |
| POST | `/auth/link/email/request` | Yes | 소셜 계정에 이메일·비밀번호 로그인을 더하기 1단계: 입력한 주소로 인증번호 발송(로그인한 지 30분 이내) — 자세한 계약은 `domains/auth.md` |
| POST | `/auth/link/email/verify` | Yes | 2단계: 인증번호를 맞추고 10분짜리 `emailLinkToken` 받기 |
| POST | `/auth/link/email/complete` | Yes | 3단계: `emailLinkToken` + 비밀번호로 이메일 로그인 연결, 그 주소가 계정 이메일이 된다 |
| GET | `/auth/me` | Yes | 현재 사용자 조회 |
| POST | `/me/withdrawal-request` | Yes | 탈퇴 신청(30일 유예 뒤 삭제) — 자세한 계약은 `domains/users.md` |
| POST | `/auth/withdrawal/cancel` | No(토큰이 자격) | 탈퇴 신청 철회 — 자세한 계약은 `domains/auth.md` |

## 토큰 발급 응답 계약

`register`, `login`, `dev-login`, 소셜 로그인 성공 시 `data`에 다음이 포함된다.

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": "uuid",
    "nickname": "닉네임"
  }
}
```

## 세션 갱신 없음

`/auth/refresh` 라우트는 없다. 세션은 `teameet_v1_session` 쿠키 하나이고 요청마다 `V1AuthGuard`가 그 쿠키에서 다시 해석한다(`domains/auth.md` "Session Model").

## 프론트 401 처리

`apps/v1_web/src/lib/api-client.ts` 기준: 응답이 `401`(또는 `code = UNAUTHENTICATED`)이면 `isUnauthenticatedError`가 참이 되고, 화면은 재발급 없이 로그아웃으로 처리한다. 5xx·네트워크 오류는 세션 문제가 아니므로 재시도 대상이다.

## dev-login 계약

- `NODE_ENV=production`에서는 `403`
- `test`/`development`에서는 nickname 기반 유저 자동 생성/로그인

## 권한/세션 에러 구분

- `401`: 토큰 없음/만료/유효하지 않음
- `403`: 인증은 되었지만 정책 위반(예: prod에서 dev-login)

`V1AuthGuard` 의 403 판정 순서: 가입 진행 중(`SIGNUP_INCOMPLETE`) → 약관 재동의(`TERMS_RECONSENT_REQUIRED`) → 가입 정보·관심 종목 보류(`ACTIVITY_PROFILE_REQUIRED`, `details.missing` = `phone`·`basicProfile`·`interestSport` 중 남은 것, `details.next.route` = 첫 항목의 화면 `/signup/social` 또는 `/onboarding/sport`) → 휴대폰 인증(`PHONE_VERIFICATION_REQUIRED`). 뒤의 두 게이트는 같은 허용 목록(`isPhoneVerificationRequestAllowed`)과 관리자 면제를 공유하고, 조회(GET/HEAD/OPTIONS)는 항상 통과한다.

## Edge Cases

- `register` 중복 이메일/닉네임은 `409`
- `login` 잘못된 비밀번호는 `400`
- 탈퇴 후 기존 access token으로 `/auth/me` 재호출 시 `401` 또는 `404` 계열 가능

## Anti-pattern

- 프론트가 `statusCode` 대신 문자열 message만으로 분기
- 401 응답을 세션 문제로 보지 않고 같은 요청을 반복 재시도
- dev-login을 운영 분기 없이 노출

## Source References

- `apps/v1_api/src/auth/auth.controller.ts`
- `apps/v1_api/src/auth/dto/` (여러 DTO로 분리됨 — `login.dto.ts`, `register.dto.ts`,
  `kakao-login.dto.ts`, `apple-login.dto.ts`, `social-profile.dto.ts` 등)
- `apps/v1_api/src/auth/auth.service.ts`
- `apps/v1_api/src/auth/auth.controller.spec.ts` + `auth.service.spec.ts` (v1엔 전용
  auth 통합 스펙 파일이 없어 유닛 스펙으로 대체)
- `apps/v1_web/src/lib/api-client.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`

