# Domain Contract — Auth And Onboarding

## Source Of Truth Priority

1. `apps/v1_api/src/auth/auth.controller.ts`, `account-recovery.controller.ts`, `phone-verification-public.controller.ts`
2. `apps/v1_api/src/auth/dto/` (`login.dto.ts`, `login-step-up.dto.ts`, `register.dto.ts`, `kakao-login.dto.ts`, `apple-login.dto.ts`, `social-profile.dto.ts`)
3. `apps/v1_api/src/auth/auth.service.ts`, `account-recovery.service.ts`, `login-security/` (attempt counting, spray detection, step-up challenges)
4. `apps/v1_api/src/auth/*.spec.ts`
5. `apps/v1_web/src/lib/api-client.ts`, `apps/v1_web/src/hooks/use-v1-api.ts`

## Endpoint Matrix

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/auth/me` | user | headers only | current user, profile, onboarding summary, `termsCompliance` |
| `POST` | `/api/v1/auth/login` | none | `LoginDto { email, password }` | session cookie + user snapshot, **or** `200 { stepUp }` with no session (see [Email login step-up](#email-login-step-up)) |
| `POST` | `/api/v1/auth/login/step-up/verify` | none | `{ challengeToken, code }` (`code` = 6 digits) | same response and cookie as a completed `login` |
| `POST` | `/api/v1/auth/login/step-up/resend` | none | `{ challengeToken }` | `{ expiresAt, resendAvailableAt, devCode? }` |
| `POST` | `/api/v1/auth/dev-session` | user (header identity, non-production) | empty body | issues signed `teameet_v1_session` cookie for an already-header-authenticated caller |
| `POST` | `/api/v1/auth/register` | none | `RegisterDto` + current required document IDs | session cookie + onboarding/terms route |
| `POST` | `/api/v1/auth/kakao` | none | `{ code, redirectUri? }` | social session + onboarding route |
| `POST` | `/api/v1/auth/kakao/token` | none | `{ accessToken }` (10-4096 chars) | same as `/auth/kakao` — both resolve the user through one shared path |
| `POST` | `/api/v1/auth/apple/nonce` | none | empty body | `{ nonce }` (signed, 5 min TTL) |
| `POST` | `/api/v1/auth/apple` | none | `{ identityToken, nonce, fullName? }` | social session + onboarding route |
| `POST` | `/api/v1/auth/social-terms` | user | `{ requiredTermsAccepted: true, ageConfirmed: true, acceptedTermsDocumentIds: uuid[] }` | social session + onboarding route |
| `POST` | `/api/v1/auth/social-profile` | user | `SocialProfileDto` | compatibility profile completion (also finishes a deferred profile) |
| `POST` | `/api/v1/auth/social-profile/defer` | user | empty body | skip the profile form; social session without `next` |
| `POST` | `/api/v1/auth/social-link/preview` | user (pending social: `social_profile_required` without a profile, or `social_profile_deferred`) | `{ phone, proofToken }` | `409 SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF` after existing preconditions; no holder metadata, proof consumption or writes |
| `POST` | `/api/v1/auth/social-link` | user (pending social: `social_profile_required` without a profile, or `social_profile_deferred`) | `{ phone, proofToken }` | `409 SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF` after existing preconditions; no identity transfer, account deletion or holder session |
| `GET` | `/api/v1/auth/check-email` | none | `?email=` | `{ available: boolean }` |
| `GET` | `/api/v1/auth/check-nickname` | optional | `?nickname=` | `{ available: boolean }` |
| `GET` | `/api/v1/terms/current?context=signup\|tournament_application\|footer` | optional user | active context | effective current documents; signup adds per-user compliance |
| `POST` | `/api/v1/terms/consents` | user | `{ documentIds: uuid[] }` | append-only acceptance result + compliance |
| `GET` | `/api/v1/onboarding` | user | headers only | onboarding resume summary |
| `PATCH` | `/api/v1/onboarding/preferences` | user | `UpdateOnboardingPreferencesDto` | updated onboarding summary |
| `POST` | `/api/v1/onboarding/complete` | user | empty body | completed onboarding summary |
| `POST` | `/api/v1/onboarding/defer` | user | `{ reason?: "skip_now" \| "later" \| "unknown" }` | deferred onboarding summary |
| `POST` | `/api/v1/auth/phone/issue` | none | `{ phone }` | `{ expiresAt, devCode? }` |
| `POST` | `/api/v1/auth/phone/verify` | none | `{ phone, code, purpose?: "signup" \| "password_reset" \| "social_link" }` | `{ verified, proofToken }` |
| `POST` | `/api/v1/auth/recovery/find-account` | none | `{ phone, proofToken }` | `{ maskedEmail, providers, hasPassword }` |
| `POST` | `/api/v1/auth/recovery/reset-password` | none | `{ phone, proofToken, newPassword }` | valid phone proof and existing active account: `409 ACCOUNT_RECOVERY_REQUIRES_EMAIL`; no password write |
| `POST` | `/api/v1/auth/recovery/email/request` | none | `{ email }` | `{ sent: true, expiresAt, devCode? }` |
| `POST` | `/api/v1/auth/recovery/email/confirm` | none | `{ email, code }` | `{ verified, proofToken }` |
| `POST` | `/api/v1/auth/recovery/email/reset-password` | none | `{ email, proofToken, newPassword }` | `{ ok: true }` |

Account deletion is not on this controller — see `POST /api/v1/me/withdrawal-request`
in [Users](./users.md).

## Session Model

Auth does not issue JWT access/refresh tokens. `AuthController` is wrapped in
`V1SessionCookieInterceptor`, and every success path above (except the two `check-*` probes and
`apple/nonce`) ends by minting the same stateless, signed `teameet_v1_session` httpOnly cookie
(`v1.<payload>.<HMAC>`, no server-side session table). There is no `/auth/refresh` endpoint —
the session is re-derived from the cookie on each request by `V1AuthGuard`.

`POST /api/v1/auth/login` verifies `LoginDto { email (min 3), password (min 8) }` against
`V1AuthIdentity` (`provider = email`) with a hashed password compare. Wrong email or password both
return `401 UNAUTHENTICATED` ("Email or password is incorrect") — the two failure modes are not
distinguished. A non-active identity or account status returns `403 PERMISSION_DENIED`, except a
`withdrawal_pending` account status, which returns `403 ACCOUNT_WITHDRAWAL_PENDING`.

## Email login step-up

Email login adds one email-code step when the password check alone is not trustworthy enough.
Social login (Kakao, Apple) is never counted and never asked for it.

**When it applies** (decided before the password is looked at):

- the email (lower-cased, trimmed) has failed **3 or more** times in the last 15 minutes, counted since its last completed login; or
- a password-spray attack is *active*: in the last 10 minutes there were at least 30 failed logins across at least 10 distinct emails,
  and the last such detection is under 30 minutes old. While active, **every** email login steps up.

**What the client sees.** While step-up applies, a right password, a wrong password and an unknown email all
answer `200` with the same body and no session cookie:

```json
{ "stepUp": { "challengeToken": "<opaque>", "maskedEmail": "ru***@example.com",
              "expiresAt": "<ISO, +5 min>", "resendAvailableAt": "<ISO, +30 s>", "devCode": "123456" } }
