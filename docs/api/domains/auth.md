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
| POST | `/auth/apple` | No | 애플 로그인 |
| POST | `/auth/refresh` | No | 토큰 재발급 |
| GET | `/auth/me` | Yes | 현재 사용자 조회 |
| DELETE | `/auth/withdraw` | Yes | 탈퇴 |

## 공통 성공 응답 shape

인증 성공 계열 endpoint(`register`, `login`, `dev-login`, `kakao`, `apple`)는 `data` 안에 아래 shape를 반환한다.

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

## POST /auth/kakao

- Body

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `code` | string | Yes | OAuth authorization code |
| `redirectUri` | string | No | provider redirect URI |

CAUTION:

- `kakao`는 env 미구성 시 mock profile로 fallback 가능
- 프론트는 provider별 성공/실패 copy를 분리하되, 최종 payload 저장 shape는 동일하게 처리한다.

> **네이버는 엔드포인트가 없다.** `V1AuthProvider` enum 에 `naver` 값이 남아 있어 있는 것처럼
> 보이지만 라우트도 서비스 코드도 없다(컨트롤러는 kakao·apple 둘뿐). 로그인 화면의 네이버
> 버튼이 «준비 중» 으로 비활성인 것도 그래서다. 이 문서는 오랫동안 `/auth/naver` 를 있는
> 것처럼 적고 있었다 — 그대로 붙이면 404 다.

## POST /auth/apple/nonce, POST /auth/apple

애플은 OAuth code 흐름이 아니다. 애플이 자기 웹 흐름을 임베디드 브라우저에서 막기 때문에,
네이티브 셸이 시트를 띄우고 **identity token** 을 돌려주는 경로만 쓴다. 그래서 body 도
`code` 가 아니다.

- `POST /auth/apple/nonce` — body 없음. `{ nonce }` 를 돌려준다(서명된 단발 값, 5분).
  앱은 이 값을 **SHA-256 해서** 애플 요청에 싣는다. 애플이 받은 문자열을 그대로 되돌려주므로
  서버는 같은 해시로 대조한다 — 원문을 실으면 서버가 해시와 평문을 비교하게 되어 전부 거절된다.

- `POST /auth/apple`

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `identityToken` | string | Yes | 애플이 준 JWT. 최소 20자 |
| `nonce` | string | Yes | 위에서 받은 **원문** nonce |
| `fullName` | string | No | 애플은 **최초 1회만** 준다. 그때 안 보내면 영영 못 받는다 |

실패:

| 상태 | 코드 | 뜻 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | body 형식 |
| 401 | `APPLE_SIGN_IN_FAILED` | 토큰·nonce 검증 실패(서명·발급자·audience·만료·nonce 불일치) |
| 403 | `PERMISSION_DENIED` | 계정 상태가 로그인 불가 |
| 409 | `SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL` | 아래 참조 |
| 503 | `APPLE_SIGN_IN_NOT_CONFIGURED` | `APPLE_SIGN_IN_AUDIENCES` 미설정, 또는 `V1_SESSION_SECRET` 이 32자 미만 |

### 409 SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL (kakao·apple 공통)

같은 이메일을 쓰는 계정이 이미 있는데 **우리가 그 이메일을 인증한 적이 없을 때** 난다.
제공자의 `email_verified` 는 제공자 쪽 소유만 증명하고, 우리 계정 이메일은 소유 증명 없이
바꿀 수 있어서(바꾸면 `emailVerifiedAt` 이 null 이 된다) 그것만 믿으면 남의 계정을 흡수하게
된다 — account pre-hijacking.

**사용자 대응**: 기존 방법(이메일·비밀번호 또는 다른 소셜)으로 로그인해 **이메일 인증을 마친 뒤**
다시 시도한다. 프론트는 이 코드에 «인증을 마쳐 달라» 는 안내를 붙이고, 로그인 화면으로
되돌리지 말 것 — 같은 자리에서 다시 눌러도 같은 409 가 난다.

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
