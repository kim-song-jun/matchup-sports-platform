# V1 Auth And Onboarding API

## Implemented Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/auth/me` | user | headers only | current user, profile, onboarding summary |
| `POST` | `/api/v1/auth/register` | none | `RegisterDto` + current required document IDs | email session + onboarding/terms route |
| `POST` | `/api/v1/auth/kakao` | none | `{ code, redirectUri? }` | social session + onboarding route |
| `POST` | `/api/v1/auth/social-terms` | user | `{ requiredTermsAccepted: true, acceptedTermsDocumentIds: uuid[] }` | social session + onboarding route |
| `GET` | `/api/v1/terms/current?context=signup|tournament_application|footer` | optional user | active context | effective current documents; signup adds per-user compliance |
| `POST` | `/api/v1/terms/consents` | user | `{ documentIds: uuid[] }` | append-only acceptance result + compliance |
| `POST` | `/api/v1/auth/social-profile` | user | `SocialProfileDto` | compatibility profile completion |
| `GET` | `/api/v1/onboarding` | user | headers only | onboarding resume summary |
| `PATCH` | `/api/v1/onboarding/preferences` | user | `UpdateOnboardingPreferencesDto` | updated onboarding summary |
| `POST` | `/api/v1/onboarding/complete` | user | empty body | completed onboarding summary |
| `POST` | `/api/v1/onboarding/defer` | user | `{ reason?: "skip_now" | "later" | "unknown" }` | deferred onboarding summary |
| `POST` | `/api/v1/auth/phone/issue` | none | `{ phone }` | `{ expiresAt, devCode? }` |
| `POST` | `/api/v1/auth/phone/verify` | none | `{ phone, code, purpose? }` | `{ verified, proofToken }` |
| `POST` | `/api/v1/auth/recovery/find-account` | none | `{ phone, proofToken }` | `{ maskedEmail, providers, hasPassword }` |
| `POST` | `/api/v1/auth/recovery/reset-password` | none | `{ phone, proofToken, newPassword }` | `{ ok: true }` |
| `POST` | `/api/v1/auth/recovery/email/request` | none | `{ email }` | `{ sent: true, expiresAt, devCode? }` |
| `POST` | `/api/v1/auth/recovery/email/confirm` | none | `{ email, code }` | `{ verified, proofToken }` |
| `POST` | `/api/v1/auth/recovery/email/reset-password` | none | `{ email, proofToken, newPassword }` | `{ ok: true }` |

## Account Recovery (Pre-session)

Finding the signup email and resetting a password happen while logged out, so they cannot reuse
`/api/v1/verification/*`, which sits behind `V1AuthGuard`. Two channels prove ownership; either one
leads to a password reset, and only the phone channel can look up the email you signed up with —
looking up an email by email is not a thing.

| Concern | Contract |
|---|---|
| Rate limit | `phone/verify`, `find-account`, `email/confirm` 10/min · `phone/issue`, `email/request`, both reset paths 5/min. Resetting is always at most as wide as looking up, and the paths that send a message are the narrowest. |
| Resend cooldown | 30s per target, enforced per phone number and per email address (`VERIFICATION_RESEND_COOLDOWN`). |
| Attempt cap | 5 wrong codes per challenge (`VERIFICATION_TOO_MANY_ATTEMPTS`). A correct code still succeeds at the cap, so a resubmit is never blocked by earlier typos. |
| Code TTL | 5 minutes. Proof token TTL 10 minutes. |
| Social-only accounts | Kakao-only accounts are never given a password. Both reset paths answer `PASSWORD_LOGIN_UNAVAILABLE` — and only after ownership is proven, never at request time. |

### Proof tokens do not cross channels

Both channels sign with the same secret (`V1_SESSION_SECRET` / `V1_JWT_SECRET` / `JWT_SECRET`), so
the payload is what separates them. Signing, expiry, and constant-time comparison live in
`verification/proof-token.ts`; each channel only decides what to sign.

```
phone  signup          {phone}:{exp}                      ← legacy shape, must not change
phone  password_reset  password_reset:{phone}:{exp}
email  password_reset  email:password_reset:{email}:{exp}  ← channel label
```

`/auth/phone/verify` takes `purpose` from the caller for compatibility. The email path does not:
the server pins it to `password_reset`, so the caller cannot widen what the proof is good for.
A missing secret is fail-closed — issuing throws, verifying always rejects.

### Account enumeration

Anyone can try any email address, so `email/request` must not reveal whether it belongs to an
account. It always answers `{ sent: true, expiresAt }` and always writes a challenge row; only a
registered address is actually mailed. Nobody can guess a code that was never sent, so an
unregistered address and a wrong code fail identically (`VERIFICATION_CODE_MISMATCH`). `devCode`
appears only where no real delivery channel is configured (dev-echo) *and* mail was actually sent,
because otherwise its presence alone would answer the question. Expired challenges are swept on
each issue so the table stays short — it grows with addresses tried, not with accounts.

The phone path does not need this: `find-account` answers `ACCOUNT_NOT_FOUND` openly, but only
after the caller has proven the number is theirs.

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
- `v1_verification_tokens` — logged-in verification; requires `user_id`
- `v1_phone_verification_challenges` — pre-session phone OTP, keyed by phone
- `v1_email_verification_challenges` — pre-session email OTP, keyed by email. Separate from
  `v1_verification_tokens` precisely because a row must exist for addresses that belong to no
  account; a `user_id` requirement would make "no such account" observable.
