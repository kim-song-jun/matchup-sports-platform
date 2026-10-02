# Domain Contract — Teams

> 팀 일정/출석/용병모집/리마인더(Task 12)는 별도 문서 [team-schedules.md](./team-schedules.md)를 참조.

## Endpoint Matrix

| Method | Path | Auth | 설명 |
|---|---|---|---|
| GET | `/teams` | Optional | 팀 목록 |
| GET | `/teams/:teamId` | Optional | 팀 상세 |
| GET | `/teams/name-availability` | Yes | 팀 이름 확인(같은 종목·지역에 같은 이름이 있는지) |
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
| POST | `/teams/:teamId/invitations/batch` | Yes(manager+) | 여러 명 초대 (body `{ recipients: string[1..20], message? }`, 항목별 결과) |
| GET | `/teams/:teamId/invitations` | Yes(manager+) | 보낸 초대 목록 (pending) |
| POST | `/teams/:teamId/invitations/:invitationId/cancel` | Yes(manager+) | 초대 취소 |
| GET | `/me/invitations` | Yes | 받은 초대 목록 (pending) |
| POST | `/team-invitations/:invitationId/accept` | Yes(피초대자 본인) | 초대 수락 |
| POST | `/team-invitations/:invitationId/decline` | Yes(피초대자 본인) | 초대 거절 |
| GET | `/teams/:teamId/invite-link` | Yes(manager+) | 지금 초대 링크(`status: active \| expired \| none`) |
| POST | `/teams/:teamId/invite-link` | Yes(manager+) | 초대 링크 만들기 — 살아 있으면 그대로(`created: false`) |
| POST | `/teams/:teamId/invite-link/reissue` | Yes(manager+) | 초대 링크 재발급 — 이전 링크 무효 |
| GET | `/team-invite-links/:token` | Optional | 링크 미리보기(팀 이름·종목·지역·로고 + 로그인 시 내 가입 상태) |
| POST | `/team-invite-links/:token/join-applications` | Yes | 링크로 가입 신청(승인 대기로 접수) |
| GET | `/teams/:teamId/dissolution-preview` | Yes(owner) | 해체 사전 점검 — 막는 조건·함께 정리될 것 |
| POST | `/teams/:teamId/dissolve` | Yes(owner) | 팀 해체(보관) — body `{ confirmTeamName }` |
| POST | `/teams/:teamId/restore` | Yes(owner) | 해체 30일 안 복구 |
| GET | `/me/dissolved-teams` | Yes | 내가 팀장인 해체한 팀 목록 |
| GET | `/teams/:teamId/competition-entries` | Yes(active member) | 이 팀의 대회·리그 신청과 참가 명단 수정 가능 여부 |

`teams.controller.ts`에는 `/teams/:teamId/hub`, `DELETE /teams/:teamId`, `POST/PATCH/DELETE
/teams/:teamId/members(/:userId)`, `/teams/:teamId/apply`, `GET /teams/me` 라우트가 없다 —
가입·멤버십·탈퇴는 각각 `join-applications`, `team-memberships`, `team-join-applications`,
`/leave` 라는 flat 리소스 경로를 쓴다. 팀은 물리 삭제하지 않는다 — 해체는 `status=archived` +
`deletedAt`(해체 시각) 세팅이다(아래 "팀 해체(보관)·복구").

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
- 목록 항목은 `owner`(팀장 이름·사진)를 내려주고 매니저 이름은 내려주지 않는다 — 목록 카드가 팀장·매니저 줄을 쓰지 않는다(Task 180 G12·H2, 예전 `manager` 필드 제거).

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
- **팀 이름 중복 금지**(Task 180 H2): 같은 `sportId`·같은 `regionId` 안에서 같은 이름을 차지한 팀이 있으면 `409 TEAM_NAME_TAKEN`(message `같은 종목·지역에 같은 이름의 팀이 있어요. 다른 이름을 써 주세요.`). 같은 이름 판정은 NFKC 정규화(전각·반각, 조합형·완성형 한글) → 연속 공백을 한 칸으로 → 앞뒤 공백 제거 → 소문자로 비교한다(`team-name.ts` `normalizeTeamName`, advisory lock 키도 같은 값). 이름을 차지하는 팀은 활동 중인 팀과, **팀장이 해체해 아직 직접 복구할 수 있는 팀**(`canRestore` 와 같은 판정 — 팀장 해체이고 해체 후 30일 경계 포함, 아래 "팀 해체(보관)·복구")이다. 복구 기간이 지났거나 운영팀이 보관한 팀의 이름은 풀린다. 규칙 전부터 있던 중복은 그대로 둔다. DB 유니크 제약은 없고 서비스가 이름 단위 advisory lock 안에서 검사한다(만들기·수정·셀프 복구·운영팀 보관 해제가 같은 잠금으로 줄 선다).

