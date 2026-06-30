# V1 Teams API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/teams` | optional user | `TeamsQueryDto` | cursor list |
| `GET` | `/api/v1/teams/:teamId` | optional user | path id | team detail and CTA state |
| `POST` | `/api/v1/teams` | user | `MutateTeamDto` | created team with owner membership |
| `PATCH` | `/api/v1/teams/:teamId` | owner/manager | `UpdateTeamDto` | updated team |
| `GET` | `/api/v1/teams/:teamId/join-eligibility` | user | path id | join eligibility |
| `GET` | `/api/v1/teams/:teamId/members` | member/manager/owner by service rule | `role?`, `status?`, `cursor?`, `limit?` | member list |
| `POST` | `/api/v1/teams/:teamId/join-applications` | user | `{ message?: string | null }` | requested join application |
| `GET` | `/api/v1/teams/:teamId/join-applications` | owner/manager | `status?`, `cursor?`, `limit?` | join applications |
| `GET` | `/api/v1/me/teams` | user | `permission?` | current user's teams |
| `PATCH` | `/api/v1/team-memberships/:membershipId/role` | owner | `{ role: "manager" | "member" }` | updated membership |
| `POST` | `/api/v1/team-memberships/:membershipId/remove` | owner/manager | `{ reason?: string | null }` | removed membership |
| `POST` | `/api/v1/team-join-applications/:applicationId/withdraw` | applicant | `{ reason?: string | null }` | withdrawn application |
| `POST` | `/api/v1/team-join-applications/:applicationId/approve` | owner/manager | `{ note?: string | null }` | approved application and membership |
| `POST` | `/api/v1/team-join-applications/:applicationId/reject` | owner/manager | `{ reason?: string | null }` | rejected application |

## Member Response Contract

`GET /api/v1/teams/:teamId/members` returns every visible team member for the caller's role, including members that cannot currently be used in tournament roster registration.

Each member item includes:

- `displayName`: UI display name, falling back to nickname/member label.
- `realName`: nullable profile real name snapshot source.
- `birthDate`: nullable profile birth date snapshot source.
- `phone`: nullable account phone source.

Tournament roster clients must keep members with missing `realName`, `birthDate`, or `phone` visible, but disable selection and explain the missing fields.

## DTO Highlights

`TeamsQueryDto` includes `cursor`, `limit`, `query`, `sportId`, `regionId`, `joinPolicy`, `sort`, and `view`.

`MutateTeamDto` requires:

- `sportId`
- `regionId`
- `name`, max 50
- `joinPolicy: "approval_required" | "closed"`

Optional fields include `logoUrl`, `coverImageUrl`, `introduction`, `activityAreaText`, `skillLevelText`, and `memberGoalCount`.

Structured activity profile fields:

- `activityDays: string[]` — `mon|tue|wed|thu|fri|sat|sun`
- `activityFrequency: string | null` — `weekly_1|weekly_2|weekly_3|weekly_4_plus|biweekly_1|irregular`
- `activityTimeSlots: string[]` — `morning|lunch|afternoon|evening|late_night`
- `activityTypes: string[]` — `regular_meetup|friendly_match|team_match|tournament_prep|training|free_participation|beginner_friendly|competitive`
- `activityMemo: string | null`

Team list, detail, and `/me/teams` responses include those fields plus `activitySummary` and `memberGoalCount`. `activityAreaText` remains as a compatibility/fallback field backed by the existing `activity_note` column.

Team list/detail and `/me/teams` `region` includes `{ regionId, name, parentName? }`; `regionName` is the display label (`parentName + name` for district regions).

`UpdateTeamDto` adds `version: string`.

## Route Fields

- `detailRoute` for create/my-team/team detail responses points to `/teams/:teamId`.
- `manageRoute` is only present for owner/manager viewers and points to `/teams/:teamId/members`; full team operations are exposed from the canonical `/teams/:teamId` detail UI.
- There is no v1 `/teams/:teamId/manage` route.

## State And Permissions

- V1 has no open instant join. Team join is `approval_required` or `closed`.
- Team creator becomes owner.
- `memberGoalCount` is the team capacity. When `memberCount >= memberGoalCount`, join applications, join approvals, team invitations, and invitation acceptance fail with `TEAM_FULL`.
- Team capacity cannot be updated below the current `memberCount`.
- Owner is not changed through the general role API.
- Manager limit is enforced by service logic.
- Approving a join application creates or restores an active member.

Primary tables:

- `v1_teams`
- `v1_team_profiles`
- `v1_team_memberships`
- `v1_team_join_applications`
- `v1_team_trust_scores`
- `v1_status_change_logs`
