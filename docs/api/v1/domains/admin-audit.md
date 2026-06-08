# V1 Admin And Audit API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/me` | active admin | headers only | current admin profile |
| `GET` | `/api/v1/admin/overview` | active admin | `from?`, `to?` | operational counts |
| `POST` | `/api/v1/admin/users/:userId/status` | active admin | `{ status, reason }` | updated user status |
| `POST` | `/api/v1/admin/matches/:matchId/status` | active admin | `{ status, reason }` | updated match status |
| `POST` | `/api/v1/admin/teams/:teamId/status` | active admin | `{ status, reason }` | updated team status |
| `POST` | `/api/v1/admin/team-matches/:teamMatchId/status` | active admin | `{ status, reason }` | updated team match status |
| `GET` | `/api/v1/admin/action-logs` | active admin | `AdminLogsQueryDto` | cursor list |
| `GET` | `/api/v1/admin/status-change-logs` | active admin | `AdminLogsQueryDto` | cursor list |
| `GET` | `/api/v1/admin/ops/audit` | active admin | `limit?`, `cursor?` | internal action logs + case events |

## Status DTOs

- User: `"active" | "suspended" | "blocked" | "deleted"`
- Match: `"recruiting" | "closed" | "cancelled" | "completed" | "archived"`
- Team: `"active" | "suspended" | "archived"`
- Team match: `"recruiting" | "matched" | "cancelled" | "completed" | "archived"`
- Every status mutation requires `reason: string`, max 500.

## Audit Contract

Admin mutations must record:

- acting admin;
- target type and id;
- action type;
- reason;
- before/after status where applicable;
- `v1_admin_action_logs`;
- `v1_status_change_logs` for lifecycle state changes.

`/admin` frontend is customer ERP and must not call these internal APIs. Task 104 introduces `/ops` as the internal console that consumes this namespace.

Task queue, settlement operations, dispute success flows, and payment ledgers now live in the Task 104 `/ops` contract; see `docs/api/v1/domains/admin-ops.md`.

Primary tables:

- `v1_admin_users`
- `v1_admin_action_logs`
- `v1_status_change_logs`
- target domain tables
- `v1_ops_case_events` for `/ops` case/refund/settlement/payout event history
