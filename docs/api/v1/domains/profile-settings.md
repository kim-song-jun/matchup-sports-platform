# V1 Profile And Settings API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/me/profile` | user | headers only | current user's profile |
| `GET` | `/api/v1/me/activity-summary` | user | headers only | current user's activity/team/manner/monthly summary |
| `PATCH` | `/api/v1/me/profile` | user | `UpdateProfileDto` | updated profile |
| `GET` | `/api/v1/users/:userId/public-profile` | optional/user by visibility | path id | public profile |
| `GET` | `/api/v1/me/settings` | user | headers only | settings aggregate |
| `PATCH` | `/api/v1/me/settings` | user | `UpdateSettingsDto` | updated settings |
| `POST` | `/api/v1/auth/logout` | user | empty body | no-op logout result |
| `POST` | `/api/v1/me/withdrawal-request` | user | `{ reason?: string | null }` | withdrawal pending result |
| `POST` | `/api/v1/auth/register` | public | `RegisterDto` | email signup session |

## DTO Highlights

`RegisterDto`:

- Required: `nickname`, `email`, `password`, `gender`, `requiredTermsAccepted`
- Optional: `displayName?: string`, `phone?: string`, `birthDate?: string`, `profileImageUrl?: string`
- `phone` is stored as 11 digits only. Signup UI may display `010-0000-0000`, but API payload must be digits.
- `birthDate` is stored as 8 digits `YYYYMMDD`; API rejects invalid calendar dates.
- `displayName` is saved to `v1_user_profiles.display_name`; blank values fall back to nickname.
- `profileImageUrl` is saved to `v1_user_profiles.profile_image_url`. Current signup uses a single selected image preview value because authenticated upload is not available before account creation.

`SocialProfileDto`:

- Required: `nickname`, `gender`
- Optional fields match `RegisterDto`: `displayName`, `phone`, `birthDate`, `profileImageUrl`
- `phone` duplicate checks exclude the current pending social user and return `PHONE_CONFLICT` when another account already owns it.

`UpdateProfileDto`:

- `displayName: string`, max 40
- `nickname: string`, min 2, max 40
- `email: string`, max 320; duplicate email returns `EMAIL_CONFLICT`
- `profileImageUrl?: string | null`
- Authenticated profile edit uploads selected image files through `POST /api/v1/uploads` first and saves the returned root-relative URL. The edit screen must not persist a local `data:` preview as if it were an uploaded profile image.
- `phone?: string | null`; when present, 11 digits only; duplicate phone returns `PHONE_CONFLICT`
- `birthDate?: string | null`; when present, 8 digit `YYYYMMDD` and a valid calendar date
- `bio?: string | null`, max 500
- `visibilityStatus: "public" | "members_only" | "private"`

Profile edit UI must keep the same duplicate-check behavior as signup for changed `nickname` and `email`. Unchanged values do not require another duplicate check.

`UpdateSettingsDto`:

- `visibilityStatus?: "public" | "members_only" | "private"`
- `notifications?: { matchEnabled?, teamEnabled?, teamMatchEnabled?, chatEnabled?, noticeEnabled?, marketingEnabled? }`

`GET /me/activity-summary` response:

- `totals.activityCount`: count of user's personal match participation plus related team matches
- `totals.teamCount`: active teams the user belongs to
- `totals.mannerScore`: current user manner score, or `null`
- `monthly.matchCount`: current-month personal and team match count
- `monthly.mannerScore`: current manner score shown in the monthly card, or `null`
- `monthly.winRate`: `null` until a v1 match result/win-loss source exists

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
