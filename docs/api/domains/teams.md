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
| POST | `/teams/:id/invitations` | Yes | 초대 발송 (manager+, body `{ invitedEmail, message? }`) |
| GET | `/teams/:id/invitations` | Yes | 보낸 초대 목록 (manager+, pending) |
| POST | `/teams/:id/invitations/:invitationId/cancel` | Yes | 초대 취소 (manager+) |
| GET | `/me/invitations` | Yes | 받은 초대 목록 (pending) |
| POST | `/team-invitations/:invitationId/accept` | Yes | 초대 수락 (피초대자 본인) |
| POST | `/team-invitations/:invitationId/decline` | Yes | 초대 거절 (피초대자 본인) |

## GET /teams/:id/members

- 멤버 항목은 `displayName`, `realName`, `birthDate`, `phone`을 포함한다.
- `realName`, `birthDate`, `phone`은 nullable이다.
- 대회 로스터 등록 화면은 세 값 중 하나라도 없으면 해당 팀원을 목록에는 유지하되 선택 불가로 표시한다.

## GET /teams

Query:

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `sportId` | uuid | No | `v1_master_sports.id` |
| `regionId` | uuid | No | district region |
| `query` | string | No | team name/introduction 검색 |
| `genderRule` | string | No | `성별 무관`, `남`, `여` |
| `levelCodes` | comma string | No | `beginner,novice,intermediate,advanced` 중 다중 선택 |
| `joinPolicy` | string | No | `approval_required`, `closed` |
| `sort` | recommended/latest/member_count | No | 기본 recommended |
| `cursor` | string | No | cursor |
| `limit` | number | No | 1~100 clamp |

CAUTION:

- Level response fields: `levelLabel`, `minLevel`, `maxLevel`
- Team list/detail/my-teams region fields include `region.parentName` when the selected region has a parent; `regionName` is the display label (`parentName + name` for district regions).

## POST /teams (CreateTeamDto)

주요 필드:

| 필드 | 타입 | 필수 |
|---|---|---|
| `name` | string(max 100) | Yes |
| `sportId` | uuid | Yes |
| `regionId` | uuid | No |
| `introduction` | string | No |
| `activityAreaText` | string | No |
| `activityDays` | string[] | No |
| `activityFrequency` | string | No |
| `activityTimeSlots` | string[] | No |
| `activityTypes` | string[] | No |
| `activityMemo` | string | No |
| `skillLevelText` | string | No |
| `minLevelCode` | level code | No |
| `maxLevelCode` | level code | No |
| `genderRule` | string | No |
| `joinPolicy` | string | No |

- Activity profile fields are structured on `v1_team_profiles`: `activity_days`, `activity_frequency`, `activity_time_slots`, and `activity_types`. Responses include `activitySummary`; `activityAreaText` remains as a compatibility fallback from `activity_note`.
- Level codes는 `beginner`, `novice`, `intermediate`, `advanced`만 허용한다.
- `minLevelCode === maxLevelCode`는 단일 레벨 조건으로 유효하다.
- `minLevelCode`가 `maxLevelCode`보다 높은 단계면 `400 VALIDATION_FAILED`.
- `skillLevelText`는 표시/레거시 설명용이고, 필터와 `levelLabel`은 `minSportLevelId`, `maxSportLevelId` FK를 기준으로 계산한다.

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

- 이메일 기반: `invitedEmail` 로 V1User 조회(미존재 시 `USER_NOT_FOUND`), 이미 active 멤버면 `ALREADY_MEMBER`
- 중복 pending 초대 차단: `(teamId, invitedUserId)` unique upsert — declined/cancelled 후 재초대 시 pending 으로 reset
- 상태: `pending | accepted | declined | cancelled` (만료 없음)
- 수락은 피초대자 본인만(`POST /team-invitations/:id/accept`) — `teamMembership` upsert(active) + `memberCount` 증가(이미 active 멤버면 미증가, approveJoinApplication 미러링)
- 모든 mutation 멱등: `alreadyInvited` / `alreadyProcessed` / `alreadyCancelled` 플래그

## Frontend Mapping Notes

- `/teams/me` 원응답은 membership 배열이며, `useMyTeams`가 `MyTeam`으로 평탄화한다.
- `useTransferTeamOwnership`는 backend body와 동일한 `{ toUserId, demoteTo }` 사용.
- 목록 필터 URL은 `levelCodes`를 canonical source로 사용한다. legacy `levels` query는 읽기 호환만 유지한다.

## CAUTION

- `ApplyTeamDto`가 비어 있어 문서상 DTO 추론이 어렵다. 실제 계약은 service 로직 기준으로 봐야 한다.
- `/teams/:id/hub`는 optional auth endpoint다. 로그인 여부에 따라 `capabilities` 계산 컨텍스트가 달라진다.

## DELETE /teams/:id

- owner only
- physical delete가 아니라 soft delete로 처리한다
- success response: `204 No Content`
- side effects:
  - `SportTeam.deletedAt` 설정
  - `isRecruiting=false`
  - active hosted `TeamMatch` -> `cancelled`
  - pending `TeamMatchApplication` where this team is applicant -> `withdrawn`
  - active `MercenaryPost` -> `cancelled`
- deleted team은 active team list/detail surfaces에서 기본적으로 제외된다
- deleted team detail/hub read는 `404`로 취급한다
- deleted team에 대한 mutation은 `TEAM_DELETED` 계약으로 거절될 수 있다

## Route Notes

- Team detail UI source of truth is `/teams/:id`; `/my/teams/:id` redirects to it.
- Owner/manager `manageRoute` points to `/teams/:id/members`. Full edit/member/team-match operations are shown on `/teams/:id`.
- There is no v1 `/teams/:id/manage` route.

## Source References

- `apps/v1_api/src/teams/teams.controller.ts`
- `apps/v1_api/src/teams/dto/*.ts`
- `apps/v1_api/src/teams/teams.service.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
