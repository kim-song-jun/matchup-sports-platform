# Domain Contract — Mercenary

## Domain Overview

- 용병 모집글과 지원 lifecycle 도메인
- 상세 조회는 optional auth이며, 로그인 여부에 따라 응답 정보가 달라진다.

## Endpoint Matrix

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mercenary` | Public | 모집글 목록 (cursor pagination) |
| GET | `/mercenary/:id` | Optional JWT | 모집글 상세 |
| GET | `/mercenary/me/applications` | JWT | 내 지원 목록 |
| POST | `/mercenary` | JWT | 모집글 생성 (manager+) |
| PATCH | `/mercenary/:id` | JWT | 모집글 수정 |
| DELETE | `/mercenary/:id` | JWT | 모집글 삭제 |
| POST | `/mercenary/:id/apply` | JWT | 지원 |
| PATCH | `/mercenary/:id/applications/:appId/accept` | JWT | 지원 승인 |
| PATCH | `/mercenary/:id/applications/:appId/reject` | JWT | 지원 거절 |
| DELETE | `/mercenary/:id/applications/me` | JWT | 내 지원 취소 |

## Request / Response Details

### GET `/mercenary`

- Query DTO: `sportType`, `status`, `teamId`, `cursor`, `limit`
- `data` shape: `{ items, nextCursor }`

### GET `/mercenary/:id` (Optional Auth)

- 로그인 시:
  - `viewer` 정보 포함
  - `viewerApplication` 포함 가능
  - manager/owner는 `applications` 전체 접근
- 비로그인 시:
  - applicant 개인정보(user)가 redaction됨
  - `applications`는 존재 여부 수준만 표시될 수 있음

### POST `/mercenary`

Body: `CreateMercenaryPostDto`

- required: `teamId`, `sportType`, `matchDate`, `venue`, `position`
- optional: `count`, `level`, `fee`, `notes`
- 권한: host team manager+
- team sportType mismatch 시 400

### POST `/mercenary/:id/apply`

Body:

```json
{
  "message": "지원 메시지"
}
```

제약:

- 모집글 status가 `open`이어야 함
- 작성자 본인 지원 불가
- host team 멤버 지원 불가
- 중복 지원 시 409

### accept/reject/withdraw

- accept/reject:
  - manager+만 가능
  - pending 상태만 처리 가능
- accept에서 정원 도달 시 post status를 `filled`로 전환하고 나머지 pending은 자동 reject
- withdraw는 본인 pending 지원만 가능

## Frontend Mapping Notes

- `useMercenaryPost`는 optional auth shape 차이를 감안해야 한다.
  - 비로그인: applicant user 정보 없음
  - 로그인: `viewer`, `viewerApplication`, `canApply` 활용 가능
- `useMyMercenaryApplications`는 별도 리스트 source
- 승인/거절/취소 후 detail + list invalidate가 필요하다.

## Edge Cases

- duplicate apply: 409 Conflict
- closed/filled 모집글 지원: 400
- accept race condition: serializable tx 충돌 시 409
- 팀 종목 불일치 모집글 생성: 400

## Error Example

```json
{
  "status": "error",
  "statusCode": 409,
  "message": "이미 지원한 모집글입니다.",
  "timestamp": "2026-04-11T12:00:00.000Z"
}
```

## Source References

- `apps/api/src/mercenary/mercenary.controller.ts`
- `apps/api/src/mercenary/mercenary.service.ts`
- `apps/api/src/mercenary/dto/*.ts`
- `apps/web/src/hooks/use-api.ts` (`useMercenaryPosts`, `useMercenaryPost`, `useCreateMercenaryPost`, `useApplyMercenary`, `useMyMercenaryApplications`)