- `v1_status_change_logs`

Managed terms phase-1 tables:

- `v1_managed_terms_policies`: stable policy identity
- `v1_managed_terms_documents`: immutable published versions, including the current `v1.1` baseline
- `v1_managed_terms_placements`: `signup | tournament_application | footer` placement and `required | optional | display_only` requirement
- `v1_managed_terms_consent_events`: append-only versioned decisions with legacy provenance
- `v1_managed_terms_migration_audits`: migration-time parity counts and boolean distributions

The phase-1 migration is additive. It does not update or delete `v1_terms_documents`, `v1_user_terms_consents`, or any tournament registration agreement column. Existing signup `terms` and `privacy` consent rows are projected into the new event history while retaining their original document relation. Because the historical Web copy cannot be proven identical to the new baseline, migrated events set `versionVerified=false`; an existing `revokedAt` creates a separate `revoked` event. Legacy `marketing` rows remain untouched and are counted as unmapped rather than being falsely attributed to `v1.1`.

The runtime reads the newest published document whose `effectiveAt` is null or has arrived for each active placement. Anonymous callers can read signup, tournament-application, and footer documents. Authenticated signup callers additionally receive `accepted`, `requiresAction`, and `compliance`. `subtitle` is stable display copy; `changeSummary` is shown only when a changed version requires action. A required document with `requiresReconsent=true` is satisfied only by an acceptance of that exact version. If it is false, the latest accepted event for the same stable policy can satisfy the current version. `enforcementAt` delays blocking only for existing users; new signups must always accept the current required documents.

`POST /api/v1/terms/consents` verifies the submitted IDs against the current required set before writing append-only `source=web`, `versionVerified=true` events. It never updates legacy consent rows or prior managed events. Stale IDs return `400 TERMS_DOCUMENT_STALE`; an incomplete required set returns `400 TERMS_REQUIRED`; no published required signup terms returns `400 TERMS_NOT_READY`.

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

Email and social signup requests must submit every current required document ID as `acceptedTermsDocumentIds`. A stale browser view cannot complete signup; the client must reload the current documents and ask for the new requirement.

Email signup must accept required terms and submit `displayName`, an 11-digit `phone`, a real-calendar `birthDate` in `YYYYMMDD` format, and `gender = male | female` before `POST /api/v1/auth/register` creates the account. `displayName` is trimmed and cannot be blank. A successful email signup creates `v1_user_profiles`, sets `onboardingStatus = signup_done`, and sends the client through the signup complete screen before sport onboarding. `profileImageUrl` remains optional and nullable.

Kakao signup starts with `POST /api/v1/auth/kakao` because the provider user key is needed first. Teameet does not derive, parse, or persist a service nickname from the Kakao provider nickname, and never synthesizes a `k_{providerUserKey}` nickname. A new Kakao user is created as `onboardingStatus = social_terms_required` without a profile. If the user leaves here, admin surfaces should treat the row as `가입 진행 중 · 약관 미동의`.

When `POST /api/v1/auth/social-terms` succeeds, the API does not create a profile. It sets `onboardingStatus = social_profile_required`, sets `currentStep = signup`, and returns `next.route = /signup/social`. The client must navigate to the returned route.

`POST /api/v1/auth/social-profile` then requires `nickname`, a trimmed non-blank name, an 11-digit `phone`, a real-calendar `birthDate` in `YYYYMMDD` format, and `gender = male | female`. New clients send the name as `realName`; deprecated `displayName` remains accepted during rolling deployment. The normalized value is written to both `real_name` and the legacy `display_name`, then the API sets `onboardingStatus = signup_done`, sets `currentStep = sport`, and returns the next route. `profileImageUrl` remains optional and nullable.

`social_terms_required` and `social_profile_required` are authenticated-but-restricted states. They are not guest sessions. The web gate always resumes the exact required route, and API guards reject unrelated protected or optional-auth requests with `403 SIGNUP_INCOMPLETE` and `details.next.route`. The only common authenticated exceptions are `GET /auth/me` and `POST /auth/logout`; each pending state additionally allows only its own completion endpoint.

`GET /api/v1/auth/me` includes account login metadata under `user`: `authProvider`, `authProviders`, and `hasPassword`. Clients must use `hasPassword` to decide whether email/password account controls are applicable.

`GET /api/v1/auth/me` and successful session responses also include `termsCompliance`. After the configured enforcement time, a completed existing user with pending required documents receives `403 TERMS_RECONSENT_REQUIRED` from other protected APIs, with pending document IDs and `next.route=/terms?mode=renewal`. Email login follows that route immediately and preserves a safe original redirect. The global gate does not race the login callback, and the renewal screen has no back action and prevents browser-history bypass until compliance succeeds. The guard keeps `/auth/me`, `/auth/logout`, `/terms/current`, and `/terms/consents` reachable so the user can inspect and complete the requirement. Previously satisfied items remain checked and disabled; only newly required IDs are posted.

## Pending From Frozen Contract

These APIs are frozen in `docs/reference/sm-new-api-v1-contract-checklist.md` but not implemented in `apps/v1_api` yet:

- `POST /api/v1/auth/oauth/:provider/callback`
- `POST /api/v1/auth/email/login`
- `POST /api/v1/auth/signup`

Frontend auth/session work must not assume old app auth storage is shared with v1.