## GET /teams/name-availability (TeamNameAvailabilityQueryDto)

- 인증 필요. 쿼리 `name`(max 50, 빈 값 불가) · `sportId`(uuid) · `regionId` · `excludeTeamId?`(수정 중인 팀 자신을 빼고 센다).
- 응답 `{ available: boolean }` — 겹치는 팀이 어디인지는 주지 않는다. 판정 규칙은 위 생성·수정의 `TEAM_NAME_TAKEN` 과 같다: `excludeTeamId` 팀의 이름·종목·지역이 쿼리와 같으면(수정 저장이 이름 검사를 건너뛰는 경우) 규칙 전부터 있던 중복이어도 `available: true`. 웹은 "처음 그대로인지"를 따로 판정하지 않고 이 답만 쓴다.
- 라우트는 `GET /teams/:teamId` 보다 먼저 등록돼 있어야 한다(아니면 `name-availability` 가 팀 id 로 잡힌다).

## GET /teams/:teamId — 컨택 관련 필드

- `contactPolicy`(`open|recruiting_only|closed`)는 그 팀의 owner/manager에게만 내려간다.
- `canSendContact`(boolean)는 **로그인한 비멤버이고 다른 팀의 owner/manager인 viewer**에게만 내려가며, 그 외(비로그인·이 팀 멤버·보낼 팀 없음)에는 생략된다. 내 owner/manager 팀 중 하나라도 이 팀에 컨택을 보낼 수 있으면 `true`, 전부 막혔으면 `false`다.
- `false`는 차단(양방향) / `closed` / `recruiting_only`인데 모집 중 아님 세 사유를 **하나로 합친 값**이라 컨택 거절(`TEAM_CONTACT_NOT_ACCEPTING`) 뒤에 알 수 있는 정보와 같다 — 발신자가 "차단당했다"를 역추론하지 못하는 성질(§8(b))을 그대로 유지한다. 화면은 이 값으로 "컨택 보내기"를 비활성화하고 "이 팀은 지금 컨택을 받지 않고 있어요"를 보여주며, 서버는 여전히 컨택 생성 시점에 같은 검사를 한다.

### 해체된 팀(`status=archived`)

- 404 대신 읽기 전용 상세를 준다(지난 경기의 팀 링크가 끊기지 않게). 운영이 멈춘 `suspended` 팀은 여전히 404다.
- `viewer` 는 역할과 무관하게 `{ role: 'none', membershipId: null, joinState: 'none', canRequestJoin: false,
  disabledReason: 'TEAM_DISSOLVED', manageRoute: null }` — 수정·멤버 관리·컨택 화면이 전부 닫힌다.
  `canViewMembers=false`, `membersPreview=[]`, `contactPolicy`·`canSendContact` 생략.
