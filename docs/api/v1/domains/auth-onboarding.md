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

Kakao signup starts with `POST /api/v1/auth/kakao` because the provider user key is needed first. Teameet does not derive, parse, or persist a service nickname from the Kakao provider nickname, and never synthesizes a `k_{providerUserKey}` nickname. A new Kakao user is created as `onboardingStatus = social_terms_required` without a profile. If the user leaves here, admin surfaces should treat the row as `가입 진행 중 · 약관 미동의`.

When `POST /api/v1/auth/social-terms` succeeds, the API records required terms consent, sets `onboardingStatus = social_profile_required`, and returns `/signup/social`. The user must then submit a unique nickname and `male` or `female` gender through `POST /api/v1/auth/social-profile`. During rolling deployment, deprecated `displayName` request input remains accepted only as a fallback when `realName` is absent; new clients send `realName`. A successful profile submission creates `v1_user_profiles`, sets `onboardingStatus = signup_done` and `currentStep = sport`, and the frontend shows `/signup/complete` before sport onboarding.

`social_terms_required` and `social_profile_required` are authenticated-but-restricted states. They are not guest sessions. The web gate always resumes the exact required route, and API guards reject unrelated protected or optional-auth requests with `403 SIGNUP_INCOMPLETE` and `details.next.route`. The only common authenticated exceptions are `GET /auth/me` and `POST /auth/logout`; each pending state additionally allows only its own completion endpoint.

`GET /api/v1/auth/me` includes account login metadata under `user`: `authProvider`, `authProviders`, and `hasPassword`. Clients must use `hasPassword` to decide whether email/password account controls are applicable.

## Pending From Frozen Contract

These APIs are frozen in `docs/reference/sm-new-api-v1-contract-checklist.md` but not implemented in `apps/v1_api` yet:

- `POST /api/v1/auth/oauth/:provider/callback`
- `POST /api/v1/auth/email/login`
- `POST /api/v1/auth/signup`
- `GET /api/v1/terms/current`
- `POST /api/v1/terms/consents`

Frontend auth/session work must not assume old app auth storage is shared with v1.
