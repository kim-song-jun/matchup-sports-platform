# V1 Profile And Settings API

## Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/me/profile` | user | headers only | current user's profile |
| `GET` | `/api/v1/me/activity-summary` | user | headers only | current user's activity/team/manner/monthly summary |
| `PATCH` | `/api/v1/me/profile` | user | `UpdateProfileDto` | updated profile |
| `GET` | `/api/v1/users/:userId/public-profile` | optional | path id | public-safe profile |
| `GET` | `/api/v1/me/settings` | user | headers only | settings aggregate |
| `PATCH` | `/api/v1/me/settings` | user | `UpdateSettingsDto` | updated settings |
| `POST` | `/api/v1/auth/logout` | public/idempotent | empty body | signed session cookie removal + `{ ok: true }`; expired or invalid cookies can also be cleared |
| `POST` | `/api/v1/me/withdrawal-request` | user | `{ reason?: string | null }` | withdrawal pending result |
| `POST` | `/api/v1/auth/register` | public | `RegisterDto` | email signup session |

## DTO Highlights

`RegisterDto`:

- Required: `nickname`, `email`, `password`, one of `realName` or deprecated `displayName`, `phone`, `birthDate`, `gender`, `requiredTermsAccepted`
- Optional: `profileImageUrl?: string`
- `phone` is stored as 11 digits only. Signup UI may display `010-0000-0000`, but API payload must be digits.
- `birthDate` is stored as 8 digits `YYYYMMDD`; API rejects invalid calendar dates.
- The accepted name is trimmed, must contain a non-whitespace character, and is saved to private `real_name` and legacy `display_name` without a nickname fallback. New clients send `realName`.
- `profileImageUrl` is saved to `v1_user_profiles.profile_image_url`. Email signup keeps the selected file only as a local preview until the account/session exists, then uploads it through `POST /api/v1/uploads` and persists the returned URL with `PATCH /api/v1/me/profile`. The local `data:` preview is never persisted. Social signup currently omits the optional image field from its UI and therefore stores `null` unless a compatible API client supplies a URL.

`SocialProfileDto`:

- Required: `nickname`, one of `realName` or deprecated `displayName`, `phone`, `birthDate`, `gender` (`male` or `female`)
- Optional: `profileImageUrl`
- `phone` duplicate checks exclude the current pending social user and return `PHONE_CONFLICT` when another account already owns it.
- `POST /api/v1/auth/social-terms` returns `next.route = /signup/social` and moves the user there without creating a profile. The client follows that returned route rather than hard-coding a completion page.
- `POST /api/v1/auth/social-profile` saves the nickname and all four required profile fields before sport onboarding.
- Until social profile completion changes the user to `signup_done`, the session remains authenticated but receives `403 SIGNUP_INCOMPLETE` for unrelated site APIs.

`UpdateProfileDto`:

- `realName?: string | null`, max 40; optional when saving the profile
- Deprecated `displayName?: string | null` remains temporarily accepted for rolling-deploy compatibility and is used only when `realName` is absent.
- `gender: male | female`, required for every profile save
- `nickname: string`, min 2, max 40
- `email?: string | null`, max 320. Email/password accounts still require an email. Social-only accounts may omit email, and clients must not force email/password controls when `hasPassword=false`.
- Social-only accounts may edit or clear contact email without changing the Kakao provider key. Any changed email clears `emailVerifiedAt`; password identities track the saved email.
- `profileImageUrl?: string | null`
- Authenticated profile edit uploads selected image files through `POST /api/v1/uploads` first and saves the returned root-relative URL. The edit screen must not persist a local `data:` preview as if it were an uploaded profile image.
- `phone?: string | null`; when present, 11 digits only; duplicate phone returns `PHONE_CONFLICT`
- Changing the phone clears `phoneVerifiedAt`. Phone confirmation binds the verified token target and timestamp together in one transaction.
- Verification confirmation consumes a still-unused token conditionally in the same transaction as the identity binding. Concurrent reuse returns `ALREADY_PROCESSED` and cannot commit a second binding.
- `birthDate?: string | null`; when present, 8 digit `YYYYMMDD` and a valid calendar date

