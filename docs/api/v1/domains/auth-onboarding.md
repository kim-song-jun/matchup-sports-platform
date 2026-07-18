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

Browser geolocation is resolved immediately to a supported region through `POST /api/v1/master/regions/resolve-location`. The request must include `locationConsentAccepted: true`; the Web UI discloses the one-time coordinate transmission before each current-location action, rather than presenting location access as a signup consent that is silently persisted. `PATCH /api/v1/onboarding/preferences` accepts only the selected region id and never accepts or persists raw latitude, longitude, accuracy, or capture time. The web onboarding draft likewise keeps only the matched region id/name in session storage. Denying location permission must leave manual region selection available.

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

## Required Social Signup Step Barrier

`PATCH /api/v1/onboarding/preferences`, `POST /api/v1/onboarding/complete`, and `POST /api/v1/onboarding/defer` reject incomplete social signup before any write or transaction. Other onboarding statuses keep their existing mutation behavior.

| `onboardingStatus` | HTTP status | `details.requiredRoute` |
|---|---|---|
| `social_terms_required` | `409` | `/terms?mode=social` |
| `social_profile_required` | `409` | `/signup/social` |

The error body is:

```json
{
  "code": "ONBOARDING_STEP_REQUIRED",
  "message": "Complete the required signup step before continuing onboarding",
  "details": {
    "requiredRoute": "/terms?mode=social"
  }
}
```

For `social_profile_required`, only `details.requiredRoute` changes to `/signup/social`.

## Signup Flow

Email signup must accept required terms and submit `displayName`, an 11-digit `phone`, a real-calendar `birthDate` in `YYYYMMDD` format, and `gender = male | female` before `POST /api/v1/auth/register` creates the account. `displayName` is trimmed and cannot be blank. A successful email signup creates `v1_user_profiles`, sets `onboardingStatus = signup_done`, and sends the client through the signup complete screen before sport onboarding. `profileImageUrl` remains optional and nullable.

Kakao signup starts with `POST /api/v1/auth/kakao` because the provider user key is needed first. Teameet does not derive, parse, or persist a service nickname from the Kakao provider nickname, and never synthesizes a `k_{providerUserKey}` nickname. A new Kakao user is created as `onboardingStatus = social_terms_required` without a profile. If the user leaves here, admin surfaces should treat the row as `가입 진행 중 · 약관 미동의`.

When `POST /api/v1/auth/social-terms` succeeds, the API does not create a profile. It sets `onboardingStatus = social_profile_required`, sets `currentStep = signup`, and returns `next.route = /signup/social`. The client must navigate to the returned route.

`POST /api/v1/auth/social-profile` then requires `nickname`, a trimmed non-blank name, an 11-digit `phone`, a real-calendar `birthDate` in `YYYYMMDD` format, and `gender = male | female`. New clients send the name as `realName`; deprecated `displayName` remains accepted during rolling deployment. The normalized value is written to both `real_name` and the legacy `display_name`, then the API sets `onboardingStatus = signup_done`, sets `currentStep = sport`, and returns the next route. `profileImageUrl` remains optional and nullable.

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