```

`maskedEmail` masks the address the caller typed. `devCode` appears only where `V1_VERIFICATION_DEV_ECHO` applies
(no real mail transport) and only for a challenge that is actually deliverable. A code is mailed **only** when the password
was right; the other two get a decoy challenge that is issued, resent and verified the same way (same scrypt work, same
errors) but can never log in. Nothing in the status, body or timing separates the three cases. The mail is sent off the
request path for the same reason. A mail failure is logged, recorded on the challenge, and reported by the **next resend** as
`503 EMAIL_SEND_FAILED` (which also skips the cooldown).

`POST /auth/login/step-up/verify` ends exactly like a completed login (session response + cookie).
Failures: `400 STEP_UP_CODE_INVALID`, `410 STEP_UP_EXPIRED` (unknown or used token, code older than 5 minutes, token older than 30 minutes),
`429 STEP_UP_TOO_MANY_ATTEMPTS` (the 5th wrong code, and anything after it until a resend). Suspended and withdrawal-pending accounts get
their usual `403` here, after the code proved ownership.

`POST /auth/login/step-up/resend` issues a new code (attempts reset) while the token is under 30 minutes old, even if the previous
code already expired. Failures: `429 STEP_UP_RESEND_COOLDOWN` (`details.retryAfterSeconds`, 30 s between sends) and
`429 STEP_UP_SEND_LIMIT` (5 real mails per email per 24 h; also returned by `login` itself once the cap is hit).

Rate limits per IP: `login` 10/min, `verify` 10/min, `resend` 5/min.

In echo environments (`V1_VERIFICATION_DEV_ECHO`), a decoy challenge and decoy resend carry a random six-digit `devCode` too, so the
field's presence never reveals whether the password was right; the decoy code never verifies.

A successful password reset by email (`POST /auth/recovery/email/reset-password`) clears that email's login failure records, send count
and open step-up challenges, so the owner can sign in with the new password without step-up (unless a spray attack is active). A
failure while clearing is logged and does not undo the reset.

**Records.** `v1_login_attempts` keeps `emailKey` / `ipKey` (HMAC-SHA256 under a key derived from `V1_SESSION_SECRET`,
never the raw values), the result (`success | failed | step_up_issued`) and the time, for 30 days.
`v1_login_step_up_challenges` keeps token and code as hashes, attempt and send counters, and is purged 7 days after expiry.
`v1_security_anomalies` records each spray detection: while the last detection is under 30 minutes old a new detection only refreshes
`lastDetectedAt` and the counts, so one attack produces one anomaly and one Slack alert (outbox `SECURITY_LOGIN_ANOMALY`, delivered by
the worker to the inquiry webhook with a `[보안] 로그인 실패 급증 (alpha|prod)` first line). The admin monitoring hub shows the signal through
`GET /api/v1/admin/monitoring/summary` → `loginAnomalies`.

All thresholds live in `LOGIN_SECURITY_POLICY` (`apps/v1_api/src/auth/login-security/login-security.policy.ts`).

`POST /api/v1/auth/dev-session` requires the caller to already be authenticated (`V1AuthGuard`),
which in a non-production environment accepts header-based dev identity
(`x-v1-user-id`/`x-v1-user-email`). It upgrades that header identity into the same signed session
cookie `login()` issues — most seeded personas have no password, so `login()` itself is not usable
to obtain a session for them. In production, `V1AuthGuard` rejects header identity outright, so
this route grants nothing beyond what any other guarded route already grants a caller with a valid
session cookie.

`GET /api/v1/auth/check-email` and `GET /api/v1/auth/check-nickname` are availability probes (check-nickname: optional auth, see below) (`{ available: boolean }`) used by signup forms; both are rate-limited
(30/min). A missing or empty `email`/`nickname` query is rejected by the query DTO before the
service runs. Nickname must be at least 2 trimmed characters; email must normalize to at least 3
characters. Every rejection is `400 VALIDATION_ERROR`.

`check-nickname` uses `OptionalV1AuthGuard`: an anonymous caller gets the strict answer, an authenticated caller's own current nickname is reported `available: true`, and profiles of deleted accounts are ignored (the same rule as register, defer and complete).

## Account Recovery (Pre-session)

Finding the signup email and resetting a password happen while logged out, so they cannot reuse
`/api/v1/verification/*`, which sits behind `V1AuthGuard`. Phone verification proves current
possession of a number and permits account lookup; it does not prove ownership of an existing
account. The compatibility phone reset endpoint keeps proof/account preconditions, then returns
`409 ACCOUNT_RECOVERY_REQUIRES_EMAIL` without changing credentials. Password reset requires
the separate email proof channel. Only the phone channel looks up the signup email.

| Concern | Contract |
|---|---|
| Rate limit | `phone/verify`, `find-account`, `email/confirm` 10/min · `phone/issue`, `email/request`, both reset paths 5/min. Resetting is always at most as wide as looking up, and the paths that send a message are the narrowest. |
| Resend cooldown | 30s per target, enforced per phone number and per email address (`VERIFICATION_RESEND_COOLDOWN`). |
| Attempt cap | 5 wrong codes per challenge (`VERIFICATION_TOO_MANY_ATTEMPTS`). A correct code still succeeds at the cap, so a resubmit is never blocked by earlier typos. |
| Code TTL | 5 minutes. Proof token TTL 10 minutes. |
| Social-only accounts | Kakao-only accounts are never given a password. Email reset answers `PASSWORD_LOGIN_UNAVAILABLE` only after email ownership is proven, never at request time. Phone reset answers `ACCOUNT_RECOVERY_REQUIRES_EMAIL` after its existing proof/account preconditions, regardless of whether the account has a password. |

### Proof tokens do not cross channels

Both channels sign with the same secret (`V1_SESSION_SECRET` / `V1_JWT_SECRET` / `JWT_SECRET`), so
the payload is what separates them. Signing, expiry, and constant-time comparison live in
`verification/proof-token.ts`; each channel only decides what to sign.

```
phone  signup          {phone}:{exp}                      ← legacy shape, must not change
phone  password_reset  password_reset:{phone}:{exp}
phone  social_link     social_link:{phone}:{exp}
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
- `v1_login_attempts`, `v1_login_step_up_challenges`, `v1_security_anomalies` — email login step-up (see above)
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

`POST /api/v1/auth/register` and `POST /api/v1/auth/social-profile` (the last step of every signup path) also accept an optional `recordConsent: { granted: boolean, policyHash: string }`, the same shape as `PUT /me/record-consent`. When present it is upserted into `V1UserRecordConsent` (`GRANTED`/`REVOKED`) inside the signup transaction. When omitted (older clients) no consent row is written and the user stays undecided. Existing accounts are never backfilled.

`POST /auth/kakao/token` (native SDK access token, 10/min throttle) fails closed in this order: `KAKAO_APP_ID` unset `400 OAUTH_NOT_CONFIGURED`; `GET /v1/user/access_token_info` whose `app_id` differs from `KAKAO_APP_ID` `401 UNAUTHENTICATED` (before `/v2/user/me` is called); `/v2/user/me` `id` differing from the token-info `id` `401`. Kakao `-401`/`-2` map to `401 UNAUTHENTICATED`; Kakao `-1`, 5xx, timeouts and network failures map to `503 KAKAO_UNAVAILABLE`. The token is never logged. `providerUserKey` is the same Kakao id as the code flow, so existing members sign in to the same account.

Kakao signup starts with `POST /api/v1/auth/kakao` because the provider user key is needed first. The Kakao provider nickname is kept only as a server-side seed (`draftJson.kakaoNickname`) for `POST /auth/social-profile/defer`; it is never returned to the client, and Teameet never synthesizes a `k_{providerUserKey}` nickname. A new Kakao user is created as `onboardingStatus = social_terms_required` without a profile. If the user leaves here, admin surfaces should treat the row as `가입 진행 중 · 약관 미동의`.

The current signup privacy disclosure identifies Kakao email, name, mobile number, gender, birth year, and birthday as required account-information consent for Kakao signup. Kakao nickname and profile image are optional; the Kakao nickname is a suggestion, while the Teameet profile nickname is a separate value. Refusing required Kakao information consent prevents completing Kakao signup, while guest browsing remains available. The disclosure version uses `requiresReconsent=false`, so publishing it does not force existing members through a global re-consent gate. Provider consent configuration and business review are managed in the Kakao developer console, separately from this API contract.

When `POST /api/v1/auth/social-terms` succeeds, the API does not create a profile. It sets `onboardingStatus = social_profile_required`, sets `currentStep = signup`, and returns `next.route = /signup/social`. The client must navigate to the returned route. The body must carry `ageConfirmed: true` (the "만 14세 이상이에요" checkbox); a missing or `false` value is `400`, and the confirmation time is stored as `draftJson.ageConfirmedAt`.

`POST /api/v1/auth/social-profile/defer` (only from `social_profile_required`; `social_terms_required` is `400 TERMS_REQUIRED`, any other state `400 VALIDATION_ERROR`, an account older than 24h `401 SOCIAL_SIGNUP_EXPIRED`) creates a profile with an automatic nickname and sets `onboardingStatus = social_profile_deferred`. The nickname is the Kakao nickname (Apple: the first-authorization name), normalized to at most 20 characters; if taken it gets a 2-4 digit numeric suffix (the base is truncated by code points so the total stays within 20). With no usable seed, or when the suffixed attempts all collide, it falls back to `팀밋사용자` + 6 digits. Every returned nickname was checked against existing profiles (deleted accounts ignored) within a bounded number of attempts; when those are exhausted the call fails with `409 NICKNAME_GENERATION_FAILED` and no profile is created. `real_name`, `gender` and `birth_date` stay null. The response normally has no onboarding `next.route`, but the shared session response returns `next.route = /terms?mode=renewal` when the account has outstanding required terms. The client follows mandatory `next` before consuming its original destination.

`social_profile_deferred` is not a pending-signup state: reads and the profile-form endpoints work, the 24h expiry does not apply, and `PATCH /onboarding/preferences`, `/onboarding/defer` and `/onboarding/complete` save their data but never change the status. Writes outside the phone-verification allow-list return `403 ACTIVITY_PROFILE_REQUIRED` with `details.next.route = /signup/social`. Finishing `POST /auth/social-profile` from this state keeps the existing nickname valid and sets `onboardingStatus = deferred` (sport onboarding was skipped), which opens the gate.

`POST /api/v1/auth/social-profile` then requires `nickname`, a trimmed non-blank name, an 11-digit `phone`, a real-calendar `birthDate` in `YYYYMMDD` format, and `gender = male | female`. New clients send the name as `realName`; deprecated `displayName` remains accepted during rolling deployment. The normalized value is written to both `real_name` and the legacy `display_name`. From `social_profile_required` the API then sets `onboardingStatus = signup_done`, sets `currentStep = sport`, and returns the next route; from `social_profile_deferred` it sets `onboardingStatus = deferred`. Its shared session response may still return `next.route = /terms?mode=renewal` for outstanding required terms; otherwise it has no onboarding `next` and the client returns to its safe original destination. `profileImageUrl` remains optional and nullable.

`social_terms_required` and `social_profile_required` are authenticated-but-restricted states. They are not guest sessions. The web gate always resumes the exact required route, and API guards reject unrelated protected or optional-auth requests with `403 SIGNUP_INCOMPLETE` and `details.next.route`. The only common authenticated exceptions are `GET /auth/me` and `POST /auth/logout`; each pending state additionally allows only its own completion endpoint.

### Kakao contact confirmation and automatic account linking

Kakao contacts are fetched by the API from `/v2/user/me`; login requests never accept client-supplied contact assertions. A valid/verified Kakao email and a normalized domestic Kakao phone are saved as confirmed contacts on new signup without email/SMS OTP. Existing Kakao identities can confirm an identical stored contact on subsequent login; a different service contact is not overwritten. This is provider contact confirmation, not telecom identity verification or CI certification.

For an unlinked Kakao identity, automatic linking requires a valid, provider-verified email matching an already verified service email. A phone match alone, including a provider-confirmed phone, returns `409 SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF`; present possession of a reassigned number does not prove ownership of the earlier account. Both contacts must remain consistent when supplied: contacts belonging to different members or disagreeing with the candidate's stored contacts return `409 SOCIAL_LINK_CONTACT_CONFLICT`. The transaction locks and rechecks the same email ownership before attaching the identity; the existing user ID, memberships, profile and history remain intact. Established Kakao identities remain the primary key for subsequent login and do not require re-linking.

`GET /auth/me.socialSignupPrefill` includes nullable `name`, `phone`, `gender`, and `birthDate` during pending/deferred profile completion. `birthDate` combines complete `birthyear` and `birthday` only when `birthday_type = SOLAR`; lunar, incomplete or invalid dates require manual input and the existing 14+ gate applies. An unchanged server-stored Kakao phone skips OTP at profile completion and records `kakao_provided_phone` in the status audit log. An edited number or an Apple signup does not inherit that exception. The UI omits the OTP card for the Kakao number.

### Phone-only pending social-link compatibility endpoints

When a pending social signup encounters `409 PHONE_CONFLICT`, clients must direct the person to their existing account login and email recovery. `social-link` and `social-link/preview` retain the old `{ phone, proofToken }` DTO for compatibility, but a valid `purpose: "social_link"` OTP cannot supply independent proof of account ownership. The caller must still be an active account with exactly one active kakao/apple identity, in either `social_profile_required` without a profile or `social_profile_deferred` (which may already have a profile). Completed accounts are not eligible.

After validating proof purpose, caller state, holder state and provider restrictions, both endpoints return `409 SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF`. They do not move identities, inquiries or upload ownership; delete either account or profile; consume the phone challenge; add status/audit notifications; or issue a holder session or replacement cookie. Preview does not disclose a masked email or login methods. Existing data and restrictive foreign keys remain intact. Expired pending callers retain the existing signup-reset and `SOCIAL_SIGNUP_EXPIRED` behavior.

Errors: `400 PHONE_NOT_VERIFIED` (bad, expired, wrong-purpose or unavailable verified proof), `404 ACCOUNT_NOT_FOUND` (no account owns the phone), `403 ACCOUNT_WITHDRAWAL_PENDING` / `403 PERMISSION_DENIED` (inactive caller or holder), `401 SOCIAL_SIGNUP_EXPIRED`, `409 SOCIAL_LINK_NOT_PENDING`, `409 SOCIAL_LINK_SAME_ACCOUNT`, `409 SOCIAL_LINK_PHONE_UNVERIFIED`, `409 SOCIAL_LINK_ADMIN_FORBIDDEN`, `409 SOCIAL_LINK_PROVIDER_EXISTS`, and `409 SOCIAL_LINK_REQUIRES_ACCOUNT_PROOF`. Link rate limit is 5/min; preview is 10/min. Neither endpoint has a phone-only success path.

`GET /api/v1/auth/me` includes account login metadata under `user`: `authProvider`, `authProviders`, and `hasPassword`. Clients must use `hasPassword` to decide whether email/password account controls are applicable.

`GET /api/v1/auth/me` and successful session responses also include `termsCompliance`. After the configured enforcement time, a completed existing user with pending required documents receives `403 TERMS_RECONSENT_REQUIRED` from other protected APIs, with pending document IDs and `next.route=/terms?mode=renewal`. Email login follows that route immediately and preserves a safe original redirect. The global gate does not race the login callback, and the renewal screen has no back action and prevents browser-history bypass until compliance succeeds. The guard keeps `/auth/me`, `/auth/logout`, `/terms/current`, and `/terms/consents` reachable so the user can inspect and complete the requirement. Previously satisfied items remain checked and disabled; only newly required IDs are posted.

## Naver — no endpoint

`V1AuthProvider` enum retains a `naver` value, but no route or service code implements it (the
controller has only `kakao` and `apple`). The login screen's Naver button stays disabled ("준비
중") for that reason.

## Android Play readiness — age gate (2026-09-19)

Email registration and social profile completion reject valid calendar birthdays younger than 14 years,
including future dates, with HTTP 400 `SIGNUP_AGE_RESTRICTED`. Age uses UTC calendar dates and the birthday
must have occurred. A February 29 birthday reaches the boundary on March 1 in a non-leap year. Invalid
calendar dates retain the validation error contract. Frontend email/social forms share the same rule;
client controls do not replace server enforcement. No signup payload fields were added.

## Pending From Frozen Contract

These APIs are frozen in `docs/reference/sm-new-api-v1-contract-checklist.md` but not implemented in `apps/v1_api` yet:

- `POST /api/v1/auth/oauth/:provider/callback`
- `POST /api/v1/auth/email/login` — superseded by the implemented `POST /api/v1/auth/login`, which
  uses the `/api/v1` prefix directly rather than the frozen checklist's path.
- `POST /api/v1/auth/signup` — superseded by the implemented `POST /api/v1/auth/register`.

Frontend auth/session work must not assume old app auth storage is shared with v1.
