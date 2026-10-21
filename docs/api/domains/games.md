> Task 172: 신규 친선 팀매치의 참가자 공동 기록은 [team-matches 공동 기록 계약](./team-matches.md#v1-친선-팀매치-공동-경기-기록-task-172)을 따른다. 공유 기록이 시작된 Game에서 기존 결과 제출·event·경기 진행 command는 `SHARED_RECORD_REQUIRED`로 차단된다. 리그/대회·기존 결과 revision 흐름은 유지한다. 공동 기록 확정도 기존 `GAME_RESULT_OFFICIAL` projection을 사용한다.

# Game aggregate contract

## Explicit-start league result gate (2026-10-19)

For a regular league with `requiresExplicitStart=true`, stored lifecycle `draft`, `open`, or `closed`
rejects both `POST /api/v1/games/:gameId/result-revisions` and
`POST /api/v1/games/:gameId/result-revisions/:revisionId/submit` with `409 LEAGUE_NOT_STARTED`,
including platform operations actors. The same lifecycle gate protects game start. Denied requests
do not create/submit revisions or advance the Game version/state. Existing authorization,
idempotency and expected-version checks remain in force. Legacy leagues with the flag false retain
their existing automatic-start result flow.

Participant roster navigation: authenticated team roster reads also include `registrationId` for active `TEAM_MANAGER`/`TEAM_MEMBER` viewers when their base is a confirmed participant registration. It identifies the existing participant-roster read route; `jerseyRegistrationId`/`jerseyEditable` retain their separate manager-only write semantics. Operators and teams using the team-member fallback receive null. The registration and player APIs still enforce team membership and redact other players' personal information for ordinary members.

## Public fixture detail compatibility

The shared tournament fixture detail URL may address a regular league
`TeamMatch`. The API dispatches that case to the existing league public
projection without changing Game source, visibility, permissions, or history
rules. Operational failures continue through the normal error pipeline; public
not-found cases remain indistinguishable as `TOURNAMENT_MATCH_NOT_FOUND`.


## Task 168 Phase 3 contract addendum (candidate)

- Canonical game creation and reads use `TEAM_MATCH` games bound to `V1TeamMatch`; `fixtureId` remains a stable route and response alias where the public contract already exposes it. Legacy-only bindings fail closed and are not reclassified as friendly matches.
- Result corrections create a superseding draft and officialization moves the current official pointer atomically; public records select the current official revision, while match time remains the persisted TeamMatch time. Period and event details come from canonical Game rows.
- Tournament and friendly video surfaces persist `V1TeamMatchVideo`; the removed fixture-video Prisma model is not a runtime fallback.
- These clauses describe the candidate contract only. They do not claim the 11-migration retirement has reached dev or Alpha, and they do not authorize a production DROP.

- Stage A promotes the canonical runtime contract while the five legacy fixture tables remain physically present and are excluded from the generated runtime client. Physical removal belongs to the later, separately gated Stage B release.

## Current Task 6 runtime surface

`GamesModule` is assembled once at the `AppModule` root and exports `GamesService` for the
Team Match and Tournament source adapters. `TeamMatchesModule` and `TournamentsModule` also
import that same module to consume the service; Nest resolves the static module once, so this is
not a duplicate provider registration or a circular dependency.

`GamesService` receives the shared `OperationAuditWriterService` from
`OperationAuditModule`; it does not construct a private writer. Game command audits therefore use
the same validated, append-only operation-audit boundary as tournament staff mutations while
remaining in the command transaction. This module wiring changes no Game endpoint or DTO.

All successful responses use the v1 `{ status, data, timestamp }` envelope. `V1AuthGuard`
means an authenticated v1 user, and the service then re-checks source-specific authority. The
only public read is the visibility projection; it uses `OptionalV1AuthGuard` and never exposes
raw roster identity fields.

| Method | Path | Guard / service scope | DTO and runtime contract |
|---|---|---|---|
| `GET` | `/api/v1/games/:gameId/visibility` | optional auth; public visibility policy | Returns the serialized `live`, `status_only` or `official_only` projection. A missing game or policy is `404`; `PUBLIC_LIVE=off` demotes `live` to `official_only` (confirmed results stay public). The stored policy is mapped through the same `effectivePublicVisibilityMode` helper the public-records lanes use (`docs/api/domains/public-records.md`), so all four stored modes resolve the same way on both surfaces. `OFFICIAL_ONLY` serves the official score and official events with `lineup: null` and never the in-progress score or live events; `HIDDEN` is an absolute deny (D-06) answered with `404 GAME_NOT_FOUND`, the same answer the public-records lanes give, so a hidden game is indistinguishable from one that does not exist. |
| `GET` | `/api/v1/games/:gameId` | authenticated; source-scoped reader | Returns game, sides, periods, lineups, current version/sequence and current official revision reference. **Live-substitution addition**: also returns `substitutionPolicy: { mode: 'limited' \| 'rolling'; maxSubstitutions: number \| null }`, resolved from the pinned `V1CompetitionConfigVersion.lineup` — the live console uses `mode` (never a hardcoded sport name) to decide whether to surface the substitution action at all, and `maxSubstitutions` to show a remaining-count. **Task 166**: `'rolling'` 이면 콘솔이 교체 액션을 **아예 그리지 않는다**(롤링 전용이던 quick-substitution 모드도 함께 삭제됐다) — 서버가 그 명령을 거부하므로 버튼을 남기면 누를 수 있는데 항상 실패하는 액션이 된다. **Penalty-shootout-entry addition**: also returns `isKnockoutFixture: boolean`, computed with the same `GamesService#isKnockoutFixture` check `applyPenalties` already enforces server-side (`V1TournamentFixture.group.phase !== 'group'`; a fixture with no group is `false`). The live console gates its "승부차기 시작" (start penalty shootout) affordance on this field so it never offers a shootout entry step that would fail at `end` submission with `409 TOURNAMENT_PENALTY_NOT_ALLOWED`. |
| `POST` | `/api/v1/games/:gameId/commands/:command` | authenticated tournament command actor | `GameCommandDto`; `command` is `start`, `pause`, `resume`, `end`, `end-period`, `start-period`, or `revert-period`. Friendly team-match `end` is `409 TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN`; canonical competition `TEAM_MATCH` games use the existing operational commands, and their `end` derives its result revision in the same transaction. Automatic clock expiry only ends a period as described below. **Cancelled fixture (Task 180 W4-V14)**: when the game's league/tournament team match is already `cancelled` (a fixture cancelled while its game was running), `end` — normal or with a forfeit/abandon `outcomeReason` — closes the game as `CANCELLED` instead: open periods are ended, visibility drops to `STATUS_ONLY`, and no result revision or team-match completion is written (the response `state` is `CANCELLED`). `TEAM_MATCH_NOT_MATCHED` from the result boundary now carries a Korean message. `start` on a league/tournament fixture that is already `cancelled` returns `409 TOURNAMENT_MATCH_CANCELLED` (fixture cancellation does not touch the game, so a console left open could otherwise start it); friendly team matches are unaffected — their cancellation already cancels the scheduled game. **Penalty shootout**: `end`'s `payload.penalties?: { home: number; away: number }` (parsed by `extractEndPenalties`) records a knockout-fixture shootout score alongside the regulation score — rejected with `422 TOURNAMENT_PENALTY_INVALID` if not decisive (`home === away`) or malformed, and `409 TOURNAMENT_PENALTY_NOT_ALLOWED` if the fixture isn't a knockout-phase fixture or regulation didn't end level. The live console's penalty-shootout-entry panel (`operate-console.tsx`) only ever sends the final tally here — no per-kick record is persisted anywhere (see `apps/v1_web/src/lib/penalty-shootout.ts` doc for that trade-off). |
| `POST` | `/api/v1/games/:gameId/cancel` | authenticated source-scoped cancel actor | `CancelGameDto`; transitions to `CANCELLED` and makes visibility status-only. |
| `GET` | `/api/v1/games/:gameId/events?afterSequence=N` | authenticated; source-scoped reader | `ListGameEventsQueryDto`; `N` defaults to `0` and otherwise accepts ASCII digits for a safe non-negative integer only. Returns ascending events with `N < sequence <= lastSequence`, the coherent `lastSequence` watermark, and `gap: null` or the first observed `{ expectedSequence, availableFrom }`. Invalid, empty, repeated, exponent, hex, signed, fractional, or unsafe cursors return `400 VALIDATION_ERROR`. |
| `POST` | `/api/v1/games/:gameId/events` | authenticated event actor with takeover token | `AppendGameEventDto`; appends one sequenced event. Terminal games reject mutation with `409 TERMINAL_GAME_IMMUTABLE`. `type` accepts any `V1GameEventType` including `CORRECTION` -- this endpoint does not require `reversesEventId` and never sets it; only `/events/:eventId/reverse` below does. **Task 21 note**: the live operations console's foul secondary action currently posts `type: CORRECTION` here (not via `/reverse`) with an ad hoc `payload.kind: 'FOUL'` marker, purely as an annotation -- `deriveTournamentRevision()`'s score/card tally ignores it. A `CORRECTION` row from this route therefore always has `reversesEventId: null`; a real reversal always has it set. Any reader must key off `payload.kind`/`reversesEventId`, never `type` alone, to tell the two apart. This is a known, frozen-schema workaround (no dedicated `FOUL` enum value exists yet) pending a future migration. **Live-substitution addition**: `type: 'SUBSTITUTION'` requires `sideId` + `participantId` (the INCOMING participant) + a string `payload.outParticipantId` (the OUTGOING participant) — both must belong to `sideId`, the outgoing participant must currently be on the pitch and the incoming one must not be (derived by folding `V1GameParticipant.started` with every non-reversed prior `SUBSTITUTION` event in `sequence` order — see `GamesService#assertSubstitution` / `games/core/substitution.ts`). Violations return `422` with `SUBSTITUTION_INVALID`, `PARTICIPANT_SIDE_MISMATCH`, `SUBSTITUTION_OUT_NOT_ON_PITCH`, `SUBSTITUTION_IN_ALREADY_ON_PITCH`, or (when the config's `lineup.substitutions === 'limited'` and the side has used its `maxSubstitutions`) `SUBSTITUTION_LIMIT_REACHED`. **Task 166**: `lineup.substitutions === 'rolling'` 이면 교체 기록 자체가 `422 SUBSTITUTION_NOT_TRACKED` 로 **거부된다**(정본 §3 — 롤링 종목은 교체 기록이 없다). 그 검사는 다른 모든 검사보다 **먼저** 걸린다 — 롤링 경기에서는 "같은 팀인가·피치 위인가" 라는 질문 자체가 의미 없고, 그것들이 먼저 걸리면 운영자가 "선수를 잘못 골랐다" 로 읽는다. 대회·친선을 가르지 않는다(종목 설정으로만 갈린다). **이미 기록된 SUBSTITUTION 이벤트는 그대로 읽힌다** — 이 가드는 새 기록만 막는다. On success the incoming participant's `position`/`positionX`/`positionY` are overwritten with the outgoing participant's — the only other write this route performs besides the event row and `V1Game.lastSequence`/`version`. |
| `POST` | `/api/v1/games/:gameId/events/:eventId/reverse` | authenticated reverse actor with takeover token | `ReverseGameEventDto`; appends one `CORRECTION` event that references the original; it does not mutate or delete it. |
| `GET` | `/api/v1/games/:gameId/lineups` | authenticated; source-scoped reader | Returns lineup revisions in side/revision order. **Task 21 addition**: each lineup row also carries `participants: V1GameParticipant[]` (jersey/name/position), loaded in one bounded query. For friendly `DEFAULT_PREVIEW`, only the preview belonging to the reader's authorized team is returned; other-side unpublished draft snapshots are omitted. A team reader remains scoped to its own lineup rows on this route. The lineup rows, persisted participants, and effective roster are read in one PostgreSQL `RepeatableRead` transaction. **운영진 실명(2026-10-18)**: `operations-lineup` 과 같은 규칙으로, 대회 운영진(`platform_ops`·`tournament_director`·`field_operator`)이 부르면 각 `participants[]` 항목에 `identity: { realName, phone } \| null` 이 더해진다(운영 콘솔이 읽는 대진 라인업 `GET /tournament-ops/tournaments/:tournamentId/fixtures/:fixtureId/lineup` 도 이 경로를 쓴다). 그 밖의 역할에게는 키 자체가 없다. |
| `GET` | `/api/v1/games/:gameId/operations-lineup` | authenticated; source-scoped reader | 라이브 기록 콘솔 전용 라인업 읽기. 유효한 팀 액터는 시작 전 자기 side만, 경기 시작 뒤 기존처럼 양쪽 lineup row를 받는다. 팀 bound `support_readonly`는 그 팀으로 scope되고, 팀 ID가 없는 대회 스태프 `support_readonly`는 기존 staff scope를 유지한다. 다만 팀 액터의 상대 참가자 이름·user ID는 실제 공개 시각 전에는 숨긴다. 공개 시각은 경기 정책 `lineupAt`이며, 값이 없으면 실제 경기 예정 시각에서 60분 전을 계산한다(예정 시각도 없으면 공개하지 않는다). 그 시각이 지나고 친선의 최신 effective source가 수동 제출(`SUBMITTED`/`LOCKED`)이거나 대회·리그의 가장 높은 유효 제출/잠금 리비전이 있을 때 상대 명단을 반환한다. 추가로 실제 `LIVE` 기록 요청이고 기존 `event_append` 권한(호스트 팀 오너·매니저 또는 `platform_ops`)이 확인된 경우에만, 공개 시각 이후 상대의 effective `DEFAULT_PREVIEW`/`DEFAULT_FROZEN` 참가자 UUID도 기록 선택용으로 반환한다. 이 예외는 공개 시각을 앞당기지 않고 `identity` 정보를 추가하지 않는다. 새 DRAFT가 있어도 더 높은 번호의 제출/잠금 리비전이 있으면 그 제출본을 쓴다. 제출했더라도 공개 시각 전이면 비공개다. 팀 side를 찾지 못한 team actor 요청은 `404 GAME_SIDE_NOT_FOUND`로 fail closed한다. 운영진 역할의 기존 조회 권한은 유지한다. 두 lineup 읽기는 actor authorization·lineup·participant·identity·effective roster를 같은 `RepeatableRead` snapshot에서 읽는다. **명단 검인 본인 확인 정보(2026-10-13)**: 대회 운영진(`platform_ops`·`tournament_director`·`field_operator`)이 부르면 각 `participants[]` 항목에 `identity: { realName: string \| null; phone: string \| null } \| null` 이 더해진다 — 계정과 연결된 선수의 실명·전화번호이고, 계정이 없는 참가자와 탈퇴 회원은 `null`. **그 밖의 역할에게는 `identity` 키 자체가 없다**. |
| `PUT` | `/api/v1/games/:gameId/lineups/:sideId` | authenticated lineup actor | **Task 179: 쓰기 경로 폐기.** 인가(`resolveActor` `lineup_mutate`)만 태운 뒤 친선은 `409 TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN`(`/team-matches/:teamMatchId/lineup` 사용), 대회·리그는 `409 ROSTER_MANAGED_BY_ADJUSTMENTS`(경기 명단 조정 API 사용). body 는 읽지 않는다. |
| `POST` | `/api/v1/games/:gameId/lineups/:lineupId/submit` | authenticated lineup actor | 위 저장 경로와 같다(항상 409). 대회·리그 명단은 동기화가 제출본(`SUBMITTED`)으로 직접 만든다. |
| `PATCH` | `/api/v1/games/:gameId/participants/:participantId/arrival` | authenticated lineup actor (`lineup_mutate`; 팀 액터는 자기 팀 사이드만) | `SetParticipantArrivalDto { arrived }` → `{ id, sideId, arrivedAt }`. 명단 검인 토글 — 버전 커맨드가 아니고 경기 상태로 막지 않는다(이미 검인한 사람은 첫 시각 유지). 경기 행을 잡은 뒤, 참가자가 그 사이드에서 화면이 보여 주는 리비전(제출본이 있으면 제출본 중 최신, 없으면 최신) 소속이 아니면 `409 GAME_PARTICIPANT_SUPERSEDED`(명단이 다시 맞춰져 대체된 리비전의 행 — 새로 불러와 다시 누른다). **Task 179**: 명단 재계산이 만든 새 리비전은 같은 사람(계정, 계정 없으면 이름)의 검인 시각을 이어받는다. |
| `POST` | `/api/v1/games/:gameId/sides/:sideId/arrival/confirm-all` | authenticated lineup actor (`lineup_mutate`; 팀 액터는 자기 팀 사이드만) | 본문 없음 → `{ sideId, participantCount, newlyArrivedCount }`. 한 팀의 명단 검인을 한 번에 채우는 "전원 도착"(Task 180 G6). 위 개별 검인과 같은 규칙이다 — 경기 행을 잡은 뒤 화면이 보여 주는 리비전(제출본이 있으면 제출본 중 최신, 없으면 최신)의 참가자만 대상이고, 이미 검인한 사람의 최초 시각은 다시 쓰지 않는다(`newlyArrivedCount` 는 이번에 새로 채운 수). 사이드가 이 경기 것이 아니면 `404 GAME_SIDE_NOT_FOUND`, 팀 액터가 다른 팀 사이드면 `403`. 취소(전원 미확인)는 이 경로에 없다 — 개별 토글만. |
| `GET` | `/api/v1/games/:gameId/result-revisions` | authenticated; source-scoped reader | Returns newest-first revision history with result participants. **Regular league**: any *active* member of either registered team may read, not just owners/managers — the result screen is the whole squad's receipt (canonical flow §4). Lineup mutation stays owner/manager-only. |
| `POST` | `/api/v1/games/:gameId/result-revisions` | authenticated **host** team owner/manager only (Task 16) | `CreateGameResultRevisionDto`; team-match only. Tournament sources return `409 TOURNAMENT_RESULT_DERIVED_ONLY` before creating a draft. The opposing team's manager/owner gets `403 PERMISSION_DENIED` — their sole authority over the result is the decision route below, never drafting or submitting it. A team match whose status is neither `matched` nor `completed`, or that has no approved applicant team, returns `409 TEAM_MATCH_NOT_MATCHED` (Task 16) — its Game row exists from creation with a placeholder, teamId-less AWAY side, so there is no real opponent to draft a result against yet. `completed` is accepted alongside `matched` specifically so the correction loop stays reachable: the first submit below atomically completes the `V1TeamMatch`, and a later opponent change-request must still let the host draft a superseding revision against that now-`completed` match. **Regular league**: a match whose competition kind is `regular_league` is an operations-admin lane — every team actor, host or opponent, receives `403 PERMISSION_DENIED`. The result is produced by the live console's `end` command and confirmed by an admin (canonical flow §4; `GamesService#resolveActor`'s `regularLeagueResultAction`). |
| `POST` | `/api/v1/games/:gameId/result-revisions/:revisionId/submit` | authenticated **host** team owner/manager only (Task 16) | `SubmitGameResultRevisionDto`; team-match only. Same `409 TEAM_MATCH_NOT_MATCHED` precondition as the draft route above. It atomically validates/submits the revision and moves `SCHEDULED`, `LIVE`, or `PAUSED` to `ENDED`; the same transaction also completes the linked `V1TeamMatch` (`status=completed`, `completedAt`) — idempotently, via a `status != completed` guard so a correction-loop resubmit is a no-op — and, on the first real transition only, writes a matching `V1StatusChangeLog` row (`team_match`, `matched → completed`) so review eligibility keeps working and the status history stays complete now that the old `POST /api/v1/team-matches/:teamMatchId/complete` shortcut is removed (Task 16 — that route bypassed all result validation and opponent approval and never was part of this frozen contract). **Regular league**: a match whose competition kind is `regular_league` is an operations-admin lane — every team actor, host or opponent, receives `403 PERMISSION_DENIED`. The result is produced by the live console's `end` command and confirmed by an admin (canonical flow §4; `GamesService#resolveActor`'s `regularLeagueResultAction`). |
| `POST` | `/api/v1/games/:gameId/result-revisions/:revisionId/decision` | authenticated opposing team result decider | `DecideGameResultRevisionDto`; `approve` or `change_request` for a team-match revision. **Regular league**: a match whose competition kind is `regular_league` is an operations-admin lane — every team actor, host or opponent, receives `403 PERMISSION_DENIED`. The result is produced by the live console's `end` command and confirmed by an admin (canonical flow §4; `GamesService#resolveActor`'s `regularLeagueResultAction`). |
| `GET` | `/api/v1/games/:gameId/sides/:sideId/roster` | authenticated; **그 사이드 팀** 활성 멤버 · 플랫폼 어드민(support 는 `viewerRole=ADMIN`·`editable=false` 읽기만) · 그 대회 스태프 (Task 179) | 대회·리그 경기 한 팀의 명단. `base`(참가 명단 전체 + `status` PARTICIPATING/EXCLUDED/UNAVAILABLE/SUSPENDED), `participants`(계산된 출전자, `joinedAfterFixtureCreated` = 대진 때 명단에 없던 계정), `excluded`(사유·행위자·시각), `suspended`(`remainingMatches`), `unavailable`(결장 기간), `counts`(목록은 모두 등번호 오름차순, 번호 없는 선수는 뒤에 이름순), `editable`(쓰기 권한 AND `gameState=SCHEDULED`), `deadline`(= 경기 시작 시각), `viewerRole`, `baseSource`(REGISTRATION/TEAM_MEMBERS), `legacyLineupPending`(리그 팀장 저장본이 이관 전이라 경기 기록 명단이 계산을 따르지 않는 상태). **Task 180**: 모든 사람 행에 `participantId`(참가 명단 선수 id = 등번호 저장 API `PATCH /tournaments/:tournamentId/registrations/:registrationId/players/:playerId/jersey-number` 의 `:playerId`, 계정 없는 리그 폴백 팀원은 null)를 싣고, 본문에 `jerseyRegistrationId`(그 API 의 `:registrationId` = 확정된 참가 신청 id)를 싣는다 — 참가 명단이 기준(`baseSource=REGISTRATION`)이고 뷰어가 사이드 팀 owner·manager(`viewerRole=TEAM_MANAGER`)일 때만 채우고, 그 밖(팀원·운영자·팀원 기준 폴백)은 null. `jerseyEditable` 은 그 신청의 명단이 잠겼거나(`rosterLockedAt`) 제출 마감이 지나는 등 등번호 저장 API 가 409 로 막는 상태면 false(`jerseyRegistrationId` 가 null 이어도 false) — 화면은 번호 칸을 열지 않고 이유를 안내한다. 경기가 시작됐는지는 가르지 않는다(번호는 대회·리그 전체에 걸린 값이고, 화면이 시작한 경기의 번호 칸을 읽기 전용으로 둔다). **경기가 시작된 뒤**(`gameState≠SCHEDULED`)에는 참가 명단을 다시 계산하지 않는다(동기화도 시작 뒤 멈춘다): `participants` = 경기 기록 명단(종료 후 현재 `OFFICIAL` 리비전이 있으면 그 사이드의 공식 출전자, 그 밖에는 사이드의 제출본 또는 없으면 최신 리비전; 상세 기준은 아래 "종료 경기의 공식 출전자 조회", 등번호·이름은 기록값), `base` = 그 명단 + 사유가 있어 빠진 사람(시작 뒤 참가 명단에 들어온 선수는 없다), 기록에 있는 사람은 시작 뒤 생긴 결장·정지로 빠짐이 되지 않는다. 기록 행이 참가 명단에 없으면(시작 뒤 삭제) `participantId=null`, 계정 없이 기록된 행을 팀원과 이름으로 잇지 못하면 `userId` 에 `game-participant:<경기 참가자 행 id>` 를 싣는다. 친선·팀 미정 사이드·확정 명단 없는 팀은 `404 GAME_ROSTER_NOT_AVAILABLE`, 상대팀·외부인은 `403 PERMISSION_DENIED`. **운영진 실명(2026-10-15)**: 대회 운영진(`platform_ops`·`tournament_director`·`field_operator`)이 부르면 모든 사람 행(`base`·`participants`·`excluded`·`suspended`·`unavailable`)에 `realName`(계정 프로필 실명)이 더해진다 — 운영 보드 킥오프 준비·명단 화면이 `실명 (닉네임)` 으로 그리는 현장 확인용이다. 실명이 비었거나 탈퇴한 계정·계정 없는 행에는 키가 없다. **그 밖의 역할(팀 매니저·오너·팀 멤버·`support_readonly`)에게는 `realName` 키 자체가 없고 계정 조회도 하지 않는다**(`operations-lineup` 의 `identity` 와 같은 역할 집합). `displayName`(닉네임 기본)과 경기 기록은 바뀌지 않는다. |
| `GET` | `/api/v1/teams/:teamId/games/:gameId/roster` | 위와 같음 — 사이드를 찾은 뒤 같은 판정(`authorizeSide` read)을 탄다 (Task 179) | 경로의 팀이 뛰는 사이드를 경기에서 찾아 위 경기 명단 GET 과 **같은 본문**에 `opponentName`(그 팀 기준 상대 팀 이름, 상대 미정이면 null)을 더한다(`sideId` 는 본문에 이미 있다). 사이드 ID 를 모르는 화면(대회 팀원의 시작 후 경기·시각 미정 경기, support 어드민의 운영 보드 링크)이 한 번에 명단을 연다. 그 팀이 그 경기 사이드가 아니거나 친선·팀 미정·확정 명단 없는 팀은 `404 GAME_ROSTER_NOT_AVAILABLE`, 없는 경기는 `404 GAME_NOT_FOUND`, 권한은 경로의 팀이 아니라 그 사이드 팀 멤버십으로 판정해 상대팀·외부인은 `403 PERMISSION_DENIED`. |
| `GET` | `/api/v1/games/:gameId/sides/:sideId/roster-adjustments` | 위와 같음 | 변경 기록 `{ gameId, sideId, teamId, events[] }`. `events[]` = `{ type: EXCLUDE\|REVOKE, adjustmentId, userId, displayName, reason, actor: { userId, displayName, role }, at }` 시간순. `actor.role` 은 빼기·되돌리기 모두 TEAM_MANAGER/ADMIN/STAFF, 사이드 팀이 바뀌어 자동으로 되돌린 기록은 `actor = { userId: null, displayName: '시스템', role: 'SYSTEM' }`. **지금 사이드 팀의 기록만** 싣는다 — 진출 재투영·대진 수정으로 팀이 바뀌면 이전 팀의 선수·사유는 새 팀에 보이지 않는다(`teamId` = 지금 사이드 팀). 사유는 이 두 GET(팀·운영자 전용)에만 싣고 공개 응답에는 없다. **운영진 실명(2026-10-18)**: 대회 운영진(`platform_ops`·`tournament_director`·`field_operator`)이 부르면 빠진 선수의 `realName`(계정 프로필 실명, 값이 있을 때만)이 이벤트에 더해진다. 행위자(`actor`)에는 싣지 않고, 그 밖의 역할에게는 키 자체가 없다. |
| `POST` | `/api/v1/games/:gameId/sides/:sideId/roster-adjustments` | 그 사이드 팀 owner·manager · 플랫폼 운영자 · 라인업 쓰기 가능한 대회 스태프(`support_readonly` 제외) | `CreateGameRosterAdjustmentDto { userId, reason?: INJURY\|PERSONAL\|LATE_OR_EARLY\|OTHER }` → 200 `{ alreadyApplied, adjustment, roster }`. `actorRole` 은 TEAM_MANAGER/ADMIN/STAFF. 기준 명단 밖이면 `422 ROSTER_ADJUSTMENT_NOT_IN_ROSTER`, 경기가 `SCHEDULED` 가 아니면 `409 LINEUP_DEADLINE_PASSED`(게임 행을 잠가 시작 명령과 직렬화), 인가 뒤 잠그는 사이에 사이드 팀이 바뀌었으면 `409 COMMAND_CONCURRENCY_CONFLICT`. 조정 행은 그때의 사이드 팀(`teamId`)에 묶이고, 사이드 팀이 바뀌는 쓰기(진출 재투영·배정 해제·대진 수정)는 새 팀이 아닌 활성 조정을 시스템 되돌리기(`revokedByRole=SYSTEM`)로 닫는다 — 같은 팀이 다시 배정돼도 옛 빼기가 되살아나지 않는다. 이미 빠져 있으면 첫 기록을 그대로 돌려준다(`alreadyApplied: true`). 같은 트랜잭션에서 경기 명단을 다시 맞춘다(새 SUBMITTED 리비전, 행 삭제 없음, 검인 시각 이월). 잠금은 대회·리그 행 → 명단 행 없는 리그 확정 신청 채우기 → 경기 순이다. 경기 잠금이 결과 확정·대진 수정 등과 겹치면 NOWAIT로 전체 명단 쓰기를 롤백하고 `409 COMMAND_CONCURRENCY_CONFLICT`를 반환한다(다시 조회 후 재시도). 후속 명단 워커의 같은 충돌은 기존 outbox 재시도로 처리한다. |
| `DELETE` | `/api/v1/games/:gameId/sides/:sideId/roster-adjustments/:userId` | POST 와 같음 | 지금 사이드 팀의 활성 EXCLUDE 를 `revokedAt`·`revokedByUserId`·`revokedByRole`(되돌린 사람 역할)로 되돌린다(행은 남는다) → 200 `{ alreadyApplied, roster }`. 활성 조정이 없으면 `alreadyApplied: true`. 마감 규칙은 POST 와 같다. |
| `GET` | `/api/v1/teams/:teamId/game-rosters` | 그 팀 owner·manager · 플랫폼 어드민(support 는 읽기만). 팀원·대회 스태프는 `403 PERMISSION_DENIED` (Task 179 팀 B) | 선수 × 시작 전 대회·리그 경기 표. 시작 전 = `SCHEDULED` — 대회 경기는 킥오프 시각이 지나도 시작 명령 전이면 포함하고(지연 경기, 끝난·취소된 대회 제외), 리그 경기는 킥오프 시각 전까지만(결과 입력이 `SCHEDULED` 에서 바로 끝낼 수 있어 시각이 지난 경기는 이미 치렀을 수 있다). 저장된 경기 명단의 재계산(후속 이벤트 `COMPETITION_ROSTER_RESYNC`)도 같은 경기들을 대상으로 한다. `games[]` = `{ gameId, sideId, teamMatchId, competitionId, competitionKind, competitionTitle, opponentName, scheduledAt, gameState, editable, summary }`(시각순, `summary` = `{ participating, excluded, unavailable, suspended }`, 확정 명단 없는 경기는 null), `players[]` = `{ userId, displayName, accountLinked, cells[] }`(이름순 — 대회·리그마다 등번호가 달라서) — `cells` 는 `games` 와 같은 순서로 `{ gameId, status: PARTICIPATING\|EXCLUDED\|UNAVAILABLE\|SUSPENDED\|NOT_IN_ROSTER, reason, actorRole, adjustmentId, unavailabilityId, remainingMatches }`. |
| `POST` | `/api/v1/teams/:teamId/game-rosters/batch` | 경기마다 그 팀 사이드 기준으로 경기 명단 POST 와 같은 권한 | `GameRosterBatchDto { changes: [{ gameId, userId, op: EXCLUDE\|REVOKE, reason? }] }`(1~200건, 같은 경기·선수 중복·REVOKE 에 사유는 400) → 200 `{ teamId, results[]: { gameId, sideId, userId, op, alreadyApplied } }`. 한 트랜잭션 — 게임 행을 id 순으로 잠그고 하나라도 `SCHEDULED` 가 아니면 `409 LINEUP_DEADLINE_PASSED`(`details.gameIds`), 그 팀이 안 뛰는 경기는 `404 GAME_SIDE_NOT_FOUND`, 기준 밖 선수는 `422`. 어느 경우든 아무것도 쓰지 않는다. 바뀐 사이드마다 명단을 한 번 다시 맞춘다. |
| `GET` | `/api/v1/teams/:teamId/members/:userId/unavailability` | 그 팀 활성 멤버 · 플랫폼 어드민 (Task 179 팀 C) | 그 팀원의 결장 기간(취소 포함) `items[]` = `{ id, teamId, userId, startsAt, endsAt, reason, actor: { userId, displayName, role }, createdAt, revokedAt }`, 시작 시각 내림차순. |
| `GET` | `/api/v1/teams/:teamId/unavailability?activeAt=<ISO 8601>` | 팀원별 결장 조회와 같다 — 그 팀 활성 멤버 · 플랫폼 어드민(support 포함). 대회 스태프·떠난 팀원은 `403 PERMISSION_DENIED` (Task 179) | `activeAt`(선택, 없으면 지금)을 덮는(`startsAt <= activeAt < endsAt`) 취소 안 된 결장 기간 중 **지금 활성 팀원**의 것만 `{ items[]: { id, userId, reason, startsAt, endsAt, actorRole } }`, 시작 시각 오름차순(한 사람이 겹치는 기간을 가지면 경기 명단 계산처럼 먼저 시작한 것이 앞). 친선 참석명단의 "결장 중" 표시용 — 친선에는 자동 제외가 없다. `activeAt` 이 ISO 8601 이 아니거나 없는 날짜면 `400`. |
| `POST` | `/api/v1/teams/:teamId/members/:userId/unavailability` | 그 팀 owner·manager · 플랫폼 어드민(support 제외). **본인 것은 등록·취소 불가**(D6), 대회 스태프 불가 | `CreateMemberUnavailabilityDto { startsAt, endsAt, reason?: INJURY\|PERSONAL\|OTHER }` → 201 `{ unavailability }`. `startsAt < endsAt` 아니면 `400 UNAVAILABILITY_INVALID_PERIOD`, 활동 중 팀원이 아니면 `404 TEAM_MEMBER_NOT_FOUND`. 시작 시각이 `[startsAt, endsAt)` 안인 시작 전 대회·리그 경기에서 빠진다(친선 제외). 조회(경기 명단 GET·팀 표)는 요청 때 계산해 곧바로 반영되고, 저장된 경기 명단(제출본)은 후속 이벤트 `COMPETITION_ROSTER_RESYNC` 를 워커가 처리하며 맞춘다. |
| `DELETE` | `/api/v1/teams/:teamId/members/:userId/unavailability/:unavailabilityId` | POST 와 같음 | `revokedAt` 으로 취소(행은 남는다) → 200 `{ alreadyApplied, unavailability }`. 없는 id 는 `404 UNAVAILABILITY_NOT_FOUND`. |
| `GET` | `/api/v1/admin/tournaments/:tournamentId/registrations/:registrationId/game-rosters` | 플랫폼 어드민(support 포함, support 는 `editable=false`) · 그 대회 스태프(`support_readonly` 포함, 라인업 쓰기 판정이 없으면 `editable=false`) | 참가 신청 팀의 선수 × 경기 표(대회·리그 공통, 모양은 팀 표와 같고 그 대회·리그 경기만). **진행한 경기 포함(2026-10-20)**: 팀 표의 시작 전 경기에 더해 그 대회·리그에서 시작된 경기(`LIVE`·`PAUSED`·`ENDED`)도 시각순으로 싣는다 — 취소된 경기(`CANCELLED`)·취소된 대진은 빠진다. 시작된 경기 칸은 경기 명단 화면과 같은 규칙으로 기록 명단을 출전자로 보여 준다(종료 경기는 현재 공식 리비전 출전자, 그 밖에는 제출본 — 없으면 최신 리비전). 기록에 있는 사람은 시작 뒤 생긴 결장·정지로 빠짐이 되지 않고, 시작 뒤 참가 명단에 들어온 사람은 `NOT_IN_ROSTER`, 명단을 떠난 출전자도 행으로 남는다. 시작된 경기는 `editable=false`(정정은 결과 정정에서). `{ registrationId, teamId, competitionId, viewerRole: ADMIN\|STAFF, games, players }`. 권한을 먼저 보고, 그 대회 신청이 아니면 `404 REGISTRATION_NOT_FOUND`. 쓰기는 경기 명단 API 를 운영자 권한으로 쓴다. **운영진 실명(2026-10-18)**: owner·ops 어드민과 디렉터·현장 운영자 스태프에게는 계정 선수 행에 `realName` 이 더해진다(값이 있을 때만). support 어드민·`support_readonly` 스태프에게는 키 자체가 없고 계정도 조회하지 않는다. |
| `GET` | `/api/v1/teams/:teamId/upcoming-games` | 그 팀 활성 멤버 | 팀의 다가오는 경기(라인업 할 일과 같은 수집 경로, 완료 포함). 항목 `{ gameId, source, competitionKind: TOURNAMENT\|LEAGUE\|FRIENDLY, teamMatchId, sideId, title, opponentName, scheduledAt, tournamentId, tournamentTitle, lineupState, rosterSummary }`. **Task 179**: `rosterSummary` = 대회·리그 경기의 계산된 명단 `{ participating, excluded, unavailable, suspended }`, 친선·확정 명단 없는 팀은 null. 대회 경기 `title` 은 `<대회명> · <경기 이름>` 이고 경기 이름은 화면과 같은 `competitionMatchLabel` 규칙이다 — 조별 경기는 조 이름 + 라운드(`A조 · 조별리그 2라운드`), 조 없는 결선은 라운드만(`4강`, 2차전은 `4강 2차`). 라운드 코드(`league_r2`·`semi` 등)는 그대로 싣지 않는다. **Task 180 G7**: `viewerParticipating` = 요청자가 그 경기에 출전하는지(서버 판정 — 대회·리그는 계산된 경기 명단의 출전자, 친선은 그 사이드의 가장 최근 제출본 참석명단). 빠진 경기는 `false` 일 뿐 별도 값이 없고, 홈 `teamActivity.nextGame.viewerParticipating` 과 같은 판정(`viewer-game-participation.ts`)이다. |
| `GET` | `/api/v1/teams/:teamId/games/:gameId/tactics-board` | 그 팀 활성 멤버(`assertTeamLineupMember`). 경기 사이드는 `gameId`+`teamId` 로 함께 찾는다 — 그 팀이 안 뛰는 경기는 `404 TACTICS_BOARD_SIDE_NOT_FOUND` | 팀 내부 전술보드 한 판 `{ gameSideId, sideKey, teamNameSnapshot, formation, version, updatedAt, updatedByUserId, starterCount, benchCount, lineupLimits, sportCode, playersPerSide, lineupConfig, entries[] }`. 저장 전이면 `version: 0` 빈 판. **Task 180 H7**: `sportCode`(`football`\|`futsal`, 설정을 못 찾으면 null)로 화면이 코트 모양을, `playersPerSide`(GK 포함 한 팀 인원 — 친선은 경기방식이 `"N:N"` 으로 읽힐 때 그 N, 아니면 설정의 `lineup.maxPlayers`)와 `lineupConfig`(`{ positions, formations, minPlayers, maxPlayers }`, 라인업 GET 과 같은 `parseLineupConfigForResponse`)로 고를 수 있는 대형을 정한다. 보드는 명단·kickoff·결과 어느 쪽과도 연결되지 않는다(정본 §3). |
| `PUT` | `/api/v1/teams/:teamId/games/:gameId/tactics-board` | 그 팀 owner·manager(`assertTeamLineupManager`) | `SaveTeamTacticsBoardDto { formation, expectedVersion?, entries[] }` 전체 교체, compare-and-swap. 어긋나면 `409 TACTICS_BOARD_VERSION_CONFLICT`, 좌표 한쪽만 주면 `422 TACTICS_BOARD_INVALID_COORDINATE`. 응답은 GET 과 같은 모양. |

### 미제출 친선 명단 조회·기록·도착 확인 (MD-QA #146)

친선의 `GOAL`, `OWN_GOAL`, `CARD`, `FOUL`, `SUBSTITUTION`, `CORRECTION`, 결과 초안과 공동 기록은 같은 유효 명단을 사용한다. 실제 제출/잠금 명단이 있으면 그 선택을 사용하고, 실제 제출 이력·정정 요청이 없는 유효 `DRAFT`는 현재 자격을 만족하는 전체 팀원을 기본 출전자로 계산한다. 저장한 미제출 편집 초안이 있어도 기록 명단을 그 선택으로 축소하지 않는다. 자기 명단 GET의 `effectiveRosterSource` 4개 값과 `hasSavedDraft`, 실제 제출 동작은 [Team Matches](./team-matches.md#미제출-친선의-기본-참석명단-md-qa-146)을 따른다.

- `GET /api/v1/games/:gameId/lineups`와 `GET .../operations-lineup`은 최신 기본 preview를 `participants[]`에 투영한다. 참가자 `id`는 같은 기준 명단에서 첫 기록에 사용할 UUID이며, 저장 초안의 과거 참가자 ID로 대신하지 않는다. GET은 참가자·명단 revision·identity/consent·감사를 쓰지 않는다. `DEFAULT_PREVIEW`가 유지되는 동안 새 자격 팀원은 다음 조회에 포함되고 자격을 잃은 팀원은 빠진다. 이 응답에는 pagination이 없다.
- **읽기 권한·개인정보**: 두 GET은 기존 `V1AuthGuard`와 source별 reader 권한을 유지한다. 일반 `lineups`의 team-scoped 역할은 자기 side만 읽고, `operations-lineup`도 `SCHEDULED`에서는 자기 side만 읽는다. 시작 후 운영 콘솔의 양쪽 side 행 읽기는 유지하되, team-scoped 역할의 상대 참가자 payload는 공개 시각 이후 기존 공개 규칙에 맞는 명단만 반환한다. 상대 기본 명단 UUID는 실제 `LIVE` 기록 권한(호스트 팀 오너·매니저 또는 `platform_ops`)을 가진 요청에 한해 공개 시각 이후 기록 선택용으로 포함한다. 이 조건은 별도 `identity` 권한을 주지 않는다. 친선·대회·리그 모두 정책 시각 또는 실제 예정 시각 60분 전을 공개 시각으로 쓰고, 예정 시각이 없으면 상대 명단을 공개하지 않는다. 대회·리그는 더 최신 DRAFT가 있어도 가장 높은 번호의 유효 SUBMITTED/LOCKED 리비전을 쓴다. 팀 ID가 없는 tournament `support_readonly` staff actor는 기존 all-side staff projection을 유지하며 임의 team-side 조회에 사용하지 않는다. 팀 액터에 유효한 team ID가 없거나 대응 game side가 없으면 조회를 넓히지 않고 거부/404 처리한다. `identity: { realName, phone } | null`은 두 GET 모두 `platform_ops`·`tournament_director`·`field_operator`에만 추가하며(2026-10-18부터 `lineups`도 — 운영 콘솔·결과 확인·정정이 이 경로를 읽는다), 팀 역할과 `support_readonly`에는 키 자체가 없다. 기본 명단을 통해 이 역할·공개 동의 경계를 넓히지 않는다.
- **첫 기록 경계**: 양 팀 각각 기본 또는 실제 제출 명단에 한 명 이상 있어야 한다. live append·offline retry·결과 초안은 준비되지 않으면 `409 ROSTER_INCOMPLETE`, 현재 유효 명단 밖의 참가자 ID면 `422 PARTICIPANT_INVALID`로 거절한다. 성공하는 첫 기록은 기존 `V1Game` 행 잠금과 같은 트랜잭션에서 `DEFAULT_PREVIEW`인 side에만 후속 `DRAFT` 명단과 참가자를 append하고 preview UUID·도착 확인을 유지한다. 이미 실제 제출/잠금된 side는 그대로 사용한다. `FRIENDLY_DEFAULT_ROSTER_FROZEN` 시스템 감사와 source identity link를 만들고 기존 공개 제외 동의를 승계한다. 기존 행을 옮기거나 삭제하지 않으며 `SUBMITTED`·사람의 제출 시각을 만들지 않는다. 실패하면 이 고정도 롤백된다. 고정 뒤에는 현재 팀원으로 다시 계산하지 않고, 과거 실제 제출 후 다시 열린 초안을 기본 명단으로 우회하지 않는다.
- **도착 확인**: 기존 `PATCH /games/:gameId/participants/:participantId/arrival`의 `{ arrived: boolean }`과 `POST /games/:gameId/sides/:sideId/arrival/confirm-all`의 빈 body·응답 형태를 유지한다. `lineup_mutate` 권한을 재검사하고 팀 owner/manager는 자기 side만 처리한다. `DEFAULT_PREVIEW`는 현재 계산된 UUID와 인원으로 처리하며 최초 `arrivedAt` 유지·개별 취소를 `FRIENDLY_DEFAULT_ROSTER_ARRIVAL` 사용자 감사에 순서대로 append한다. 저장 초안의 선수 선택·게스트·배치를 덮지 않고, 명단을 제출하거나 조기 고정하지 않으며 Game 상태·version과 공동 기록 version을 올리지 않는다. 도착 확인 후 자격 팀원이 바뀌어도 기본 명단은 계속 현재 자격으로 계산하고, 실제 제출·첫 기록은 같은 계정의 확인 시각을 승계한다. 오래된 preview ID는 `404 GAME_PARTICIPANT_NOT_FOUND`, 처리 중 preview가 바뀌면 `409 FRIENDLY_DEFAULT_ARRIVAL_CHANGED`다. 이미 저장된 명단의 기존 `GAME_PARTICIPANT_SUPERSEDED` 검사도 유지한다.
- **mutation 계약**: 이벤트의 `clientEventId`·payload hash, 공동 기록의 `commandId`·`expectedVersion`, 결과 revision의 기존 DTO·권한·멱등 규칙은 그대로다. 기본 명단은 새로운 쓰기 권한이나 새 command 경로를 만들지 않는다. 첫 기록과 명단 저장·제출은 같은 Game 행에서 직렬화하며, 명단 수정 잠금과 `SHARED_RECORD_REQUIRED` 등 기존 capability gate를 유지한다.
- **기록 뒤 추가만**: 친선 `late-additions`는 실제 제출/잠금 명단과 시스템 감사로 고정 출처가 검증된 최신 기본 `DRAFT`를 모두 받는다. 화면의 단일 액션 gate는 자기 명단 응답의 `lateAdditionAllowed`다. 서버는 현재 참가팀 관리 권한·최신 명단·`records_exist`/`active_lineups_complete` 잠금·결과 revision 없음 조건을 잠금 뒤 재검사하고 같은 명단에 참가자만 append한다. 기존 참가자 UUID를 유지하고 고정 기본 명단은 계속 `DRAFT`이며 사람의 제출 이력을 만들지 않는다. 구체적인 감사 검증·DTO·오류는 [Team Matches의 추가만 계약](./team-matches.md#첫-기록-뒤-추가만--상대-참석명단--응답-칩-task-180-h5)을 따른다.

**Friendly player-record hydration (Task 159):** 친선 결과 초안은 검증·저장 전에 양쪽 유효 명단을 `actualParticipants`에 합친다. 클라이언트가 보낸 통계는 유지하고 생략한 출전자는 0 득점/도움/파울/카드와 side·GK 스냅샷으로 추가한다. 위 기본 명단을 첫 기록에서 고정한 경우도 같은 경로를 사용하므로 자기 명단만 읽는 호스트 화면 때문에 상대 팀 출전 기록이 빠지지 않는다. 대회·리그 결과 산출은 이 친선 hydration 경로를 사용하지 않는다.

### 대회·리그 참가 등록 기준과 이력

대회·리그의 기본 명단은 기존 confirmed 참가 등록·경기 조정·결장·출전정지 로더와 계산을 유지한다. 친선 기본 팀원 계산으로 참가 등록을 대체하지 않는다. 리그의 `baseSource=REGISTRATION` 여부는 제거된 선수까지 포함한 등록 행의 존재로 구분한다. 등록 선수를 전원 제거했으면 현재 명단이 빈 `REGISTRATION`이며 활성 팀원으로 다시 채우지 않는다. 등록 선수 행이 한 번도 없는 경우만 기존 `TEAM_MEMBERS` fallback을 유지하고, 조회는 참가 명단을 생성하거나 복구하지 않는다. 기존 쓰기 경로의 빈 등록 자동 채움도 등록 행이 아예 없는 경우에만 적용한다.

대회·리그 결과의 side별 기존 selector는 `SUBMITTED`/`LOCKED`가 있으면 그 최신 제출본을 고르고, 제출본이 전혀 없는 side만 최신 revision으로 읽는다. 이후의 미제출 `DRAFT`가 기존 제출본을 대체하지 않는다. 친선의 현재 기본 preview·첫 기록 고정과 혼동하지 않는다.

Claimable participant responses include the persisted `sideKey` (`HOME` or `AWAY`) and a
non-null `sideLabel` snapshot for each row. Clients must render that context as returned and
must not infer a participant's side from list ordering; a missing side context is an integrity
error rather than a display fallback.

### Penalty-shootout conclusion rule

Tournament shootouts use a three-kick opening series. With `earlyStop: true` (the default),
the server accepts the result as soon as the trailing team cannot draw level with its remaining
opening kicks, so `takenHome` and `takenAway` do not have to be equal for an early conclusion.
If the score is tied after both teams complete three kicks, sudden death continues without an
upper limit; an automatic conclusion then requires both teams to have completed the same
sudden-death round and the scores to differ. The frontend previews this rule, but the API
re-evaluates the same kick counts before persisting the result.

### 실제 경기 시간 만료와 기간 종료 (MD-QA #142)

자동 종료의 단위는 진행 중인 **기간**이다. `V1GameOperationsWorkerService`가 브라우저 연결과
무관하게 저장된 시계를 확인하고, 운영자의 `end-period`와 같은 `endLiveGamePeriod` 경계를 사용한다.
새 HTTP endpoint나 client command는 추가하지 않는다.

- 대상은 `sourceType=TEAM_MATCH`, `Game.state=LIVE`, 삭제되지 않은 연결 TeamMatch이며,
  현재 기간도 `LIVE`, `startedAt` 존재, `pausedAt=null`이어야 한다. 과거
  `TOURNAMENT_FIXTURE` 행과 시작하지 않은 기간은 대상이 아니다. 공동 기록이 있어도 이미
  시작된 시계는 계속 처리하지만, 공동 기록을 위해 시계를 새로 시작하거나 만들어 내지는 않는다.
- 만료는 `now - startedAt - max(0, pausedTotalMs) >= durationMinutes * 60_000`이다.
  완료된 일시정지는 누적으로 빼고, 열린 일시정지 중에는 종료하지 않는다. 재개 시 열린 정지가
  `pausedTotalMs`에 합산된 뒤 다시 판단한다. 기준 시간은 Game에 고정된 설정의 현재 기간
  (`periods[number - 1]`)에서 읽는다. `extraTime`은 별도 연장 기간을 나타내는 boolean이며
  추가 분 수가 아니다. 연장도 그 항목의 `durationMinutes`를 한 번만 적용한다. 설정을 읽을 수
  없거나 유효한 기간 시간이 없으면 자동 종료하지 않고, 예정 일정의 `endAt`으로 추정하지 않는다.
- 만료되면 현재 기간만 `ENDED`와 `endedAt`을 저장하고 Game `version`을 1 올린다. 다음
  기간이 있으면 그 기간은 `HALFTIME`으로 두며 시작은 운영자의 `start-period`가 맡는다.
  마지막 기간이 끝나도 **Game은 `LIVE`를 유지**한다. 운영자의 기존 경기 종료/결과 제출과
  결과 확인 절차가 뒤따르며, 만료 처리 자체는 결과 revision·제출·공식 확정·완료 알림을 만들지 않는다.
- 운영자 명령과 같은 canonical Game 행을 `FOR UPDATE`로 잠근 뒤 상태·기간·버전·시계를
  새로 읽고 `Serializable` transaction에서 처리한다. Game/기간/버전으로 고정한 command ID와
  payload hash를 기존 idempotency 저장소에 기록하고, 같은 transaction에
  `actorType=SYSTEM`, `systemActor=GAME_CLOCK_EXPIRY`, `action=GAME_END_PERIOD` 감사를 남긴다.
  운영자와 경합하거나 반복 스캔해도 이미 끝난 기간을 다시 종료하지 않는다. 운영자의
  `end-period`에는 기존 권한·takeover·DTO·version·idempotency 및 `PERIOD_NOT_STARTED` 오류가
  그대로 적용되며, 내부 system actor를 요청 payload로 지정하는 경로는 없다.
- 스캔은 ID cursor로 한 번에 최대 20개를 읽고, 최소 1초 간격으로 한 번만 시작하며 한 스캔에서
  잠금을 잡는 종료 시도는 최대 1건이다. 만료 처리 여부나 스캔 오류와 별개로 기존 outbox 작업도
  계속 처리한다. 경기 수·DB 경합·worker 상태에 따라 지연될 수 있으므로 만료 시각 직후의
  확정 처리 시간을 보장하지 않는다. 콘솔은 만료 안내와 기존 수동 기간 종료를 함께 제공한다.

`GET /api/v1/games/:gameId`의 `periods`, nullable `periodDurations`, `state`, `version`이
운영 콘솔의 확인 기준이다. 기간 자동 종료는 `V1GameEvent`나 새 sequence를 만들지 않으며,
콘솔의 일반 상세 상태·버전 수락, 만료·상세 버전 지연 복구와 오류 재확인 계약은
[game realtime contract](./game-realtime.md#경기-시간-만료-확인-md-qa-142)를 따른다.

### Mutation, version, and history rules

Every Game mutation requires `expectedVersion`, an `Idempotency-Key` header, and the matching
body command ID. The matching body field is `clientCommandId` except event append/reverse, which
uses `clientEventId`. Missing or mismatched header/body values return
`422 COMMAND_IDEMPOTENCY_KEY_MISMATCH`; a stale version returns `409 VERSION_CONFLICT`; an
identical retry replays the stored response while a changed payload with the same durable key
returns `409 IDEMPOTENCY_PAYLOAD_CONFLICT`. Validation remains DTO-enforced (`400
VALIDATION_ERROR`) and source/role failure is `401`, `403`, or `404` as applicable.

Lineup save/submit is the scoped exception to the aggregate CAS meaning: save compares
`expectedVersion` with the latest revision for the route's `sideId`, and submit compares it with
the addressed draft lineup's revision. Successful lineup commands still increment `V1Game.version`
for aggregate ordering and audit, but home and away lineups do not invalidate each other's editor.

Event backfill runs in a `RepeatableRead` transaction: it fixes the Game `lastSequence` first and
then bounds the ascending event query by that watermark. The response therefore never combines
events newer than its advertised watermark. `gap` reports the first discontinuity observed in the
bounded rows; it is a recovery signal, not a synthesized event or an alternate pagination cursor.

The three REST routes that append to the event log — `POST /events`,
`POST /events/:eventId/reverse`, and `POST /events/:eventId/assist` — additionally broadcast
`game.event.committed` to the `game:<gameId>` room on the `/game-operations` namespace after the
write commits, with the same event name and payload shape the socket lane emits. Delivery is
best-effort and never fails the HTTP write: the durable `sequence` in the database stays
authoritative, and a dropped broadcast is recovered through HTTP backfill
(`GET /api/v1/games/:gameId/events?afterSequence=N`) or a fresh subscribe snapshot, exactly as the
frozen realtime contract specifies. A result whose idempotent replay carries no persisted `event`
record is deliberately not broadcast, because a payload without the server-assigned
`id`/`reversesEventId` corrupts a receiver's reversal bookkeeping. Receivers de-duplicate by
durable `sequence`, so a client that observes both the socket-lane and REST-lane delivery of the
same event is unaffected. `RealtimeGateway.afterInit()` registers the room delegate into
`GameBroadcastRegistry`; a process that never starts the gateway (the standalone
v1-game-operations-worker) leaves it unregistered and the broadcast is a no-op.

Game events and result revisions are append-only. A reversal is a compensating event; it never
rewrites the original event. Result participant/scorer records are validated against the
persisted Game sides/participants and the pinned active competition configuration. Tournament
scorer policy is required; the ordinary team-match policy permits a missing scorer only with its
explicit warning marker. No fixture or game source may be created without an active immutable
competition-config pin: `409 COMPETITION_CONFIG_REQUIRED` leaves no partial source/Game rows.

**Task 17 현재 계약:** `TEAM_MATCH` 자체는 이벤트 금지 조건이 아니다. 공동 기록이 없는 친선은
호스트 팀 owner·manager와 활성 `platform_ops`가 기존 명단·권한 검증 아래 이벤트를 기록·취소할 수
있으며, 상대 팀 매니저는 기록 주체가 아니다. 공동 기록이 시작되면 기존 결과·이벤트·진행 명령은
`SHARED_RECORD_REQUIRED`로 차단된다. 대회·리그의 canonical competition `TEAM_MATCH`는
쓰기 권한이 있는 배정 스태프와 `platform_ops`가 기존 운영 권한으로 기록한다.
결과 검증은 `TEAM_MATCH`이며 이벤트가 0건일 때 이벤트 기반 대조(점수·선수 통계·`missingScorer`)만
생략한다. 이벤트가 있으면 이 대조와 `422 SCORE_EVENT_MISMATCH`가 적용되며,
다른 명단·참가자·값 검증은 계속 적용된다. 근거:
[GamesService.resolveActor·withCommand·appendEvent](../../../apps/v1_api/src/games/games.service.ts),
[validateGameResultInvariants](../../../apps/v1_api/src/games/core/game-invariants.ts).

This is a real v1 persistence contract, not a mock-success flow. Fixture data is deterministic
test data only and must not be rendered as verified player, score, or standings evidence.

<!-- API_CONTRACT_SECTION_BEGIN:Frozen operational decision table -->
### Frozen operational decision table
| Decision | Literal behavior | Edge/failure contract |
|---|---|---|
| D-01 | SLA starts at `submittedAt` of each host result revision; at +24h UTC enqueue one `RESULT_REVIEW_REMINDER`; at +48h enqueue one `RESULT_REVIEW_ESCALATION` to the durable platform-operations queue. | A superseding host revision cancels prior pending jobs and starts a new SLA; approve/change-request/cancel closes both jobs. Idempotency key is `resultRevisionId:eventType`; no automatic approval. |
| D-02 | `publicLineupAt = scheduledKickoffAt - 60m`; public payload omits participant identity before that instant. | Reschedule before publication recomputes the instant; once published it is never re-hidden solely because kickoff moved later; cancellation hides the lineup; server UTC is authoritative. |
| D-03 | Linked user + valid consent contributes to team and personal projections; unlinked guest contributes only team aggregates plus immutable display snapshot. | Later linking never retroactively creates personal history before the link effective time; unlinking stops future personal projection and follows the consent table below. |
| D-04 | Canonical actor enum is `public`, `authenticated_user`, `member`, `team_manager`, `team_owner`, `opponent_manager`, `platform_ops` (existing Admin OWNER/OPS mapped at the boundary), `tournament_director`, `field_operator`, `support_readonly`; tournament staff are scoped assignments, never global Admin. | `authenticated_user` is a signed-in non-member and may submit one guest application as self, but gains no team/staff authority. Missing, expired, revoked, cross-tournament, cross-field, or cross-fixture assignment returns `403 STAFF_SCOPE_DENIED`; revoke evicts realtime subscription immediately. |
| D-05 | Starting a correction creates a new content-immutable superseding `DRAFT` with reason, actor, and before/after reference; later correction officialization atomically moves that revision to `OFFICIAL`, swaps the current pointer, and writes outbox in one transaction. | The prior official remains authoritative until successful officialization. Update/delete of an official or other terminal revision returns `409 OFFICIAL_REVISION_IMMUTABLE`; correction conflict returns `409 REVISION_VERSION_CONFLICT`. |
| D-06 | Visibility is one enum, not composable flags: `hidden`, `status_only`, `live`, `official_only`. Default tournament value is `live`; the public-live rollout flag can only demote `live` to `official_only` -- it stops in-progress exposure and never retracts a confirmed official result. | Precedence is `hidden` absolute deny; `official_only` exposes only official results; `status_only` exposes lifecycle/score status without lineup/events; `live` exposes policy-eligible lineup/score/events. |
| D-07 | Tournament config sets `scorerPolicy=required|optional`; ordinary team matches default `optional_with_warning`. | `required` blocks event append, result submit, and officialize with `422 SCORER_REQUIRED`; `optional_with_warning` permits submit/officialize and persists `missingScorer=true`. |
| D-08 | MVP cardinality is 0 or 1 per official revision and the participant must belong to that game. | More than one or foreign participant returns `422 MVP_INVALID`; correction supersedes the prior MVP without mutating history. |
| D-09 | Football/futsal preset v1 order is points → goal difference → goals for → head-to-head points → head-to-head goal difference → fair-play points → deterministic seeded draw. Tournament stores `competitionConfigVersionId`. | Used versions are immutable; a requested change creates a new version, previews affected standings/fixtures, and takes effect only after explicit `platform_ops` confirmation; otherwise `409 CONFIG_VERSION_IN_USE`. |
| D-10 | Only `append_event` commands may enter the offline queue; start/pause/resume/end/officialize require online server acknowledgement. | Queued event keeps `clientEventId`, expected sequence/version, captured server-offset estimate, and payload hash; unsupported offline action returns `409 ONLINE_ACK_REQUIRED`. |
| D-11 | Public identity is consent-eligible `displayName` snapshot only; roster `realName`, birth data, gender, and phone remain operations-only. | Public DTO/HTML/metadata/log containing restricted fields fails privacy validation; support sees display snapshot, not roster PII. |
| D-12 | This plan ships new writes plus measured local comparator and retains compatibility readers. A separate authorized rollout deploys the exact pre-cleanup SHA, collects 7 R1 + 7 R2 full-population zero-mismatch receipts, then removes readers in a new no-schema/no-data-contraction R3 cleanup commit. | This plan never claims deployed evidence or deletes compatibility readers. Any deployed mismatch blocks cleanup; post-alpha cleanup is reverified from scratch and may be reverted as a code-only commit. |
<!-- API_CONTRACT_SECTION_END:Frozen operational decision table -->

<!-- API_CONTRACT_SECTION_BEGIN:Frozen additive schema ledger -->
### Frozen additive schema ledger
Every new table uses UUID `id`, `createdAt`, `updatedAt` unless declared append-only; timestamps are UTC `DateTime(3)`. Foreign keys use `Restrict` for immutable history and `Cascade` only for non-official drafts/jobs.

| Model | Required fields, relations, constraints/indexes |
|---|---|
| `V1Game` | `sourceType TEAM_MATCH|TOURNAMENT_FIXTURE`, nullable unique `teamMatchId`/`tournamentFixtureId`, `state SCHEDULED|LIVE|PAUSED|ENDED|CANCELLED`, `version Int @default(0)`, `lastSequence Int @default(0)`, `currentOfficialRevisionId?`, required `competitionConfigVersionId`; `V1GameVisibilityPolicy.gameId` is the sole one-to-one FK. Raw migration adds `CHECK ((source_type='TEAM_MATCH' AND team_match_id IS NOT NULL AND tournament_fixture_id IS NULL) OR (source_type='TOURNAMENT_FIXTURE' AND tournament_fixture_id IS NOT NULL AND team_match_id IS NULL))`, unique `(id,currentOfficialRevisionId)` support, and a composite/deferred FK from `(id,currentOfficialRevisionId)` to revision `(gameId,id)`, so a cross-game current pointer cannot commit; indexes `(state,updatedAt)` and `(sourceType,createdAt)`. Todo 11 adds/backfills required immutable `competitionConfigVersionId` pins on both existing/new `V1Tournament` and `V1TeamMatch`; Game copies its source pin at creation. TeamMatch preset selection is persisted from its sportCode (`FOOTBALL→football-v1`, `FUTSAL→futsal-v1`) and unsupported/missing sport returns `409 COMPETITION_CONFIG_REQUIRED`. |
| `V1GameSide` | `gameId`, `sideKey HOME|AWAY`, `teamId?`, immutable `displayNameSnapshot`; unique `(gameId,sideKey)`. |
| `V1GamePeriod` | `gameId`, `number`, `state`, `startedAt?`, `endedAt?`, `pausedTotalMs Int @default(0)`, `pausedAt?`; unique `(gameId,number)`. `pausedTotalMs` is the sum of every COMPLETED pause segment for this period; `pausedAt` is the start of the currently open segment or null when not paused right now. `pause` sets `pausedAt`; `resume` (and `end` while paused) folds `now - pausedAt` into `pausedTotalMs` as an increment (never an overwrite — repeated pause/resume cycles accumulate) and clears `pausedAt`. Elapsed-time reads (both the operate console's live display and `freezeCapture()`'s `clockMs`) exclude paused time by construction — added for the pause-aware clock fix (2026-08), see `apps/v1_web/src/lib/game-operations-clock.ts`'s `elapsedMatchMs()`. |
| `V1GameLineup` | `gameId`, `sideId`, `revision Int`, `state`, `version`, `submittedAt?`, `supersedesId?`; unique `(gameId,sideId,revision)`. Public time is derived only from `V1GameVisibilityPolicy.lineupAt`. |
| `V1GameParticipant` | `gameId`, `sideId`, `lineupId`, `displayNameSnapshot`, `jerseyNumber?`, `position?`; immutable after first official revision; index `(gameId,sideId)`. It never changes identity linkage in place. |
| `V1ParticipantIdentityLinkEvent` | append-only `participantId`, `linkId`, `eventVersion`, `requestId`, `action REQUESTED|ATTESTED|REJECTED|EXPIRED|REVOKED`, `userId`, database-derived `effectiveAt`, `actorType USER|SYSTEM`, `actorUserId?`, `systemActor?`, `reason?`; exact actor correlation check; allowed system actor is `IDENTITY_LINK_EXPIRY`; unique `(participantId,eventVersion)`, `(requestId,action,COALESCE(actorUserId,systemActor))`, one terminal `REJECTED|EXPIRED` per request, and one `REVOKED` per linkId. A serializable trigger/state function permits ATTESTED only after a different user's pending, unexpired request, permits one active link per participant, and permits a new request after reject/expire/revoke. REQUESTED/REVOKED use transaction `database_now()`; a due job appends EXPIRED at the stored request time +24h; attestation/expiry lock the request and exactly one wins. No row is updated to close an interval and caller time is never trusted. |
| `V1ParticipantIdentityLinkCurrent` | derived mutable authority `participantId @unique`, `linkId @unique`, `userId`, `version`, `effectiveFrom`; updated in the same transaction as ATTESTED/REVOKED events and deleted on revoke. Public projection derives intervals from event order; it never mutates history. |
| `V1ParticipantConsentSnapshot` | append-only `participantId`, `linkId`, `consentVersion`, `state GRANTED|REVOKED`, database-derived `effectiveAt`, `policyHash`, `actorUserId`; unique `(participantId,consentVersion)`, index `(participantId,effectiveAt)`; DB trigger requires `linkId` to be active for the same user at grant time and assigns transaction `database_now()`, rejecting any caller-supplied timestamp. |
| `V1GameEvent` | append-only `gameId`, `sequence`, `clientEventId`, `payloadHash`, `type`, `sideId?`, `participantId?`, `period`, `clockMs`, `occurredAt`, `receivedAt`, `actorUserId`, `reversesEventId? @unique`, JSON `payload`; unique `(gameId,sequence)` and `(gameId,clientEventId)`; check prevents self-reversal and trigger requires same game. |
| `V1GameResultRevision` | content-append-only `gameId`, `revision`, `state DRAFT|SUBMITTED|CHANGE_REQUESTED|OFFICIAL|VOID`, JSON `score`, `eventsHash`, `missingScorer Boolean`, sole MVP authority `mvpParticipantId?`, `reason?`, `createdByActorType USER|SYSTEM`, `createdByUserId?`, `createdBySystemActor?`, `supersedesId?`, `submittedAt?`, `officialAt?`; unique `(gameId,revision)` and `(gameId,id)`; composite/deferred FK `(gameId,supersedesId)→(gameId,id)` forbids cross-game supersession; exact actor correlation check mirrors `V1OperationAudit`; allowed system actors are `GAME_END_DERIVER`, `GAME_BACKFILL`, and `PROJECTION_REPAIR`; FK/trigger requires MVP participant to belong to the same game and revision participant set. Only `state/submittedAt/officialAt` may update, `DRAFT→SUBMITTED` freezes all content, and terminal `CHANGE_REQUESTED|OFFICIAL|VOID` rows reject every UPDATE/DELETE. |
| `V1GameOfficialResultCache` | one immutable canonical JSON projection per official revision with `gameId`, `revisionId @unique`, `revision`, `tournamentId?`, `visibility HIDDEN|STATUS_ONLY|LIVE|OFFICIAL_ONLY`, `isCurrent`, `sourceHash`, `payloadHash`, `cachedAt`; unique `(gameId,revision)` and a partial unique index permits only one current row per game. The insert guard requires an exact `OFFICIAL` revision and, for `isCurrent=true`, the matching Game current pointer. Duplicate or reordered official deliveries preserve payload/hash/timestamps; reconciliation may repair a mismatched row in the same projection transaction. No draft, submitted, or personal-identity row is cached. |
| `V1GameResultParticipant` | `resultRevisionId`, `participantId`, `sideId`, `started`, `minutesPlayed?`, `goals`, `cards`, `goalkeeper`; unique `(resultRevisionId,participantId)`; INSERT/UPDATE/DELETE is allowed only while the locked parent is `DRAFT`, and every row becomes immutable when the parent first enters `SUBMITTED` or any terminal state; no duplicate MVP field. |
| `V1GameResultDecision` | append-only `revisionId`, `decision`, `reason?`, `actorType`, `actorUserId`, `createdAt`; unique `(revisionId,actorUserId,decision)`. |
| `V1GameVisibilityPolicy` | `gameId @unique`, `mode`, `lineupAt?`, `version`; no per-game public-live boolean. `PUBLIC_LIVE` is the sole rollout authority and may only demote policy `live` output to `official_only`. |
| `V1OutboxEvent` | `businessKey` non-null, `aggregateType`, `aggregateId`, `revisionId?`, `type`, JSON `payload`, `availableAt`, `leaseOwner?`, `leaseUntil?`, `attempts`, `retryGeneration @default(0)`, `version @default(0)`, `status`, `lastError?`; unique `(businessKey)`, indexes `(status,availableAt)` and `(leaseUntil)`; every claim/renew/complete/poison/requeue is an owner+expectedVersion CAS that increments version. |
| `V1IdempotencyRecord` | `actorUserId`, `action`, `resourceType`, `resourceId`, `idempotencyKey`, `payloadHash`, `responseStatus`, JSON `responseBody`, `expiresAt`; unique `(actorUserId,action,resourceType,resourceId,idempotencyKey)`, index `(expiresAt)`; immutable until expiry cleanup. |
| `V1ProjectionWatermark` | `projection`, `entityType`, `entityId`, `revisionId`, `sourceHash`, `projectedAt`, `status`; unique `(projection,entityType,entityId)`. |
| `V1TeamSchedule` | `teamId`, `teamMatchId?`, `title`, `type`, `startAt`, `endAt`, `timezone`, `capacity?`, `rsvpDeadlineAt?`, `visibility`, `state`, `version`, `cancelReason?`; indexes `(teamId,startAt)` and `(teamMatchId)`. |
| `V1ScheduleAttendance` | `scheduleId`, `userId`, `status`, `waitlistPosition?`, `version`; unique `(scheduleId,userId)`. |
| `V1ScheduleGuestRecruitment` | `scheduleId @unique`, `slots`, `closesAt`, `note?`, `visibility`, `state`, `version`; applications are authenticated-only `V1ScheduleGuestApplication(recruitmentId,userId NOT NULL,displayNameSnapshot,note?,state)` with unique `(recruitmentId,userId)`. Anonymous/unlinked submission paths do not exist; “unlinked guest” elsewhere means a game participant not linked to a Teameet identity, not a recruitment applicant. |
| `V1TournamentField` | `tournamentId`, immutable `scopeKey`, `name`, `sortOrder`, `active`, `version @default(0)`; unique `(tournamentId,scopeKey)` and `(tournamentId,id)`; PATCH CAS increments version. |
| `V1TournamentStaffAssignment` | `tournamentId`, `userId`, `role`, `fieldId?`, `version`, `expiresAt?`, `revokedAt?`, `grantedByUserId`; composite FK `(tournamentId,fieldId)→V1TournamentField(tournamentId,id)` forbids cross-tournament fields; DB check requires director/support scope to have null `fieldId`; indexes `(userId,revokedAt,expiresAt)` and `(tournamentId,role)`. Fixture scope is normalized, never mutable JSON. |
| `V1TournamentStaffFixtureScope` | `assignmentId`, `fixtureId`; unique `(assignmentId,fixtureId)` with deferred FKs. Paired `DEFERRABLE INITIALLY DEFERRED` constraint triggers fire on assignment INSERT/UPDATE/DELETE and scope INSERT/UPDATE/DELETE: they lock the affected assignment plus scope rows, require fixture tournament = assignment tournament, and require every live field_operator to have either same-tournament `fieldId` or at least one scope row at commit. Thus parent-first creation is allowed inside one transaction, while deleting/moving the last child or changing role/field/tournament cannot commit incomplete. |
| `V1CompetitionConfigVersion` | `sportCode`, `name`, `version`, JSON `periods/events/lineup/result/tieBreak/visibility`, `contentHash`, `createdByUserId`; unique `(sportCode,name,version)` and `contentHash`; immutable after reference. |
| `V1ResultEscalation` | `resultRevisionId`, `kind`, `dueAt`, `status`, `ackByUserId?`, `resolvedByUserId?`, `reason?`; unique `(resultRevisionId,kind)`, index `(status,dueAt)`. |
| `V1GameOperationFlag` | `key`, string `value`, `version`, `ownerActor`, `updatedByUserId`, `rollbackValue`, `updatedAt`; unique `(key)`, audit every change. Exact values/defaults (app-level, `GameOperationFlagKey`): `PUBLIC_LIVE=off|on` default `off`; `DIRECTOR_OFFICIALIZE=off|on` default `off`. The `V1GameOperationFlagKey` Postgres enum still has unused `GAME_WRITE`/`GAME_READ` members (Task 10 cutover retired both from the app — see `docs/api/domains/game-migration.md` — but shrinking a live enum was judged not worth the migration risk for zero functional benefit; no code reads/writes those keys or their enum values). |
| `V1GameCutoverEpoch` | singleton `id="game-cutover"`, `version`, `writeMode`, `firstNewWriteAt?`, `firstNewWriteResourceId?`, `updatedAt`. **Retired (Task 10 cutover cleanup)**: this table backed the now-removed `GAME_WRITE` CAS latch and `GAME_READ`/`GAME_WRITE` tuple rollback. No application code reads or writes it anymore; the model/table were left in place rather than dropped (same reasoning as the enum above). |
| `V1OperationAudit` | append-only `actorType USER|SYSTEM`, nullable `actorUserId`, nullable `systemActor`, `action`, `resourceType`, `resourceId`, `requestId`, masked `sourceIp`, JSON `before/after`, `reason?`, `createdAt`; check is exact correlation: `(actorType='USER' AND actorUserId IS NOT NULL AND systemActor IS NULL) OR (actorType='SYSTEM' AND actorUserId IS NULL AND systemActor IS NOT NULL)`; indexes `(resourceType,resourceId,createdAt)` and `(actorUserId,createdAt)`. |

Raw migration triggers `v1_guard_result_revision_transition`, `v1_block_terminal_revision_mutation`, `v1_guard_result_participant_mutation`, and `v1_block_used_config_mutation` enforce the content-freeze/terminal rules above, reject UPDATE/DELETE of terminal revisions, reject participant INSERT/UPDATE/DELETE unless the locked parent is `DRAFT`, and reject referenced config changes. Composite/deferred constraints enforce same-game current/supersession pointers and same-tournament field/fixture scope. The deterministic final tie-break seed is `SHA-256(tournamentId || ":" || competitionConfigVersionId || ":" || sortedTeamIds)` ascending lexical bytes; no random runtime draw is allowed.

<!-- API_CONTRACT_SECTION_END:Frozen additive schema ledger -->

### Task 150 event/result correction addendum (2026-08-19)

- POST /games/:gameId/events accepts OWN_GOAL. sideId is the team credited
  with the goal, while participantId is required and must belong to the
  opposing side. It changes the credited score but not personal goal totals.
  Public event projections keep that credited side for score integrity but
  place the participant row under the participant's actual team.
- The live console uses POST .../events/:eventId/reverse for active goal,
  own-goal, card, foul, and substitution rows. It appends a CORRECTION audit
  event and never overwrites the original; the operator then re-enters the
  corrected event.
- GET .../result-revisions includes nullable goalEvents snapshots with id,
  sideId, participantId, minute, period, and ownGoal. Older null snapshots
  fall back to the append-only event stream.

### 경기 명단 GK 지정 (Task 20261082)

경기·팀 명단 조회의 모든 선수 행(기준/출전/빠짐/결장/출전정지)은 `goalkeeper: boolean`을 포함한다.
시작 전에는 참가 명단 `V1TournamentPlayer.goalkeeper`의 명시 true/false를 정본으로 사용한다. null인 기존 선수만 `V1GameRosterRole` 경기별 지정으로 호환 조회한다. 시작 후 출전자는 아래 공식 결과 조회 기준을 따르며, 그 밖에는 기록에 선택된 라인업 position 스냅샷을 사용한다.
`POST /api/v1/teams/:teamId/game-rosters/batch`는 `{gameId,userId,op:'SET_GOALKEEPER',goalkeeper:boolean}`을 추가로 받는다.
복수 GK에 인원 제한이 없으며 같은 선수의 EXCLUDE/REVOKE와 GK 변경을 같은 트랜잭션으로 저장할 수 있다.
출전 조정끼리 같은 경기·선수 중복, GK 변경끼리 같은 대회·선수 중복은 400이다. GK의 누락/비 boolean/사유 첨부 및 다른 op에 GK 첨부도 400이다.
기존 사이드 권한, 시작 마감, 명단 밖 선수, 팀 변경 검증을 동일하게 적용한다. 출전 제외·복귀는 GK 지정을 지우지 않는다.
GK 변경은 변경 전후 값과 처리 역할을 `GAME_ROSTER_GOALKEEPER_CHANGED` 운영 감사에 남긴다.
명단 동기화 시 게임 규칙의 GK 코드(풋살 GOLEIRO 등)를 실제 참가자 position에 저장한다.
이관 전 팀장 작성 리그 명단은 `409 ROSTER_GOALKEEPER_MIGRATION_REQUIRED`로 거절해 기록에 반영되지 않은 저장을 성공 처리하지 않는다.

관련 근거: `games/roster/dto/team-game-roster.dto.ts`, `game-roster-loader.ts`, `game-roster.service.ts`,
`game-roster-sync.ts`, `test/games/team-game-rosters.integration-spec.ts`, Web `hooks/use-v1-game-roster.ts`.

### 종료 경기의 공식 출전자 조회 (MD-QA #155)

`GET /api/v1/games/:gameId/sides/:sideId/roster`와 `GET /api/v1/teams/:teamId/games/:gameId/roster`는 `gameState=ENDED`이고 `currentOfficialRevision`의 상태가 `OFFICIAL`이면 그 리비전의 해당 사이드 `resultParticipants`를 출전자 정본으로 사용한다. 공식 정정이 확정되면 정정된 출전자가 반영되며, 이후 `DRAFT`·`SUBMITTED` 정정은 현재 공식 출전을 덮지 않는다. 공식 출전자가 0명인 사이드도 빈 명단을 그대로 반환한다.

이름·등번호·계정 연결은 공식 행의 `participantId`와 같은 경기·사이드에 속한 보존 `V1GameParticipant` 스냅샷에서 읽고, `goalkeeper`는 공식 출전자 행의 값을 사용한다. 현재 참가 명단이나 라인업 position으로 공식 출전을 다시 계산하지 않는다. 인가와 운영진 전용 실명 노출 범위는 기존 명단 조회 계약을 따른다.

공식 리비전이 없거나 현재 포인터의 리비전이 `OFFICIAL`이 아니면 기존 명단 경로를 유지한다(`VOID`도 공식 출전으로 사용하지 않는다). `SCHEDULED`는 계산된 참가 명단을, `LIVE`·`PAUSED` 및 공식 결과 없는 종료 경기는 기존 제출본/최신 리비전 선택 기준의 경기 기록 명단을 사용한다. 조회는 라인업·결과·참가자 이력을 변경하지 않는다.

### 대회 공통 GK 및 어드민 관리 (Task 20261083)
GK 저장/해제는 해당 참가 등록(대회·팀)의 선수 값에 보관한다. 해당 대회의 시작 전 경기들을 첫 잠금 범위에 포함해 동일 트랜잭션에서 실제 lineup position을 동기화한다. 이후 대회/리그/플레이오프 경기 생성도 참가 명단 GK와 종목 GK 코드(예: GOLEIRO)를 상속한다. 시작·종료 경기의 저장된 참가자 position은 변경하지 않는다. 다른 대회·팀의 GK에는 영향이 없다.
일괄 응답은 `{teamId,results,affectedGames:[{gameId,sideId}]}`. 클라이언트는 전파 대상 경기의 명단·라인업·공개 기록 캐시를 모두 무효화한다. 어드민 출전 표의 선수 셀은 `goalkeeper:boolean`, 경기 열은 `goalkeeperEditable:boolean`을 포함한다. support/read-only 스태프는 조회만 한다. 어드민 GK 열은 EXCLUDE/REVOKE와 함께 동일 batch로 저장하고 일반 실패는 GK 초안을 보존한다.

한 경기만 담당하는 현장 스태프는 경기별 출전 조정만 가능하다. 대회 공통 GK는 대회 전체 lineup_mutate 권한이 필요하고, 경기 명단 응답의 `goalkeeperEditable:false`로 GK 편집을 노출하지 않는다.

## League start prerequisite (2026-10-18)

Game `start` in a regular league with `requiresExplicitStart=true` and stored as `draft`, `open`, or `closed` returns `409 LEAGUE_NOT_STARTED` before game state changes. An authorized admin starts the league through the existing league state endpoint first; friendly matches and regular tournaments retain their current rules. See [league lifecycle](./league-matches.md#new-league-lifecycle-2026-10-18).

## 운영콘솔 경기 출전 명단 (2026-10-20)

대회 운영콘솔은 팀이 설정한 경기별 출전 명단을 `GET /teams/:teamId/games/:gameId/roster`로 읽는다. 기본은 조회이며 수정하기 후 저장할 때 기존 `POST /games/:gameId/sides/:sideId/roster-adjustments`(선수 제외), `DELETE .../roster-adjustments/:userId`(복귀)를 사용한다. 기존 운영자 인가와 경기 시작 전 제한을 유지하며 대회 공통 참가 명단·다른 경기는 바꾸지 않는다. 저장은 단건 API를 직렬 호출하므로 부분 실패 시 저장된 수와 오류를 표시하고 실제 명단을 재조회한다. 도착 검인은 출전 여부가 아니며 대회 콘솔에서 전원 도착을 요구하지 않는다.

대회·리그 경기 이벤트 append/retry의 선수·도움·교체 대상과 기존 득점의 도움 추가는 현재 유효한 명단 리비전에 속해야 한다. 이전 리비전·제외 선수 ID는 `422 PARTICIPANT_NOT_IN_CURRENT_ROSTER`다. 기존 이벤트와 참가자 FK는 보존한다. 일반 친선 경기 계약은 유지한다.