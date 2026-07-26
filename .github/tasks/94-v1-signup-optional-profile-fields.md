# Task 94 — V1 Signup Required Profile Fields

> The historical filename is retained, but the current contract requires the first-profile fields for every new email and social signup.

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/v1/domains/auth-onboarding.md`, `docs/api/v1/domains/profile-settings.md`

## Contract

- Required: nickname, a visible non-blank name, 11-digit phone, real-calendar `YYYYMMDD` birth date, and `male | female` gender.
- Email signup additionally requires email, password, and required terms acceptance.
- Profile image is optional and must be uploaded after an authenticated session exists; a local `data:` preview is never persisted.
- New clients send the private name as `realName`. Deprecated `displayName` remains accepted during rolling deployment.
- Signup normalizes the accepted name and writes it to private `real_name` and legacy `display_name`. Public identity remains nickname.
- Existing nullable production rows remain valid; creator entry points enforce the separate creator-profile gate.

## Acceptance Criteria

- Email and social signup reject a missing or blank name, invalid phone, invalid calendar birth date, and unsupported gender.
- Web validation does not silently truncate or repair invalid raw phone or birth-date input.
- Phone is persisted to `v1_users.phone`; name, birth date, gender, and image URL are persisted to `v1_user_profiles`.
- Social terms and social profile completion follow the API `next.route` without a hard-coded fallback.
- `social_terms_required` and `social_profile_required` sessions cannot access unrelated site routes or APIs.
- Profile editing uses `realName`, keeps nickname public, and supports social-account contact email without changing the Kakao provider key.
- Personal match, team, and team-match creation require real name, phone, and gender and return `PROFILE_COMPLETION_REQUIRED` with missing fields when incomplete.
- Application, invitation, chat, review, inquiry, and existing-entity management do not use the creator gate.

## Progress Snapshot

- Added shared API and Web required-profile validation for email and Kakao signup.
- Added additive `v1_user_profiles.real_name` migration with legacy name backfill and rolling `displayName` request compatibility.
- Removed Kakao provider nickname ingestion and generated nickname fallbacks.
- Added pending-social-session route and API guards.
- Added creator-profile guards to the three creation entry points while preserving other user actions.
- Added authenticated image upload persistence and profile edit loading/error states.
- Preserved canonical root browser routes; `/v1` remains only the API prefix and is not a frontend route alias.
- Focused validation and live signup evidence from the preceding dev work remain recorded in the session handoff; the merged tree receives one final sequential verification before alpha deployment.
