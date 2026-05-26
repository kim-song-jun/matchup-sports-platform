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

## Progress Snapshot

- 2026-05-26: Started implementation after confirming Kakao Service user ID is the canonical per-app login identifier.
- 2026-05-26: Updated flow to `social_terms_required -> social_profile_required -> signup_done` with `/terms?mode=social`, `/signup/social`, and 24h server-side pending TTL.
- 2026-05-26: Fixed social next-route priority so Kakao sessions with both missing terms and missing profile go to `/terms?mode=social` before `/signup/social`.
