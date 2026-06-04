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

- Team match create immediately publishes `recruiting`.
- Create UI must source host team choices from the current user's active owner/manager teams. Member-only teams are not valid host team options.
- Applicant is a team, not a user.
- Applicant team must be managed by the acting user.
- Host team cannot apply to itself.
- Approval moves the selected application to `approved` and the team match to `matched`; only one applicant team can be approved.
- Team match chat is available only after an applicant team has been approved/matched.
- `costNote` is text-only. No payment API is called.

Primary tables:

- `v1_team_matches`
- `v1_team_match_applications`
- `v1_teams`
- `v1_team_memberships`
- `v1_status_change_logs`
