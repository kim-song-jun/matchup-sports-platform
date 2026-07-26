# 85 — V1 Kakao Social Signup

> Superseded on 2026-07-14 by Task 94 for the first-profile field contract. Kakao identity, terms ordering, provider binding, and pending-account cleanup remain valid here; the current social profile boundary requires display name, phone, birth date, and gender, with an optional profile image.

## Scope

- Backend: `apps/v1_api` auth, Prisma schema/migration, focused tests.
- Frontend: `apps/v1_web` Kakao callback, social signup screen, API hook/types.

## Acceptance Criteria

- Kakao login identifies users by Kakao `/v2/user/me` top-level `id`, not email.
- Email signup still requires email/password.
- Kakao users can be created without Kakao email.
- First-time Kakao users enter Teameet display name, phone, birth date, and gender, then continue to the existing sport/level/region onboarding. Profile image is optional.
- Existing Kakao users can log in again by the same provider user key.
- First-time social users accept Teameet terms before entering the required profile fields defined by Task 94.
- Social signup screens do not expose a back button after the provider account has been bound.
- Expired incomplete social signup accounts are cleaned up on provider re-login.
- Social terms completion routes to `/signup/social`; nickname and gender completion routes to `/signup/complete`.
- `social_terms_required` and `social_profile_required` remain authenticated sessions, but they cannot access site routes or APIs outside the exact completion step, `GET /auth/me`, and logout.
- Pending social signup access failures use `403 SIGNUP_INCOMPLETE`, not the logged-out `401 UNAUTHENTICATED` contract.

## Progress Snapshot

- 2026-05-26: Started implementation after confirming Kakao Service user ID is the canonical per-app login identifier.
- 2026-05-26: Updated flow to `social_terms_required -> social_profile_required -> signup_done` with `/terms?mode=social`, `/signup/social`, and 24h server-side pending TTL.
- 2026-05-26: Fixed social next-route priority so Kakao sessions with both missing terms and missing profile go to `/terms?mode=social` before `/signup/social`.
- 2026-07-14: Task 94 superseded the old nickname/gender-only profile boundary; the shared email/social required-profile DTO and Web validation now own the current contract.
- 2026-07-16: Restored the terms -> social profile -> signup complete route order after the required-gender change disconnected the frontend route. Added a global pending-social-session gate plus API guard enforcement so pending Kakao sessions stay authenticated but cannot use the site before `signup_done`.
- 2026-07-16: Removed Kakao provider nickname ingestion and draft storage entirely. Teameet nickname now comes only from the required social signup nickname step; no `k_{providerUserKey}` fallback remains.
- 2026-07-18: Canonical browser routes remain root-based. Pending social signup resumes `/terms?mode=social` and `/signup/social`; the removed `/v1` browser alias is not restored.
