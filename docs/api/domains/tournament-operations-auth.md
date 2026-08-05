# Tournament operations authorization contract

<!-- API_CONTRACT_SECTION_BEGIN:Canonical actor-action matrix -->
### Canonical actor-action matrix
| Actor | Team schedule/lineup/result | Tournament operate | Officialize/correct | Staff/escalation | Public |
|---|---|---|---|---|---|
| `public` | permitted public reads only | none | none | none | visibility-filtered read |
| `authenticated_user` | self guest application only; no member read | none | none | none | read |
| `member` | own RSVP and permitted reads | none | none | none | read |
| `team_manager`/`team_owner` | manage own schedule/lineup/result submission | none unless separate staff assignment | none | none | read |
| `opponent_manager` | request opponent lineup change before lock; approve/change-request opponent result | none | approve/change-request team result only | none | read |
| `field_operator` | none | assigned fixture/field commands and event input | none | own warnings read | read |
| `support_readonly` | none | assigned board read | none | list/detail/ack due `REMINDER`, never resolve | read |
| `tournament_director` | none | assigned tournament/field operations | correction plus flag-gated officialize/void | manage subordinate staff; list/detail/ack due `REMINDER`, never resolve | read |
| `platform_ops` | audit/read | all tournaments | officialize/correct/void | bootstrap director and revoke; list/detail/ack/resolve due `ESCALATION` | read |

<!-- API_CONTRACT_SECTION_END:Canonical actor-action matrix -->

## Task 7 internal authorization runtime

`TournamentsModule` provides `TournamentStaffAccessService`, `TournamentStaffGuard`, and
`TournamentStaffService`, and imports the shared operation-audit and realtime modules. This makes
the scoped actor matrix enforceable by tournament controllers without registering a second copy
of any provider or introducing a module cycle. Staff grant, bootstrap, and revoke write through
the shared append-only operation audit boundary; a successful revoke commits first and then
disconnects every current socket for the revoked user so a stale realtime session cannot retain
access.

This is an internal service/guard contract only. Task 7 adds no staff-management HTTP route,
controller, or DTO. Public list/grant/revoke endpoints remain deferred to Task 18. Existing
`/api/v1/admin/**` controllers continue to use the v1 session guard plus the established
active-admin/owner-or-ops checks; tournament staff assignments do not grant global Admin access.

## Migrated general admin and audit surface

The following pre-normalization v1 admin/audit contract is retained here so superseding the duplicate tree loses no contract content.

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

`GET /admin/users` rows keep the compatibility `displayName` response field, but resolve it from private `profile.realName` first and legacy `profile.displayName` only as a fallback. `q` searches nickname, real name, legacy display name, and email. Real name is not added to public profile/chat responses.

`GET /admin/users` and `GET /admin/users/:userId` include `authProviders` from active auth identities. Admin UI renders these as `카카오`, `네이버`, or `이메일`; multiple linked providers are shown together.

`GET /admin/users` rows include `ownedTeamCount`, `membershipCount`, and
`teamRoleCounts: { owner, manager, member }` so the admin list can show team
leader/member role distribution without opening detail.

`GET /admin/users/:userId` returns the list row fields plus:

- admin-only contact and profile fields: `phone`, email/phone verification timestamps, `birthDate`, `displayRegion`, and `bio`
- `deletedAt`
- `withdrawalRequest: { reason, requestedAt } | null`
- `teamRoleCounts: { owner, manager, member }`
- `teamMemberships[]` with active team membership role/status/join date
- recent `hostedMatches[]`
- owned `ownedTeams[]`
- optional `reputationSummary`

`GET /admin/teams/:teamId` additionally returns active `members[]` with membership/user IDs, role, join date, private name/nickname, email, and phone. These fields remain confined to the admin-guarded detail route and are not added to public team responses.

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
