# Domain Contract — Teams

> 팀 일정/출석/용병모집/리마인더(Task 12)는 별도 문서 [team-schedules.md](./team-schedules.md)를 참조.

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/teams` | Optional | 팀 목록 |
| GET | `/teams/:teamId` | Optional | 팀 상세 |
| POST | `/teams` | Yes | 팀 생성 |
| PATCH | `/teams/:teamId` | Yes(manager+) | 팀 수정 |
| GET | `/teams/:teamId/join-eligibility` | Yes | 가입 신청 가능 여부 |
| GET | `/teams/:teamId/members` | Optional | 멤버 목록(공개 설정 또는 active member) |
| POST | `/teams/:teamId/leave` | Yes | 자진 탈퇴 |
| POST | `/teams/:teamId/join-applications` | Yes(비멤버) | 가입 신청 |
| GET | `/teams/:teamId/join-applications` | Yes(owner/manager) | 가입 신청 목록 |
| GET | `/me/join-applications` | Yes | 내가 보낸 가입 신청 목록 |
| GET | `/me/teams` | Yes | 내가 속한 팀(멤버십 포함) |
| PATCH | `/team-memberships/:membershipId/role` | Yes(owner/manager) | 역할 변경·소유권 위임 |
| PATCH | `/team-memberships/:membershipId/jersey` | Yes(본인) | 등번호 변경(`jerseyNumber: number \| null`, 생략은 400) |
| POST | `/team-memberships/:membershipId/remove` | Yes(owner/manager) | 멤버 제거 |
| POST | `/team-join-applications/:applicationId/withdraw` | Yes(신청자) | 가입 신청 철회 |
| POST | `/team-join-applications/:applicationId/approve` | Yes(owner/manager) | 가입 신청 승인 |
| POST | `/team-join-applications/:applicationId/reject` | Yes(owner/manager) | 가입 신청 거절 |
| POST | `/teams/:teamId/invitations` | Yes(manager+) | 초대 발송 (body `{ invitedEmail, message? }`) |
| GET | `/teams/:teamId/invitations` | Yes(manager+) | 보낸 초대 목록 (pending) |
| POST | `/teams/:teamId/invitations/:invitationId/cancel` | Yes(manager+) | 초대 취소 |
| GET | `/me/invitations` | Yes | 받은 초대 목록 (pending) |
| POST | `/team-invitations/:invitationId/accept` | Yes(피초대자 본인) | 초대 수락 |
| POST | `/team-invitations/:invitationId/decline` | Yes(피초대자 본인) | 초대 거절 |

`teams.controller.ts`에는 `/teams/:teamId/hub`, `DELETE /teams/:teamId`, `POST/PATCH/DELETE
/teams/:teamId/members(/:userId)`, `/teams/:teamId/apply`, `GET /teams/me` 라우트가 없다 —
가입·멤버십·탈퇴는 각각 `join-applications`, `team-memberships`, `team-join-applications`,
`/leave` 라는 flat 리소스 경로를 쓴다. `V1Team.deletedAt` 컬럼은 존재하지만 이를 세팅하는
컨트롤러 라우트(admin 포함)는 현재 코드에 없다.

## Member Response Contract

`GET /teams/:teamId/members`는 팀의 멤버-목록 공개 정책에 따라 보이는 모든 디렉터리 행을 반환한다.
디렉터리 열람 권한과 개별 PII 열람 권한은 별개 결정이다.

각 멤버 항목은 `displayName`(닉네임/멤버 라벨로 폴백), 그리고 다음 비공개 필드를 포함한다
(값은 nullable): `realName`, `phone`, `birthDate`, `gender`(`male | female`로 정규화).

| Viewer | `realName`, `phone`, `birthDate`, `gender` |
|---|---|
| 비로그인 또는 비멤버 | 모든 행에서 `null`(`membersVisibilityEnabled=true`로 디렉터리 자체는 보여도 PII는 안 보임) |
| 일반 active 멤버 | 본인 `userId` 행에서만 값이 보이고 다른 멤버 행은 `null` |
| active owner/manager | 로스터 관리 응답으로 모든 반환 멤버 행에서 값이 보임(source가 비어 있으면 여전히 `null`) |

`displayName`, `profileImageUrl`, role, status, 가입 메타데이터는 디렉터리/표시용 필드이며 이
매트릭스가 적용되는 비공개 로스터 데이터가 아니다. 대회 로스터 등록 화면은 `realName`,
`birthDate`, `phone` 중 하나라도 없으면 해당 팀원을 목록에는 유지하되 선택 불가로 표시한다.

응답의 `summary.ownerCount`는 요청한 `role`, `status`, `cursor`, `limit`과 무관하게 팀 전체의
`role=owner`, `status=active` 멤버십을 별도 count한 값이다. `summary.managerCount`,
`summary.memberCount`도 팀 aggregate이며 현재 page의 `items.length` 집계가 아니다.

## GET /teams (TeamsQueryDto)

Query:

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `sportId` | uuid | No | `v1_master_sports.id` |
| `regionId` | string(≤100) | No | team region filter; city-level(`서울 전체`) 또는 district-level |
| `query` | string(≤50) | No | team name/introduction 검색 |
| `genderRule` | string | No | `성별 무관`, `남`, `여`, `무관` |
| `levelCodes` | comma string(≤100) | No | `beginner,novice,intermediate,advanced` 중 다중 선택 |
| `joinPolicy` | string | No | `approval_required`, `closed` |
| `sort` | recommended/latest/member_count/trust | No | 기본 recommended |
| `view` | card/compact | No | — |
| `cursor` | string | No | cursor |
| `limit` | 1~50 | No | 기본 20 |

CAUTION:

- 응답 `pageInfo`는 `nextCursor`, `hasNext`, `total`을 포함한다. `total`은 cursor/limit을 제외하고 현재 검색·종목·지역·성별·레벨·가입정책 필터를 모두 적용한 전체 팀 수다.
- Level response fields: `levelLabel`, `minLevel`, `maxLevel`
- Team list/detail/my-teams region fields include `region.parentName` when the selected region has a parent; `regionName` is the display label (`parentName + name` for district regions, `{city} 전체` for city-level regions).
- Team list, detail, `/me/teams` responses include `activityDays`, `activityFrequency`,
  `activityTimeSlots`, `activityTypes`, `activityMemo`, `activitySummary`, `memberGoalCount`.
  `activityAreaText`는 기존 `activity_note` 컬럼을 쓰는 호환/폴백 필드로 남아 있다.

## POST /teams (MutateTeamDto / CreateTeamDto)

주요 필드:

| 필드 | 타입 | 필수 |
|---|---|---|
| `name` | string(max 50) | Yes |
| `sportId` | uuid | Yes |
| `regionId` | string | No |
| `joinPolicy` | `"approval_required" \| "closed"` | Yes |
| `introduction` | string | No |
| `logoUrl` | string | No |
| `coverImageUrl` | string | No |
| `activityAreaText` | string | No |
| `activityDays` | string[] — `mon..sun` | No |
| `activityFrequency` | `weekly_1\|weekly_2\|weekly_3\|weekly_4_plus\|biweekly_1\|irregular` | No |
| `activityTimeSlots` | string[] — `morning\|lunch\|afternoon\|evening\|late_night` | No |
| `activityTypes` | string[] — `regular_meetup\|friendly_match\|team_match\|tournament_prep\|training\|free_participation\|beginner_friendly\|competitive` | No |
| `activityMemo` | string | No |
| `skillLevelText` | string | No |
| `minLevelCode` / `maxLevelCode` | level code | No |
| `genderRule` | string | No |
| `memberGoalCount` | number | No |

- Activity profile fields are structured on `v1_team_profiles`: `activity_days`, `activity_frequency`, `activity_time_slots`, `activity_types`, and `member_goal_count`.
- `memberGoalCount`는 팀 정원이다. `memberCount >= memberGoalCount`면 가입 신청, 가입 승인, 팀 초대, 초대 수락이 모두 `TEAM_FULL`로 실패한다. 정원은 현재 `memberCount`보다 낮게 수정할 수 없다.
- 새 팀은 기본 `membersVisibilityEnabled=true` / `members_visible=true`다.
- `regionId`는 active city-level·district-level `v1_regions` 행을 받는다. city-level 행은 팀 UI에서 `{city} 전체`로 표시된다.
- Level codes는 `beginner`, `novice`, `intermediate`, `advanced`만 허용한다. `minLevelCode === maxLevelCode`는 단일 레벨 조건으로 유효하다. `minLevelCode`가 `maxLevelCode`보다 높은 단계면 `400 VALIDATION_FAILED`.
- `skillLevelText`는 표시/레거시 설명용이고, 필터와 `levelLabel`은 `minSportLevelId`, `maxSportLevelId` FK를 기준으로 계산한다.
- 생성 시 트랜잭션으로 owner 멤버십(`role=owner`, `status=active`)이 자동 생성된다.
- 팀 생성은 프로필 `realName`, `phone`, `gender`가 있어야 하며 없으면 `422 PROFILE_COMPLETION_REQUIRED`다. 신청/관리 엔드포인트는 이 검사에서 제외된다.

## GET /teams/:teamId — 컨택 관련 필드

- `contactPolicy`(`open|recruiting_only|closed`)는 그 팀의 owner/manager에게만 내려간다.
- `canSendContact`(boolean)는 **로그인한 비멤버이고 다른 팀의 owner/manager인 viewer**에게만 내려가며, 그 외(비로그인·이 팀 멤버·보낼 팀 없음)에는 생략된다. 내 owner/manager 팀 중 하나라도 이 팀에 컨택을 보낼 수 있으면 `true`, 전부 막혔으면 `false`다.
- `false`는 차단(양방향) / `closed` / `recruiting_only`인데 모집 중 아님 세 사유를 **하나로 합친 값**이라 컨택 거절(`TEAM_CONTACT_NOT_ACCEPTING`) 뒤에 알 수 있는 정보와 같다 — 발신자가 "차단당했다"를 역추론하지 못하는 성질(§8(b))을 그대로 유지한다. 화면은 이 값으로 "컨택 보내기"를 비활성화하고 "이 팀은 지금 컨택을 받지 않고 있어요"를 보여주며, 서버는 여전히 컨택 생성 시점에 같은 검사를 한다.

## PATCH /teams/:teamId

- 권한: manager 이상
- create 필드와 동일 계약(`PartialType` 기반), 미전달 필드는 유지

## 가입 신청 / 멤버십

### POST /teams/:teamId/join-applications

- 비멤버 전용, body `{ message?: string | null }`
- 실패 케이스: 팀 없음 `TEAM_NOT_FOUND`, 모집중 아님 `TEAM_NOT_RECRUITING`, active 멤버 `TEAM_ALREADY_MEMBER`, pending 멤버십 존재 `TEAM_APPLY_PENDING_EXISTS`
- `left/removed` 멤버십이 있으면 role을 `member`, status를 `pending`으로 재신청 처리

### GET /teams/:teamId/join-eligibility

- 신청 전 화면에서 신청 가능 여부/사유를 미리 확인하는 용도

### POST /team-join-applications/:applicationId/{withdraw,approve,reject}

- `withdraw`는 신청자 본인, `approve`/`reject`는 owner/manager
- 승인은 멤버십을 생성/복구하고 `memberCount`를 늘리며, 같은 트랜잭션에서 팀 채팅 참가를 시작하고
  joined 시스템 메시지를 남긴다(멤버가 먼저 채팅방을 열 필요 없음)

### PATCH /team-memberships/:membershipId/role

- body `{ role: "owner" | "manager" | "member" }`. 대상은 active 멤버십이어야 하고, 이미 같은 역할이면 변경 없이 그대로 반환한다.
- `role: "owner"` = **소유권 위임**: 현재 owner 만 호출할 수 있고 대상은 manager 여야 한다(아니면 409 `OWNER_DELEGATION_TARGET_MUST_BE_MANAGER`). 한 트랜잭션에서 현재 owner 가 manager 로 내려가고 대상이 owner 가 되며 `team.ownerUserId` 도 바뀐다. 동시 위임은 409 `CONCURRENT_UPDATE`.
- 위임이 아닌 변경은 owner 또는 manager 가 한다. manager 는 **member 대상만** 바꿀 수 있고(아니면 403), 기존 owner 의 역할은 이 API 로 바꿀 수 없다(409).
- manager 는 팀당 5명까지(`MANAGER_LIMIT_EXCEEDED`).

### POST /team-memberships/:membershipId/remove

- owner(누구나 제거 가능) 또는 manager(member만 제거 가능), body `{ reason?: string | null }`
- 물리 삭제 대신 멤버십을 `removed`로 갱신하고 `leftAt`, `removedByUserId`를 기록한다. 다른
  팀-소유 도메인(대회 로스터 스냅샷 등)에 이미 저장된 기록은 이 상태 변경으로 삭제되지 않는다.
- v1 멤버 관리 화면은 이를 파괴적 동작으로 취급한다 — 확인 모달에 정확히 `확인했습니다`를
  입력해야 최종 `내보내기` 버튼이 활성화되고 실제 remove mutation이 실행된다.

### POST /teams/:teamId/leave

- active 멤버가 자신의 멤버십을 `left`로 전환하는 self-service 경로다. manager/member는 탈퇴할 수 있다.
- owner도 다른 active owner가 한 명 이상 있으면 탈퇴할 수 있다. 팀 row lock 아래에서 현재 membership을 제외한 active owner를 다시 count하므로 공동 owner의 동시 탈퇴가 팀을 owner 0명으로 만들지 않는다.
- 마지막 active owner는 `409 LAST_OWNER_CANNOT_LEAVE`다. 먼저 다른 active manager에게 소유권을 이전하거나 공동 owner를 확보해야 한다.
- 동일 membership이 동시 요청으로 먼저 변경되면 조건부 update가 `409 CONCURRENT_UPDATE`를 반환한다.
- 성공 시 membership `status=left`, `memberCount` 감소, manager라면 `managerCount`도 감소하며 팀 채팅 참가 상태와 status log를 같은 transaction에서 정리한다.

`teams.controller.ts`에 `POST /teams/:teamId/transfer-ownership`는 없다 — 소유권 이전은 위
`PATCH /team-memberships/:membershipId/role`과 별개 경로로 존재하지 않으므로, 소유권 이전이
필요하면 이 문서를 갱신하기 전에 컨트롤러를 다시 확인한다.

## 초대

- 이메일 기반: `invitedEmail`로 V1User 조회(미존재 시 `USER_NOT_FOUND`), 이미 active 멤버면 `ALREADY_MEMBER`
- 중복 pending 초대 차단: `(teamId, invitedUserId)` unique upsert — declined/cancelled 후 재초대 시 pending으로 reset
- 상태: `pending | accepted | declined | cancelled` (만료 없음)
- 수락은 피초대자 본인만(`POST /team-invitations/:invitationId/accept`) — `teamMembership` upsert(active) + `memberCount` 증가(이미 active 멤버면 미증가, 가입 승인과 동일 로직 미러링)
- 모든 mutation 멱등: `alreadyInvited` / `alreadyProcessed` / `alreadyCancelled` 플래그

## Frontend Mapping Notes

- `/me/teams` 원응답은 membership 배열이며, `useMyTeams`가 `MyTeam`으로 평탄화한다.
- 목록 필터 URL은 `levelCodes`를 canonical source로 사용한다. legacy `levels` query는 읽기 호환만 유지한다.

## Route Notes

- Team detail UI source of truth는 `/teams/:teamId`; `/my/teams/:teamId`는 여기로 redirect한다.
- Owner/manager `manageRoute`는 `/teams/:teamId/members`를 가리킨다. 전체 수정/멤버/팀매치 운영은
  `/teams/:teamId` 상세 화면에서 노출된다.
- v1에는 `/teams/:teamId/manage` 라우트가 없다.

## Source References

- `apps/v1_api/src/teams/teams.controller.ts`
- `apps/v1_api/src/teams/dto/*.ts`
- `apps/v1_api/src/teams/teams.service.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