- `dissolution: { dissolvedAt, archivedBy, restoreDeadlineAt, canRestore }` — 활동 중인 팀은 `null`.
  `archivedBy` 는 `owner`(팀장 해체) | `admin`(운영팀 보관)이고 팀장에게만 채워진다(그 외 viewer 는 `null`).
  `canRestore` 는 팀장이 해체한 팀의 팀장이고 해체 후 30일(경계 포함) 안일 때만 `true`, `restoreDeadlineAt` 은
  운영팀 보관이면 `null`. `deletedAt` 없이 보관된 옛 팀은 `dissolvedAt=null`, `canRestore=false`.
- `GET /teams/:teamId/records`·`/reviews` 는 상태 필터가 없어 해체 뒤에도 그대로 열린다. 목록·`/me/teams`·
  멤버·가입 신청·일정·채팅·컨택은 `status=active` 만 통과시키므로 보관 팀은 빠진다.

## 팀 해체(보관)·복구 (Task 180 H3)

- **권한**: 세 엔드포인트 모두 그 팀의 active owner 본인만. manager·member·비팀원은 `403 PERMISSION_DENIED`,
  팀이 없으면 `404 NOT_FOUND`.
- **`GET /teams/:teamId/dissolution-preview`** → `{ teamId, teamName, canDissolve, blockers, cleanup, restoreWindowDays: 30 }`
  - `blockers[]`: `{ kind, items[] }`, `kind` = `live_game`(LIVE·PAUSED 경기) | `matched_team_match`(상대가 정해진
    친선 팀매치, 시작 전·결과 전 모두) | `league_entry` | `tournament_entry`(끝나지 않은 대회·리그에 `draft`·`cancelled`
    가 아닌 참가 신청). 항목은 `{ id, title, opponentName, startAt, placeName, registrationStatus, route }` —
    `route` 는 정리하러 갈 화면(`/team-matches/:id`, `/tournaments/:id/matches/:id`, `/tournaments/:id/my`), 갈 곳이 없으면 `null`.
  - `cleanup`: `{ recruitingTeamMatchCount, outgoingApplicationCount, joinApplicationCount, invitationCount,
    upcomingSchedules[{ scheduleId, title, startAt }], notifyMemberCount }` — 해체가 실제로 정리하는 범위와 같다.
  - 이미 해체된 팀 `409 TEAM_ALREADY_DISSOLVED`, 운영 중지 팀 `409 TEAM_NOT_ACTIVE`.
- **`POST /teams/:teamId/dissolve`** body `{ confirmTeamName: string }`(1~50자) — 팀 이름과 앞뒤 공백을 빼고 같아야 한다
  (`400 TEAM_NAME_MISMATCH`). 막는 조건은 팀 행 잠금 뒤 다시 보고, 남아 있으면 `409 TEAM_DISSOLVE_BLOCKED`
  (`details.blockers` = 미리보기와 같은 형태). 한 트랜잭션에서:
  - 앞으로 있을 모집 중·모집 마감 친선 팀매치(이 팀이 호스트, 리그·대회 대진·플랫폼 모집 제외) → `cancelled`,
    대기 신청 `rejected`, 연결된 팀 일정 취소
  - 이 팀이 다른 팀매치에 보낸 대기 신청 → `withdrawn`
  - 대기 중 가입 신청 → `expired`, 보낸 초대 → `cancelled`
  - 시작 전 `SCHEDULED` 팀 일정 → `CANCELLED`(사유 "팀이 해체되어 취소됐어요.", 열린 용병 모집 닫힘). 지난 일정은 그대로.
  - 팀 채팅방 `archived`, 팀 `status=archived`·`deletedAt=now`, status log `team_dissolved_by_owner`
  - 멤버십은 바꾸지 않는다(복구하면 같은 팀원). 경기 결과·전적·개인 기록·후기는 건드리지 않는다.
  - 응답 `{ teamId, status: 'archived', dissolvedAt, archivedBy: 'owner', restoreDeadlineAt, canRestore, cancelledTeamMatchCount,
    cancelledScheduleCount, notifiedMemberCount, detailRoute }`
  - 알림(모두 fire-and-forget): 팀원(해체한 본인 제외)·대기 중이던 가입 신청자에게 `team_dissolved`, 자동 취소된
    팀매치에 신청했던 팀의 owner/manager 에게 `team_match_cancelled`, 철회된 신청의 호스트 팀 owner/manager 에게
    `team_match_application_withdrawn`, 초대받은 사람의 초대 알림은 "팀 초대가 취소됐어요"로 바뀐다.
