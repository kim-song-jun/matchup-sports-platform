# Task 94 — V1 Signup Required Profile Fields

> Superseded on 2026-07-14: the latest user decision makes name, phone, birth date, and gender required for new email and social signups. The file name is retained to preserve canonical task history.

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/v1/domains/profile-settings.md`

## Request

Require the first-profile contract in both email and social signup:

- name, trimmed and containing a visible non-whitespace character
- phone number, 11 digits with UI hyphen formatting
- real-calendar birth date, 8 digits with UI hyphen formatting
- gender, `male | female`
- one optional profile image

## Acceptance Criteria

- Email signup still requires the existing required terms, nickname, email, and password contract.
- Email and social signup both reject a missing/blank name, a non-numeric or non-11-digit phone, a non-calendar `YYYYMMDD` birth date, and gender outside `male | female`.
- Phone is persisted to `v1_users.phone`.
- Birth date is persisted to `v1_user_profiles.birth_date`.
- The trimmed name is persisted to `v1_user_profiles.display_name` without a nickname fallback.
- Profile image remains optional; when provided it is persisted to `v1_user_profiles.profile_image_url`, otherwise `null` is stored.
- Existing nullable production rows remain unchanged; this is a new-signup boundary and requires no Prisma migration or backfill.
- Web validation cannot silently repair alphabetic or overlength raw phone/birth-date input into a valid payload.
- Social terms and social profile completion follow the API `next.route` without a hard-coded success fallback.

## Progress Snapshot

- Superseded the former optional-field contract with the latest required-field decision for new email and social users.
- Added one shared API required-profile DTO validator and one shared Web validator.
- Extended v1 auth register/social-profile service persistence without a nickname/null fallback for required values.
- Preserved the existing nullable schema and production rows; no migration or backfill was added for this decision.
- Extended profile edit to update profile image, display name, nickname, email, bio, phone, and birth date with duplicate checks for changed nickname/email.
- Updated signup and profile edit birth date inputs to support both direct text entry and native date selection while preserving the existing `YYYYMMDD` API payload.
- Synced v1 auth-onboarding/profile-settings API docs and focused AUTH scenario coverage.
- Focused verification is green: API DTO/AuthService 55/55, Web shared/email/social/terms 28/28, and the full MSW register boundary 14/14.
- Live signup QA passed at 390x844, 768x1024, and 1440x900 with no horizontal overflow or CTA overlap. Evidence: `output/playwright/visual-audit/session-handoff-2026-07-14/signup-required-fields/signup-profile-{390x844,768x1024,1440x900}.png`.
- Live overlength regression QA at 390x844 and 768x1024 confirmed that email/social phone and birth-date raw input remains visible and invalid instead of being silently truncated into a valid payload. Evidence: `output/playwright/visual-audit/signup-overlength-2026-07-15/`.
- Added the social required-step barrier: preferences/complete/defer return `409 ONBOARDING_STEP_REQUIRED` with `/terms?mode=social` or `/signup/social` before any write for incomplete social signup. Focused onboarding service verification is 14/14.
- Lazyweb signup report completed without degradation or failures: https://www.lazyweb.com/report/lazyweb/d886f37f-7131-46a9-8b29-899aa288c1a4/?source=create
- Repository-wide TypeScript checks, full suites, and builds remain intentionally deferred to the single final integration gate per the user's verification-cadence decision.
