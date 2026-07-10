# V1 Auth And Onboarding API

## Implemented Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/auth/me` | user | headers only | current user, profile, onboarding summary |
| `POST` | `/api/v1/auth/register` | none | `RegisterDto` | email session + onboarding route |
| `POST` | `/api/v1/auth/kakao` | none | `{ code, redirectUri? }` | social session + onboarding route |
| `POST` | `/api/v1/auth/social-terms` | user | `{ requiredTermsAccepted: true }` | social session + onboarding route |
| `POST` | `/api/v1/auth/social-profile` | user | `SocialProfileDto` | compatibility profile completion |
| `GET` | `/api/v1/onboarding` | user | headers only | onboarding resume summary |
| `PATCH` | `/api/v1/onboarding/preferences` | user | `UpdateOnboardingPreferencesDto` | updated onboarding summary |
| `POST` | `/api/v1/onboarding/complete` | user | empty body | completed onboarding summary |
| `POST` | `/api/v1/onboarding/defer` | user | `{ reason?: "skip_now" | "later" | "unknown" }` | deferred onboarding summary |

## Request DTOs

`UpdateOnboardingPreferencesDto`:

- `sports?: { sportId: uuid; levelId?: uuid | null }[]`, max 20
- `regions?: { regionId: uuid; primary: boolean }[]`, max 20
- `currentStep: "sport" | "level" | "region" | "confirm"`

## State And Tables

Primary tables:

- `v1_users`
- `v1_auth_identities`
- `v1_user_profiles`
- `v1_user_onboarding_progress`
- `v1_user_sport_preferences`
- `v1_user_regions`
- `v1_user_terms_consents`
- `v1_notification_preferences`
- `v1_status_change_logs`

Onboarding complete requires the user to have enough sport/level preference data. Defer moves the user to a limited app state and keeps v1 copy honest about incomplete preferences.

## Signup Flow

Email signup must accept required terms before `POST /api/v1/auth/register` creates the account. A successful email signup creates `v1_user_profiles`, sets `onboardingStatus = signup_done`, and sends the client through the signup complete screen before sport onboarding.

Kakao signup starts with `POST /api/v1/auth/kakao` because the provider user key is needed first. A new Kakao user is created as `onboardingStatus = social_terms_required` without a profile. If the user leaves here, admin surfaces should treat the row as `가입 진행 중 · 약관 미동의`.

When `POST /api/v1/auth/social-terms` succeeds, the API now creates a default profile immediately:

- Uses the Kakao nickname from onboarding draft when available.
- Falls back to a `k_...` ID-derived nickname when Kakao does not provide a nickname.
- Keeps the automatically created social nickname within 14 characters, including duplicate suffixes such as `_1`.
- Resolves nickname conflicts server-side.
- Stores the Kakao profile image when available.
- Sets `onboardingStatus = signup_done` and `currentStep = sport`.

`POST /api/v1/auth/social-profile` remains available for compatibility with older incomplete social signup states, but the current Kakao happy path no longer requires a separate profile form.

`GET /api/v1/auth/me` includes account login metadata under `user`: `authProvider`, `authProviders`, and `hasPassword`. Clients must use `hasPassword` to decide whether email/password account controls are applicable.

## Pending From Frozen Contract

These APIs are frozen in `docs/reference/sm-new-api-v1-contract-checklist.md` but not implemented in `apps/v1_api` yet:

- `POST /api/v1/auth/oauth/:provider/callback`
- `POST /api/v1/auth/email/login`
- `POST /api/v1/auth/signup`
- `GET /api/v1/terms/current`
- `POST /api/v1/terms/consents`

Frontend auth/session work must not assume old app auth storage is shared with v1.