- **`POST /teams/:teamId/restore`** — 팀장이 해체한 팀을 `deletedAt` 로부터 30일(경계 포함) 안에만
  `status=active`·`deletedAt=null` 로 되돌리고 팀 채팅방만 다시 연다. 취소된 경기·일정·신청은 되살리지 않는다.
  - 팀장 해체인지는 그 팀의 마지막 `toStatus=archived` status log 의 `actorType` 으로 가른다(`user` = 팀장 해체,
    어드민 "팀 상태 변경"은 `admin`). 운영팀이 보관한 팀은 기간 안이어도 `403 TEAM_RESTORE_ADMIN_ONLY`
    ("운영팀이 보관한 팀은 직접 복구할 수 없어요. 운영팀에 문의해 주세요.") — 기간 판정보다 먼저 본다.
  - 기간이 지나면 `409 TEAM_RESTORE_WINDOW_EXPIRED`(운영팀이 어드민 "팀 상태 변경"으로 복구), 해체된 팀이 아니면
    `409 TEAM_NOT_DISSOLVED`. 두 판정 모두 팀 행 잠금 뒤 다시 본다.
  - 복구 기간 동안 이름은 예약돼 있지만, 같은 종목·지역에 같은 이름을 차지한 팀이 있으면(규칙 전부터 있던 중복,
    기간 경계 경합) `409 TEAM_RESTORE_NAME_TAKEN`("같은 종목·지역에 같은 이름의 팀이 있어 복구할 수 없어요.")이고
    아무것도 되돌리지 않는다. 이름 잠금 뒤에 기간·이름을 함께 본다. 어드민 "팀 상태 변경"으로 보관을 풀 때도 같은
    검사(`team-dissolution-tx.ts` `restoreTeamInTx`)를 지난다.
- **`GET /me/dissolved-teams`** → `{ items[{ teamId, name, logoUrl, sportName, memberCount, dissolvedAt,
  archivedBy, restoreDeadlineAt, canRestore, detailRoute }], restoreWindowDays }` — 내가 active owner 인 보관 팀,
  최근 해체 순. 기간이 지났거나 운영팀이 보관한(`archivedBy=admin`) 팀도 `canRestore=false` 로 들어온다.
- 어드민 `POST /admin/teams/:teamId/status` 의 `archived` 도 같은 막는 조건(`409 TEAM_DISSOLVE_BLOCKED` +
  `details.blockers`)·정리·알림을 지난다(팀장 본인도 알림 수신). 이렇게 보관한 팀은 팀장이 직접 복구할 수 없다.
  `archived` 에서 다른 상태로 바꾸면 기간 제한 없이 `deletedAt` 을 지우고 채팅방을 다시 연다. 같은 이름의 팀이 있으면
  셀프 복구와 같은 `409 TEAM_RESTORE_NAME_TAKEN` 이다(운영팀 보관은 이름을 바로 풀어 그 사이 생길 수 있다).
  그때 운영팀은 어드민 `POST /admin/teams/:teamId/name` 으로 **보관 팀의 이름을 바꾼 뒤** 보관을 푼다(2026-10-01 결정 —
  보관 팀만, 새 이름도 같은 이름 규칙). 이름 변경은 상태 기록을 남기지 않아 보관 주체가 그대로라, 팀장이 해체한 팀이면
  이름을 바꾼 뒤 팀장이 기간 안에 다시 직접 복구할 수 있다.
