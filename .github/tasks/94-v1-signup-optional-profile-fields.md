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
- Name is persisted to private `v1_user_profiles.real_name` when provided; public identity remains `nickname`.
- Profile image is selected as one image, previewed in the form, and persisted to `v1_user_profiles.profile_image_url`.
## 2026-07-16 Follow-up — Public Nickname And Creator Profile Gate

- Kakao and email signup require nickname and gender, but do not synthesize or require a real name.
- Kakao provider metadata must not generate a `k_{providerUserKey}` Teameet nickname.
- `nickname` is the public identity. A separately entered `realName` is private profile data.
- `/my/profile/edit` manages profile image, real name, nickname, email, phone, birth date, and gender.
- Real name and phone remain optional when saving a profile. Nickname and gender remain required.
- Creating an individual match, team, or team match requires real name, phone, and gender.
- Applying to a match/team/team-match, accepting invitations, chat, reviews, inquiries, and existing-entity management remain available without real name or phone.
- Incomplete creator profile failures use `PROFILE_COMPLETION_REQUIRED` with an explicit `missingFields` array.
- Public/member/chat presentation uses nickname and does not expose real name.

### Owned scope

- `apps/v1_api/prisma/schema.prisma` and one additive migration
- `apps/v1_api/src/auth/**`, `apps/v1_api/src/profile/**`
- Creation entry points in `matches`, `teams`, and `team-matches`
- `apps/v1_web` signup/profile edit contracts and profile completion error handling
- Related v1 API docs, fixtures, and focused tests

### Progress Snapshot

- 2026-07-16: Follow-up scope confirmed. Chat workspace and team-chat auto-participation are already complete and are excluded except for nickname-only regression verification.

## Progress Snapshot

- Added optional email signup and social signup fields in v1 web.
- Extended v1 auth register/social-profile DTOs and service persistence.
- Added `v1_user_profiles.birth_date` Prisma field and migration.
- Extended profile edit to update profile image, real name, nickname, email, phone, birth date, and gender with duplicate checks for changed nickname/email.
- Updated signup and profile edit birth date inputs to support both direct text entry and native date selection while preserving the existing `YYYYMMDD` API payload.
- Synced v1 profile/settings API docs.
- Latest verification: `pnpm --filter v1_web exec tsc --noEmit` passes; `pnpm --filter v1_web build` is blocked in the current shell because Node.js is `v18.19.1` and Next.js requires `>=20.9.0`.

### 2026-07-16 Implementation Snapshot

- [x] Added additive `v1_user_profiles.real_name` schema field and migration without legacy display-name backfill.
- [x] Removed Kakao provider nickname parsing, draft persistence, and `k_{providerUserKey}` fallback.
- [x] Kept signup lightweight: nickname and gender are required; real name, phone, birth date, and profile image remain optional.
- [x] Made `/my/profile/edit` the canonical editor for profile image, real name, nickname, email, phone, birth date, and gender. Social-account email can be edited or cleared without changing the Kakao provider key.
- [x] Added the shared creator-profile guard to personal match, team, and team-match creation only.
- [x] Added accessible profile-completion prompts with safe return routes to the three creation clients.
- [x] Switched public identity presentation to nickname-first and kept private real name out of public/chat output.
- [x] Synced Prisma seed coverage, focused DTO/guard/frontend helper tests, fixtures, and v1 API docs.
- Validation: changed TypeScript/TSX syntax transpile passed 22/22 and scoped `git diff --check` passed. Jest, Vitest, Prisma generate, full typecheck/build, and visual QA are blocked by the current broken pnpm-linked install (`prisma` shim missing; Jest `import-local` and Vitest `@vitest/utils` links unresolved). Runtime smoke returned 200 for `/v1/home`, `/v1/my/profile/edit`, `/v1/matches/new/confirm`, and API health, but Playwright cannot start because the installed `playwright` package link is unresolved, so authenticated responsive screenshot evidence remains blocked.- 2026-07-16 runtime correction: A user without `realName` and phone could still create a team because the running Docker API process predated the controller guard and the v1 dev command is not watch-based. Added the same assertion at the service-layer create entry for personal matches, teams, and team matches; targeted backend verification passed 5 suites / 84 tests. Applied the additive schema with `prisma db push`, restarted `v1_api`, and confirmed a newly registered user with `realName=null` and `phone=null` receives HTTP 422 on `POST /api/v1/teams`. The QA account was admin-deleted after verification.
- 2026-07-16 merge-readiness: added rolling-deploy compatibility for deprecated `displayName` request payloads while keeping `realName` canonical; fixed seed type safety. API typecheck/build and 512 tests pass; Web typecheck/production build/pattern check and 113 tests pass; Prisma validate/generate and DB guardrails pass.
