# Domain Contract — Auth

## Source Of Truth Priority

1. `apps/api/src/auth/auth.controller.ts`
2. `apps/api/src/auth/dto/auth.dto.ts`
3. `apps/api/src/auth/auth.service.ts`
4. `apps/api/test/integration/auth.e2e-spec.ts`
5. `apps/web/src/lib/api.ts`
6. `apps/web/src/hooks/use-api.ts`

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| POST | `/auth/register` | No | 이메일 회원가입 |
| POST | `/auth/login` | No | 이메일 로그인 |
| POST | `/auth/dev-login` | No | 개발용 로그인 |
| POST | `/auth/kakao` | No | 카카오 로그인 |
| POST | `/auth/naver` | No | 네이버 로그인 |
| POST | `/auth/apple` | No | 애플 로그인 |
| POST | `/auth/refresh` | No | 토큰 재발급 |
| GET | `/auth/me` | Yes | 현재 사용자 조회 |
| DELETE | `/auth/withdraw` | Yes | 탈퇴 |

## 공통 성공 응답 shape

인증 성공 계열 endpoint(`register`, `login`, `dev-login`, `kakao`, `naver`, 일부 provider fallback 경로)는 `data` 안에 아래 shape를 반환한다.

```json
{
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token",
  "user": {
    "id": "user-id",
    "email": "player@example.com",
    "nickname": "teameet-player"
  }
}
```

프론트는 이 값을 그대로 auth store에 저장하고, 이후 보호 endpoint 요청 시 `Authorization: Bearer <accessToken>`를 붙인다.

## POST /auth/register

- Body

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `email` | string(email) | Yes | 중복 불가 |
| `password` | string | Yes | 최소 6자 |
| `nickname` | string | Yes | 비어있으면 실패 |

- 중복 이메일/닉네임: `409`
- 성공: `{ accessToken, refreshToken, user }`
- 대표 실패:
  - 이메일 형식 오류: `400`
  - 비밀번호 길이 부족: `400`
  - 이메일/닉네임 중복: `409`

## POST /auth/login

- Body

| 필드 | 타입 | 필수 |
|---|---|---|
| `email` | string(email) | Yes |
| `password` | string | Yes |

- 실패: `400` (`이메일 또는 비밀번호가 올바르지 않아요`)
- 성공 예시:

```json
{
  "status": "success",
  "data": {
    "accessToken": "jwt",
    "refreshToken": "jwt",
    "user": {
      "id": "user-id",
      "nickname": "테스터"
    }
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## POST /auth/dev-login

- Body: `{ "nickname": "테스트유저" }`
- nickname 미전달 시 기본값 `테스트유저`
- `NODE_ENV=production`에서 `403`
- 프론트 용도:
  - 로컬 개발/E2E/bootstrap 전용
  - 사용자-facing production flow에 절대 포함하지 않는다.

## POST /auth/kakao, /auth/naver, /auth/apple

- Body

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `code` | string | Yes | OAuth authorization code |
| `redirectUri` | string | No | provider redirect URI |

CAUTION:

- `apple`은 현재 service에서 미구현 경로로 `401` 에러 가능
- `kakao/naver`는 env 미구성 시 mock profile로 fallback 가능
- 프론트는 provider별 성공/실패 copy를 분리하되, 최종 payload 저장 shape는 동일하게 처리한다.

## POST /auth/refresh

- Body: `{ "refreshToken": "<jwt>" }`
- 성공: `{ accessToken, refreshToken }`
- 실패: `401 Invalid refresh token`
- 성공 예시:

```json
{
  "status": "success",
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token"
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

- 프론트 구현 규칙:
  - `apps/web/src/lib/api.ts` interceptor가 자동 호출한다.
  - 화면 훅에서 직접 refresh endpoint를 호출하는 새 경로를 만들지 않는다.
  - refresh 실패 시 interceptor가 auth store를 비우고 `/login`으로 이동한다.

## GET /auth/me

- Header: `Authorization: Bearer <token>`
- 성공: 사용자 프로필 객체
- 실패: `401` (토큰 없음/무효)
- 사용자-facing 보호 화면 진입 전 현재 세션 유효성 확인용 source of truth로 사용한다.

## DELETE /auth/withdraw

- Header: `Authorization: Bearer <token>`
- 동작: `deletedAt` 설정(soft delete)
- 성공 예시:

```json
{
  "status": "success",
  "data": { "message": "탈퇴가 완료되었습니다." },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Idempotency / Duplicate Behavior

- `register`는 중복 이메일/닉네임 차단
- `withdraw`는 동일 토큰 재호출 시 이후 인증 실패로 귀결

## Frontend Mapping Notes

- `useDevLogin`, `useEmailRegister`, `useEmailLogin`, `useMe`는 모두 `extractData`로 data를 꺼냄
- refresh는 훅이 아니라 axios interceptor에서 처리
- `logout 후 refresh 재시도` 같은 별도 사용자 코드 분기를 만들기보다 interceptor 단일 경로를 따른다.

## Representative Error Examples

잘못된 refresh token:

```json
{
  "status": "error",
  "statusCode": 401,
  "message": "Invalid refresh token",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

production 환경 dev-login 차단:

```json
{
  "status": "error",
  "statusCode": 403,
  "message": "Dev login is disabled in production",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Edge Cases

- 탈퇴 직후 stale access token으로 호출 시 `401/404` 계열 가능
- production 배포 환경에서 dev-login 호출 금지
- 소셜 로그인 env가 비어 있는 개발 런타임에서는 provider mock/fallback behavior가 섞일 수 있으므로, production UI copy와 동일하게 취급하지 않는다.

## Source References
