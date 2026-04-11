# Domain Contract — Teams

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/teams` | No | 팀 목록 |
| GET | `/teams/me` | Yes | 내가 속한 팀(멤버십 포함) |
| GET | `/teams/:id/hub` | Optional | 팀 허브 |
| GET | `/teams/:id` | No | 팀 상세 |
| POST | `/teams` | Yes | 팀 생성 |
| PATCH | `/teams/:id` | Yes | 팀 수정 (manager+) |
| DELETE | `/teams/:id` | Yes | 팀 삭제 (owner) |
| GET | `/teams/:id/members` | Yes | 멤버 목록 (member+) |
| POST | `/teams/:id/members` | Yes | 멤버 추가 (manager+) |
| PATCH | `/teams/:id/members/:userId` | Yes | 역할 변경 (owner) |
| DELETE | `/teams/:id/members/:userId` | Yes | 멤버 제거 (owner) |
| POST | `/teams/:id/apply` | Yes | 가입 신청 |
| POST | `/teams/:id/leave` | Yes | 자진 탈퇴 |
| POST | `/teams/:id/transfer-ownership` | Yes | 소유권 이전 |
| POST | `/teams/:id/invitations` | Yes | 초대 발송 (manager+) |
| GET | `/teams/:id/invitations` | Yes | 초대 목록 (manager+) |
| PATCH | `/teams/:id/invitations/:invitationId/accept` | Yes | 초대 수락 |
| PATCH | `/teams/:id/invitations/:invitationId/decline` | Yes | 초대 거절 |

## GET /teams

Query:

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `sportType` | string | No | enum 문자열 |
| `city` | string | No | 정확 매칭 |
| `recruiting` | string | No | `"true"`일 때만 recruiting 필터 |
| `cursor` | string | No | cursor |
| `limit` | string | No | 수동 parse 후 1~100 clamp |

CAUTION:

- 이 endpoint는 DTO가 아니라 controller 수동 parse를 사용한다.
- `limit=abc`는 validation 에러가 아니라 기본값/보정값으로 처리된다.

## POST /teams (CreateTeamDto)

주요 필드:

| 필드 | 타입 | 필수 |
|---|---|---|
| `name` | string(max 100) | Yes |
| `sportType` | enum(SportType) | Yes |
| `description` | string | No |
| `logoUrl`, `coverImageUrl` | string | No |
| `photos` | string[] | No |
| `city`, `district` | string | No |
| `level` | int(1~5) | No |
| `isRecruiting` | boolean | No |
| `contactInfo` | string | No |
| `instagramUrl`, `youtubeUrl`, `shortsUrl`, `kakaoOpenChat`, `websiteUrl` | url | No |

생성 시 트랜잭션으로 owner 멤버십(`role=owner`, `status=active`)이 자동 생성된다.

## PATCH /teams/:id

- 권한: manager 이상
- `PartialType(CreateTeamDto)` 기반이라 create 필드와 동일 계약
- 미전달 필드는 유지

## 가입 신청 / 멤버십

### POST /teams/:id/apply

- 비멤버 전용
- 실패 케이스
  - 팀 없음: `TEAM_NOT_FOUND`
  - 모집중 아님: `TEAM_NOT_RECRUITING`
  - active 멤버: `TEAM_ALREADY_MEMBER`
  - pending 멤버십 존재: `TEAM_APPLY_PENDING_EXISTS`
- `left/removed` 멤버십이 있으면 role을 `member`, status를 `pending`으로 재신청 처리

### POST /teams/:id/leave

- owner는 탈퇴 불가
- active 멤버만 가능

### POST /teams/:id/transfer-ownership

- body: `{ toUserId, demoteTo: "manager" | "member" }`
- target은 active 멤버여야 함
- optimistic concurrency 충돌 시 `TEAM_OWNER_CONFLICT`

## 초대

- invitation 만료 기간: 7일
- 중복 pending 초대 차단
- 수락 시 `teamMembership` 생성 + `memberCount` 증가

## Frontend Mapping Notes

- `/teams/me` 원응답은 membership 배열이며, `useMyTeams`가 `MyTeam`으로 평탄화한다.
- `useTransferTeamOwnership`는 backend body와 동일한 `{ toUserId, demoteTo }` 사용.

## CAUTION

- `ApplyTeamDto`가 비어 있어 문서상 DTO 추론이 어렵다. 실제 계약은 service 로직 기준으로 봐야 한다.
- `/teams/:id/hub`는 optional auth endpoint다. 로그인 여부에 따라 `capabilities` 계산 컨텍스트가 달라진다.

## Source References

- `apps/api/src/teams/teams.controller.ts`
- `apps/api/src/teams/dto/create-team.dto.ts`
- `apps/api/src/teams/dto/update-team.dto.ts`
- `apps/api/src/teams/dto/membership.dto.ts`
- `apps/api/src/teams/teams.service.ts`
- `apps/api/src/teams/team-membership.service.ts`
- `apps/api/src/teams/teams.service.spec.ts`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`
