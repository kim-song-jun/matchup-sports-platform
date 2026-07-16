# 85 — V1 Kakao Social Signup

## Scope

- Backend: `apps/v1_api` auth, Prisma schema/migration, focused tests.
- Frontend: `apps/v1_web` Kakao callback, social signup screen, API hook/types.

## Acceptance Criteria

- Kakao login identifies users by Kakao `/v2/user/me` top-level `id`, not email.
- Email signup still requires email/password.
- Kakao users can be created without Kakao email.
- First-time Kakao users enter Teameet nickname and gender, then continue to the existing sport/level/region onboarding.
- Existing Kakao users can log in again by the same provider user key.
- First-time social users accept Teameet terms before entering nickname and gender.
- Social signup screens do not expose a back button after the provider account has been bound.
- Expired incomplete social signup accounts are cleaned up on provider re-login.
- Social terms completion routes to `/signup/social`; nickname and gender completion routes to `/signup/complete`.
- `social_terms_required` and `social_profile_required` remain authenticated sessions, but they cannot access site routes or APIs outside the exact completion step, `GET /auth/me`, and logout.
- Pending social signup access failures use `403 SIGNUP_INCOMPLETE`, not the logged-out `401 UNAUTHENTICATED` contract.

## Progress Snapshot

- 2026-05-26: Started implementation after confirming Kakao Service user ID is the canonical per-app login identifier.
- 2026-05-26: Updated flow to `social_terms_required -> social_profile_required -> signup_done` with `/terms?mode=social`, `/signup/social`, and 24h server-side pending TTL.
- 2026-05-26: Fixed social next-route priority so Kakao sessions with both missing terms and missing profile go to `/terms?mode=social` before `/signup/social`.
- 2026-07-16: Restored the terms -> social profile -> signup complete route order after the required-gender change disconnected the frontend route. Added a global pending-social-session gate plus API guard enforcement so pending Kakao sessions stay authenticated but cannot use the site before `signup_done`.
- 2026-07-16: Fixed the pending social terms hard redirect to preserve the configured `/v1` basePath. Returning from the terms step and pressing Kakao again now resolves to `/v1/terms?mode=social` instead of the non-existent root `/terms?mode=social`.
- 2026-07-16 validation: the running v1 web server compiled and returned 200 for `/v1/terms?mode=social`; the focused diff check and touched-path debt-marker check passed. The added three-case `browserAppRoute` regression suite is committed but could not run because the current install has no Windows-resolvable Vitest binary and its pnpm shim calls unavailable `sh`.
- 2026-07-16 validation: pending access contract checks passed 6/6, changed TypeScript/TSX syntax checks passed 12/12, WSL pattern check passed, scoped `git diff --check` passed, touched paths contain no debt markers, and runtime smoke returned 200 for login, social terms, social profile, signup complete, and API health (5/5). Jest/Vitest and full typecheck remain runtime-blocked because the current dependency shims were installed with WSL absolute paths and hang under WSL while Windows cannot resolve their linked packages.

- 2026-07-16: Removed Kakao provider nickname ingestion and draft storage entirely. Teameet nickname now comes only from the required social signup nickname step; no `k_{providerUserKey}` fallback remains.
