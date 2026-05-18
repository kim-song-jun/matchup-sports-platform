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

## DTO Highlights

`TeamsQueryDto` includes `cursor`, `limit`, `query`, `sportId`, `regionId`, `joinPolicy`, `sort`, and `view`.

`MutateTeamDto` requires:

- `sportId`
- `regionId`
- `name`, max 50
- `joinPolicy: "approval_required" | "closed"`

Optional fields include `logoUrl`, `coverImageUrl`, `introduction`, `activityAreaText`, `skillLevelText`, and `memberGoalCount`.

`UpdateTeamDto` adds `version: string`.

## State And Permissions

- V1 has no open instant join. Team join is `approval_required` or `closed`.
- Team creator becomes owner.
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
