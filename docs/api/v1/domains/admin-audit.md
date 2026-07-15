# V1 Admin And Audit API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/me` | active admin | headers only | current admin profile |
| `GET` | `/api/v1/admin/overview` | active admin | `from?`, `to?` | operational counts |
| `GET` | `/api/v1/admin/users` | active admin | `status?`, `q?`, `cursor?`, `limit?` | cursor user list with team role counts |
| `GET` | `/api/v1/admin/users/:userId` | active admin | path only | user detail with team/reputation/withdrawal request summary |
| `POST` | `/api/v1/admin/users/:userId/status` | active admin | `{ status, reason }` | updated user status |
| `DELETE` | `/api/v1/admin/users/:userId` | mutation admin | `{ reason }` | deleted user status result |
| `POST` | `/api/v1/admin/matches/:matchId/status` | active admin | `{ status, reason }` | updated match status |
| `POST` | `/api/v1/admin/teams/:teamId/status` | active admin | `{ status, reason }` | updated team status |
| `POST` | `/api/v1/admin/team-matches/:teamMatchId/status` | active admin | `{ status, reason }` | updated team match status |
| `GET` | `/api/v1/admin/action-logs` | active admin | `AdminLogsQueryDto` | cursor list |
| `GET` | `/api/v1/admin/status-change-logs` | active admin | `AdminLogsQueryDto` | cursor list |

## Status DTOs

- User: `"active" | "suspended" | "blocked" | "deleted"`
- Match: `"recruiting" | "closed" | "cancelled" | "completed" | "archived"`
- Team: `"active" | "suspended" | "archived"`
- Team match: `"recruiting" | "matched" | "cancelled" | "completed" | "archived"`
- Every status mutation requires `reason: string`, max 500.
- User delete requires `reason: string`, max 500, sets `accountStatus=deleted`, stamps `deletedAt`, masks `email`/`phone`, unlinks auth identities, replaces each `providerUserKey` with a deletion-scoped key, clears identity email/password data, masks profile fields, and writes admin action/status logs. This keeps operational records but frees the original email/phone/Kakao provider key for re-signup.

## User Detail Contract

`GET /admin/users` rows include `ownedTeamCount`, `membershipCount`, and
`teamRoleCounts: { owner, manager, member }` so the admin list can show team
leader/member role distribution without opening detail.

`GET /admin/users/:userId` returns the list row fields plus:

- `deletedAt`
- `withdrawalRequest: { reason, requestedAt } | null`
- `teamRoleCounts: { owner, manager, member }`
- `teamMemberships[]` with active team membership role/status/join date
- recent `hostedMatches[]`
- owned `ownedTeams[]`
- optional `reputationSummary`

`withdrawalRequest.reason` is the message the user submitted when requesting account withdrawal.

## Audit Contract

Admin mutations must record:

- acting admin;
- target type and id;
- action type;
- reason;
- before/after status where applicable;
- `v1_admin_action_logs`;
- `v1_status_change_logs` for lifecycle state changes.

Admin v1 is intentionally minimum. Task queue, settlement operations, dispute success flows, and broad CRM functionality are deferred.

Primary tables:

- `v1_admin_users`
- `v1_admin_action_logs`
- `v1_status_change_logs`
- target domain tables