- 해체된 팀의 팀장은 회원 탈퇴 차단(`WITHDRAWAL_BLOCKED_TEAM_AUTHORITY`)에서 풀린다 — 그 판정이 `status=active` 팀만 본다.

## PATCH /teams/:teamId

- 권한: manager 이상
- create 필드와 동일 계약(`PartialType` 기반), 미전달 필드는 유지
- 이름·종목·지역을 바꿔 다른 팀과 겹치면 `409 TEAM_NAME_TAKEN`(자기 자신은 세지 않는다). 셋 다 그대로면 검사하지 않아 이미 있던 중복 팀도 다른 항목을 고칠 수 있다.

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
- 초대 한 번 = 한 행(Task 180 W4-V8): 대기 중 초대가 있으면 그대로 두고(`alreadyInvited: true`), 없으면 **새 행**을 만든다.
  수락·거절·취소로 끝난 행은 되살리지 않아 `pastItems`(지난 초대)에 그대로 남고, 같은 사람이 여러 번 나올 수 있다. 다시 보낸
  초대의 `createdAt` 은 그 행을 보낸 시각이다. 대기 중 중복은 부분 unique `v1_team_invitations_pending_key`
  (`status = 'pending'` 인 `(team_id, invited_user_id)`)가 막고, 동시 재초대가 거기에 걸리면 `alreadyInvited: true` 로 돌려준다.
- 상태: `pending | accepted | declined | cancelled` (만료 없음)
- 수락은 피초대자 본인만(`POST /team-invitations/:invitationId/accept`) — `teamMembership` upsert(active) + `memberCount` 증가(이미 active 멤버면 미증가, 가입 승인과 동일 로직 미러링)
- 모든 mutation 멱등: `alreadyInvited` / `alreadyProcessed` / `alreadyCancelled` 플래그

### POST /teams/:teamId/invitations/batch (Task 180 G12)

- `recipients`: 1~20개. `@` 가 있으면 이메일(`normalizeEmail` 표준형), 없으면 닉네임 **정확히 일치**(부분 검색 없음 — 일반
  사용자에게 사용자 검색을 열지 않는다). 탈퇴(`deletedAt`) 계정은 찾지 않는다.
- 권한·정원은 단건 초대와 같다(팀장·매니저, 활성 팀, `TEAM_FULL` 이면 요청 전체 409). 초대 한 건의 처리(이미 멤버·대기 중
  유지·끝났으면 새 행·도착 알림)는 단건 초대와 같은 경로다.
- 응답 `{ teamId, invitedCount, results: [{ recipient, status, invitationId }] }` — `status`:
  `invited | already_invited | already_member | not_found | ambiguous(같은 닉네임이 여럿) | duplicate(같은 요청 안의 중복)`.

## 초대 링크 (Task 180 G12)

- 링크로 들어온 사람은 **가입 신청(`requested`)으로 접수**된다 — 멤버가 되지 않고, 승인은 그대로 팀장·매니저가 한다.
  신청은 `POST /teams/:teamId/join-applications` 와 같은 경로라 가입 닫힘(`JOIN_CLOSED`)·정원(`TEAM_FULL`)·
  이미 멤버(`ALREADY_MEMBER`)·대기 중(`ALREADY_REQUESTED`) 규칙이 같다.
- 만든 때부터 **7일** 뒤 만료. 재발급하면 이전 링크는 즉시 무효. 팀당 살아 있는 링크는 하나.
- 토큰은 32자 base64url. DB 에는 sha256 해시와 salt 만 저장하고(원문 없음), 조회는 해시로 한다.
  `V1_SESSION_SECRET` 이 없으면 만들기·보여 주기가 503 `TEAM_INVITE_LINK_UNAVAILABLE`.
