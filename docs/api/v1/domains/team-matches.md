# V1 Team Matches API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/team-matches` | optional user | `TeamMatchesQueryDto` | cursor list |
| `POST` | `/api/v1/team-matches` | owner/manager of host team | `MutateTeamMatchDto` | created team match |
| `GET` | `/api/v1/team-matches/:teamMatchId/edit` | owner/manager of host team | path id | editable payload |
| `GET` | `/api/v1/team-matches/:teamMatchId` | optional user | path id | detail and CTA state |
| `GET` | `/api/v1/team-matches/:teamMatchId/application-eligibility` | user | `teamId?` | eligibility by managed team |
| `PATCH` | `/api/v1/team-matches/:teamMatchId` | owner/manager of host team | `UpdateTeamMatchDto` | updated team match |
| `POST` | `/api/v1/team-matches/:teamMatchId/close` | owner/manager of host team | `{ reason?: string | null }` | closed team match and expired pending applications |
| `POST` | `/api/v1/team-matches/:teamMatchId/reopen` | owner/manager of host team | `{ reason?: string | null }` | reopened recruiting team match |
| `POST` | `/api/v1/team-matches/:teamMatchId/cancel` | owner/manager of host team | `{ reason?: string | null }` | cancelled team match |
| `POST` | `/api/v1/team-matches/:teamMatchId/applications` | owner/manager of applicant team | `{ applicantTeamId: uuid; message?: string | null }` | requested application |
| `GET` | `/api/v1/team-matches/:teamMatchId/applications` | host team owner/manager | `status?`, `cursor?`, `limit?` | applications |
| `POST` | `/api/v1/team-match-applications/:applicationId/withdraw` | applicant team owner/manager | `{ reason?: string | null }` | withdrawn application |
| `POST` | `/api/v1/team-match-applications/:applicationId/approve` | host team owner/manager | `{ note?: string | null }` | approved application and matched team match |
| `POST` | `/api/v1/team-match-applications/:applicationId/reject` | host team owner/manager | `{ reason?: string | null }` | rejected application |
| `GET` | `/api/v1/me/team-matches` | user | `scope?`, `teamId?`, `status?`, `cursor?`, `limit?` | current user's team match worklist |

## DTO Highlights

`TeamMatchesQueryDto` includes `cursor`, `limit`, `query`, `sportId`, `regionId`, `status`, `sort`, and `view`.

`MutateTeamMatchDto` requires:

- `hostTeamId`
- `sportId`
- `regionId`
- `title`
- `startsAt`
- `manualPlaceName`

Optional fields include `description`, `imageUrl`, `endsAt`, `deadlineAt`, `addressText`, `costNote`, and `rulesText`.

`UpdateTeamMatchDto` adds `version: string`.

## State And Permissions

- Creating a team match requires profile `realName`, phone, and gender; missing fields return `422 PROFILE_COMPLETION_REQUIRED`. Application and management endpoints are exempt.


- Team match create immediately publishes `recruiting`.
- Host owner/manager can close recruiting. Closing moves the team match to `closed`, rejects new applications, and marks pending applications `expired`.
- Host owner/manager can reopen `closed` team matches before `startAt`; expired applications are not auto-restored.
- Create UI must source host team choices from the current user's active owner/manager teams. Member-only teams are not valid host team options.
- Applicant is a team, not a user.
- Applicant team must be managed by the acting user.
- Host team cannot apply to itself.
- Approval locks and re-reads the team match before conditionally moving a still-`requested` application to `approved` and the team match to `matched`; concurrent approvals cannot approve more than one applicant team.
- Applicant team owner/manager can withdraw only `requested` applications.
- **There is no standalone "complete" mutation on this domain (Task 16 removed it).** A `matched` team match becomes `completed` only as an atomic side effect of the host team owner/manager submitting a validated result revision — see `docs/api/domains/games.md`'s `POST /api/v1/games/:gameId/result-revisions/:revisionId/submit`. That route sets `completedAt` and unlocks review surfaces in the same transaction that ends the Game; the opposing team then approves or requests changes to the submitted result via `.../decision`.
- **Task 17 (result entry/approval UI):** `GET /api/v1/team-matches/:teamMatchId` now includes `gameId` (the 1:1 `V1Game.id`, `null` only if a row somehow predates Game provisioning) — this is the only client-facing way to learn the Game id needed to call `/api/v1/games/:gameId/result-revisions*`. `GET /api/v1/team-matches/:teamMatchId/lineup` starters/bench entries now also include the real `V1GameParticipant.id` alongside `displayName`/`jerseyNumber`, so the host can attribute a goal/card to a specific own-side roster entry when drafting a result. Both additions are additive fields on existing responses; no path, DTO, or auth rule changed.
- **Known gap carried into Task 17, not fixed there:** `POST /api/v1/games/:gameId/result-revisions` cross-checks `score`/`actualParticipants[].goals|cards` against the game's `V1GameEvent` rows (see `docs/api/domains/games.md`), but `event_append`/`event_reverse` is unconditionally forbidden for `TEAM_MATCH` source games (only tournament staff may append events). No team match can ever have events, so the invariant check always requires `score = {home:0, away:0}` with zero goals/cards; any nonzero score submission returns `422 SCORE_EVENT_MISMATCH`. Task 16's own test suite only exercises `{home:0, away:0}`. Fixing this needs a scoped decision (either a team-match event-append allowance, or relaxing the invariant for `TEAM_MATCH` sources with no events) that is out of Task 17's frontend scope.
- Team match chat is available only after an applicant team has been approved/matched.
- `costNote` is text-only. No payment API is called.
- Notifications are emitted for application received, application withdrawn, approved, rejected, recruiting closed, and match cancelled events. (Match-completed review-nudge notifications are a known Task 16 gap — see the games contract doc note above; the completion write itself is unconditional and does not depend on any notification succeeding.)

Primary tables:

- `v1_team_matches`
- `v1_team_match_applications`
- `v1_teams`
- `v1_team_memberships`
- `v1_status_change_logs`