Profile edit UI keeps duplicate checks for changed `nickname` and non-empty changed `email`. Kakao-only users may edit or clear email; this does not change the Kakao login identity.

The profile edit route renders a loading skeleton while `GET /me/profile` is pending and a retryable error state when it fails. It must never expose a blank editable-looking form backed by missing profile data.

## Creator Profile Gate

`POST /api/v1/matches`, `POST /api/v1/teams`, and `POST /api/v1/team-matches` require a non-blank `realName`, a saved phone number, and `male` or `female` gender. Missing data returns `422 PROFILE_COMPLETION_REQUIRED` with `details.missingFields` and `details.next.route = "/my/profile/edit"`.

Application, invitation, chat, review, inquiry, profile update, and existing-entity management endpoints do not use this gate.
`UpdateSettingsDto`:

- `notifications?: { matchEnabled?, teamEnabled?, teamMatchEnabled?, chatEnabled?, noticeEnabled?, marketingEnabled? }`

`GET /me/activity-summary` response:

- `totals.activityCount`: count of user's personal match participation plus related team matches
- `totals.teamCount`: active teams the user belongs to
- `totals.mannerScore`: current user manner score, or `null`
- `monthly.matchCount`: current-month personal and team match count
- `monthly.mannerScore`: current manner score shown in the monthly card, or `null`
- `monthly.winRate`: `null` until a v1 match result/win-loss source exists

`GET /users/:userId/public-profile` response:

- Optional auth. Public-safe profiles are readable from user-facing surfaces such as team member lists and join request lists.
- Only `active` accounts are readable. Withdrawal-pending, suspended, blocked, deleted, or soft-deleted users return the same `404 NOT_FOUND` response so account state and profile data are not exposed.
- Private fields such as real name, email, phone, birth date, gender, and profile bio are never returned.
- Returned identity fields: `userId`, `displayName`, `nickname`, `profileImageUrl`; `displayName` is derived from public nickname and never from `realName`.
- Returned trust field: `reputation.mannerScore`, `reputation.reviewCount`, `reputation.trustState`.
- Returned public activity summary:
  - `totals.matchCount`: completed match participation count
  - `totals.teamCount`: active team membership count
  - `totals.reviewCount`: submitted user review count
  - `monthly.matchCount`: current-month completed match participation count
  - `monthly.teamJoinCount`: current-month active team join count
  - `monthly.reviewCount`: current-month submitted user review count
- User profile visibility controls are not part of the v1 user-facing contract; clients must treat public profile data as public-safe by field, not by a user-selected visibility state.

## State And Copy

- Logout clears the signed `/api/v1` HttpOnly session cookie; frontend also clears local persona/display state. Account-status checks remain server-side on every authenticated request.
- Withdrawal request moves the account toward `withdrawal_pending` and writes status evidence. It is not immediate hard delete.
- `GET /me/profile` returns nullable `profile.gender` for legacy compatibility, plus `authProvider`, `authProviders`, and `hasPassword`. `GET /me/settings.account` returns `providers` and `hasPassword`. Clients use these fields to separate common profile editing from login-method-specific account controls.
- Notification preference switches configure the in-app Teameet notification inbox only. Browser/OS push permission and subscriptions are not part of the current v1 contract, so the UI must not present these switches as push-notification controls.
- Current-location actions disclose that exact coordinates are transmitted once for region/weather resolution and send `locationConsentAccepted: true`; coordinates are not persisted. Permission denied, unavailable position, and timeout states use distinct user-facing messages, and manual region selection remains available.
- Profile, notification setting, region, and sport/region preference updates write user-actor evidence to `v1_status_change_logs` with target types such as `user_profile`, `user_notification_settings`, `user_region`, and `user_preferences`. The log reason records changed field names, not raw private values.
- Unsupported email/password change controls must not be shown as active actions. Kakao-only users see provider account status instead of password change.

Primary tables:

- `v1_users`
- `v1_auth_identities`
- `v1_user_profiles`
- `v1_user_reputation_summaries`
- `v1_notification_preferences`
- `v1_status_change_logs`
