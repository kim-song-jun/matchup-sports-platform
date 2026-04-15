# Domain Contract — Users

## Source Of Truth Priority

1. `apps/api/src/users/users.controller.ts`
2. `apps/api/src/users/dto/update-profile.dto.ts`
3. `apps/api/src/users/users.service.ts`
4. `apps/web/src/hooks/use-api.ts`
5. `apps/web/src/types/api.ts`

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/users/me` | Yes | 내 프로필 |
| PATCH | `/users/me` | Yes | 내 프로필 수정 |
| GET | `/users/me/matches` | Yes | 내 매치 히스토리 |
| GET | `/users/me/invitations` | Yes | 내 팀 초대 목록 |
| GET | `/users/search?q=` | Yes | 닉네임 검색 |
| GET | `/users/:id` | No | 공개 프로필 |

## GET /users/me

- Header: `Authorization: Bearer <token>`
- 성공 시 현재 로그인 사용자의 프로필을 반환한다.
- 주요 필드:
  - `id`, `email`, `nickname`
  - `profileImageUrl`
  - `bio`, `phone`
  - `gender`, `birthYear`
  - `locationCity`, `locationDistrict`
  - 서비스에 따라 manner/reputation 요약 필드가 포함될 수 있음
- 실패:
  - 토큰 누락/만료: `401`
  - soft-deleted 계정: `404` 가능

성공 예시:

```json
{
  "status": "success",
  "data": {
    "id": "user-id",
    "nickname": "teameet-player",
    "profileImageUrl": "/uploads/profile.jpg",
    "locationCity": "Seoul"
  },
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## PATCH /users/me

- Body (`UpdateProfileDto`)

| 필드 | 타입 | 필수 | nullable |
|---|---|---|---|
| `nickname` | string | No | No |
| `profileImageUrl` | string | No | No |
| `phone` | string | No | No |
| `gender` | `male \| female \| other` | No | No |
| `birthYear` | int(1950~2015) | No | No |
| `bio` | string | No | No |
| `locationCity` | string | No | No |
| `locationDistrict` | string | No | No |

CAUTION:

- DTO에 없는 필드 전송 시 `400`
- `birthYear`를 문자열로 보내면 transform 후 숫자 검증 실패 가능
- `null`로 값을 지우는 계약이 DTO에서 보장되지 않는 필드는 빈 문자열/`null` clearing을 추측하지 말고 현재 service 동작을 확인해야 한다.

## GET /users/me/matches

- Query

| 필드 | 타입 | 필수 | 기본값 |
|---|---|---|---|
| `status` | string | No | 전체 |
| `cursor` | string | No | 첫 페이지 |
| `limit` | number | No | 20 |

- Response data shape

```json
{
  "items": [],
  "nextCursor": null
}
```

CAUTION:

- service 구현에서 `nextCursor`는 participant id가 아니라 `items[last].id` 기반

## GET /users/me/invitations

- Auth required
- body 없음
- 현재 사용자에게 온 pending 초대만 반환한다.
- UI는 이 endpoint를 "내가 보낸 초대"로 해석하면 안 된다.

응답 예시:

```json
{
  "status": "success",
  "data": [
    {
      "id": "invitation-id",
      "teamId": "team-id",
      "role": "member",
      "status": "pending"
    }
  ],
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## GET /users/search

- Query: `q` 필수
- 빈 문자열/공백만 전달 시 `400` (`USER_SEARCH_QUERY_REQUIRED`)
- 최대 10명, 본인 제외
- 프론트 구현 규칙:
  - 공백 trim 후 요청
  - debounce는 프론트에서 처리하고, 빈 문자열이면 호출 자체를 막는다.

대표 실패 예시:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "검색어를 입력해주세요.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## GET /users/:id

- 공개 프로필용이며 일부 private field는 제외
- `GET /users/me`와 동일 shape를 보장하지 않는다.
- 프론트는 public profile page에서 `email`, `phone` 같은 private 필드를 기대하지 않는다.

## Permission / Ownership Rules

- `/users/me*`는 본인 토큰 필수
- `/users/:id`는 공개 조회

## Frontend Mapping Notes

- `useMyMatches`는 `/users/me/matches`를 `PaginatedResponse<Match>`로 사용
- `useUserSearch`는 `/users/search` 결과를 사용자 선택 UI에 바로 사용
- `useUserProfile(id)`는 `/users/:id`를 public profile로 소비
- `useMe`와 `useUserProfile`의 응답 shape를 하나의 완전 동일 타입으로 가정하면 private/public 필드 드리프트가 생길 수 있다.

## Edge Cases

- soft-deleted user id는 `404`
- 검색 q 없이 호출하면 백엔드가 명시적 `BadRequestException` 반환
- `/users/me/matches`의 `status` 값은 화면 display label이 아니라 backend filter literal 기준으로 전달해야 한다.

## Source References
