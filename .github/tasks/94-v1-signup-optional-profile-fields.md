# Task 94 — V1 Signup Optional Profile Fields

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/v1/domains/profile-settings.md`

## Request

Add optional first-profile fields to email signup:

- name
- phone number, 11 digits with UI hyphen formatting
- birth date, 8 digits with UI hyphen formatting
- one profile image

## Acceptance Criteria

- Signup still requires the existing required terms, nickname, email, password, and gender contract.
- Optional fields can be left empty.
- Phone is accepted only as 11 digits when provided and is persisted to `v1_users.phone`.
- Birth date is accepted only as a valid 8 digit `YYYYMMDD` value when provided and is persisted to `v1_user_profiles.birth_date`.
- Name is persisted to `v1_user_profiles.display_name` when provided.
- Profile image is selected as one image, previewed in the form, and persisted to `v1_user_profiles.profile_image_url`.

## Progress Snapshot

- Added optional email signup and social signup fields in v1 web.
- Extended v1 auth register/social-profile DTOs and service persistence.
- Added `v1_user_profiles.birth_date` Prisma field and migration.
- Extended profile edit to update profile image, display name, nickname, email, bio, phone, and birth date with duplicate checks for changed nickname/email.
- Updated signup and profile edit birth date inputs to support both direct text entry and native date selection while preserving the existing `YYYYMMDD` API payload.
- Synced v1 profile/settings API docs.
- Latest verification: `pnpm --filter v1_web exec tsc --noEmit` passes; `pnpm --filter v1_web build` is blocked in the current shell because Node.js is `v18.19.1` and Next.js requires `>=20.9.0`.
