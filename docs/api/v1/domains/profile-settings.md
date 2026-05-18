# V1 Profile And Settings API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/me/profile` | user | headers only | current user's profile |
| `PATCH` | `/api/v1/me/profile` | user | `UpdateProfileDto` | updated profile |
| `GET` | `/api/v1/users/:userId/public-profile` | optional/user by visibility | path id | public profile |
| `GET` | `/api/v1/me/settings` | user | headers only | settings aggregate |
| `PATCH` | `/api/v1/me/settings` | user | `UpdateSettingsDto` | updated settings |
| `POST` | `/api/v1/auth/logout` | user | empty body | no-op logout result |
| `POST` | `/api/v1/me/withdrawal-request` | user | `{ reason?: string | null }` | withdrawal pending result |

## DTO Highlights

`UpdateProfileDto`:

- `displayName: string`, max 40
- `profileImageUrl?: string | null`
- `bio?: string | null`, max 500
- `visibilityStatus: "public" | "members_only" | "private"`

`UpdateSettingsDto`:

- `visibilityStatus?: "public" | "members_only" | "private"`
- `notifications?: { matchEnabled?, teamEnabled?, teamMatchEnabled?, chatEnabled?, noticeEnabled?, marketingEnabled? }`

## State And Copy

- Logout is a server no-op in the current header-auth development model; frontend still clears local v1 session state.
- Withdrawal request moves the account toward `withdrawal_pending` and writes status evidence. It is not immediate hard delete.
- Unsupported email/password change controls, if visible, must be disabled or explicitly deferred.

Primary tables:

- `v1_users`
- `v1_auth_identities`
- `v1_user_profiles`
- `v1_user_reputation_summaries`
- `v1_notification_preferences`
- `v1_status_change_logs`
