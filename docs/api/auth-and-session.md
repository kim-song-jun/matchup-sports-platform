# Auth And Session

## 목적

프론트가 인증 토큰 발급/갱신/만료 처리 흐름을 추측 없이 구현하도록 하는 문서.

## 인증 endpoint 요약

| Method | Path | Auth | 설명 |
|---|---|---|---|
| POST | `/auth/register` | No | 이메일 회원가입 |
| POST | `/auth/login` | No | 이메일 로그인 |
| POST | `/auth/dev-login` | No | 개발 전용 로그인 |
| POST | `/auth/kakao` | No | 카카오 로그인 |
| POST | `/auth/naver` | No | 네이버 로그인 |
| POST | `/auth/apple` | No | 애플 로그인 시도 |
| POST | `/auth/refresh` | No | refresh token으로 재발급 |
| GET | `/auth/me` | Yes | 현재 사용자 조회 |
| DELETE | `/auth/withdraw` | Yes | 소프트 삭제 탈퇴 |

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

## refresh 계약

요청 body:

```json
{
  "refreshToken": "jwt"
}
```

성공 시:

```json
{
  "accessToken": "new-jwt",
  "refreshToken": "new-jwt"
}
```

실패 시: `401 Invalid refresh token`

## 프론트 interceptor 동작

`apps/web/src/lib/api.ts` 기준:

1. API 응답 `401` 수신
2. `_retry`가 아니면 `/auth/refresh` 호출
3. 성공 시 localStorage 토큰 교체 + 원 요청 재시도
4. refresh도 실패하면 `logout()` 후 `/login` 이동

## dev-login 계약

- `NODE_ENV=production`에서는 `403`
- `test`/`development`에서는 nickname 기반 유저 자동 생성/로그인

## 권한/세션 에러 구분

- `401`: 토큰 없음/만료/유효하지 않음
- `403`: 인증은 되었지만 정책 위반(예: prod에서 dev-login)

## Edge Cases

- `register` 중복 이메일/닉네임은 `409`
- `login` 잘못된 비밀번호는 `400`
- 탈퇴 후 기존 access token으로 `/auth/me` 재호출 시 `401` 또는 `404` 계열 가능

## Anti-pattern

- 프론트가 `statusCode` 대신 문자열 message만으로 분기
- refresh 실패 후 원 요청을 무한 재시도
- dev-login을 운영 분기 없이 노출

## Source References

- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/dto/auth.dto.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/test/integration/auth.e2e-spec.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/hooks/use-api.ts`