- 가입을 닫아 둔 팀은 링크를 만들 수 없다(409 `JOIN_CLOSED`). 팀을 해체하면 살아 있는 링크도 닫힌다.
- `GET /teams/:teamId/invite-link` 응답 `{ teamId, status, token, expiresAt, createdAt }` — 만들기·재발급은 여기에
  `created` 가 붙는다. 웹은 `${origin}/invite/${token}` 으로 링크를 만든다.
- 미리보기 응답 `{ team: { id, name, sportName, regionName, logoUrl }, expiresAt, viewer }` — `viewer` 는 비로그인이면
  `null`, 로그인이면 `{ joinState, eligible, reasonCode, message }`(`join-eligibility` 와 같은 값).
- 에러: 형식이 다르거나 없는 토큰 404 `TEAM_INVITE_LINK_NOT_FOUND` · 만료 410 `TEAM_INVITE_LINK_EXPIRED` ·
  재발급으로 무효 410 `TEAM_INVITE_LINK_REVOKED` · 해체된 팀 410 `TEAM_NOT_ACTIVE`.
- 레이트 리밋(프로덕션): 만들기·재발급·가입 신청 10회/분, 미리보기 30회/분, 여러 명 초대 10회/분.

## GET /teams/:teamId/competition-entries (Task 180 R-1 B)

팀 상세 "참가 중인 대회·리그" 목록. 신청 상태·신청 id 는 팀 내부 정보라 **활성 팀원만** 본다 —
팀이 없으면 404 `TEAM_NOT_FOUND`, 팀원이 아니면 403 `PERMISSION_DENIED`(비회원 화면은 공개 리그 목록
`GET /league-matches?teamId=` 를 그대로 쓴다).

- 응답 `{ teamId, viewerCanManageRoster, items: [...] }` — `viewerCanManageRoster` 는 보는 사람이 팀장·매니저인지.
- 항목: `competitionId · competitionKind(regular_tournament | regular_league | null) · title · status ·
  scheduledAt · scheduledEndAt · registrationId · registrationStatus · playerCount · rosterDeadlineAt ·
  rosterEditable · rosterBlockedBy`.
- 대회·리그를 함께 담는다. **취소(`cancelled`)된 신청은 빼고**, 종료·취소된 대회는 맨 아래(최근에 끝난 순)에
  둔다. 나머지는 시작이 이른 순.
- `rosterEditable`·`rosterBlockedBy` 는 참가 명단 수정 API 와 **같은 판정**(`roster-cleanup.ts` 의
  `rosterBlockReason`)이다 — `closed`(종료·취소·공개 전 대회, 정규 리그 초안은 수정 가능) > `locked`(운영진 잠금) >
  `cancelled`(취소 요청 중) > `deadline`(명단 제출 마감, 운영진 예외가 있으면 통과). 팀장·매니저 기준이며 보는
  사람의 역할은 `viewerCanManageRoster` 로 따로 본다.
- `playerCount` 는 빠지지 않은 참가 명단 선수 수.

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
- `apps/v1_api/src/teams/team-dissolution*.ts`
- `apps/v1_api/src/teams/team-invite-link*.ts`
- `apps/v1_api/src/tournaments/team-competition-entries.*.ts`
- `apps/v1_api/src/sports/level-range.ts`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`

## Recruiting contact and dissolution fixture routes (2026-10-03)

The `recruiting_only` signal shared by team detail `canSendContact` and contact creation requires `hostTeamId=<recipient>`, `status=recruiting`, `deletedAt=null`, `leagueId=null`, and `tournamentId=null`. Deleted listings or competition fixtures do not open a team's contact inbox. The generic rejection still does not distinguish block/policy/not-recruiting causes.

Live-game dissolution blockers choose league fixture detail first (`/league-matches/:leagueId/fixtures/:teamMatchId`), then tournament detail (`/tournaments/:tournamentId/matches/:teamMatchId`), then friendly detail. This is necessary because regular league fixtures also carry `tournamentId`. Blocker rules and dissolution mutation behavior are unchanged.
