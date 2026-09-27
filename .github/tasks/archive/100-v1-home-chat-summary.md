# Task 100 — V1 Home Chat Summary

## Scope

- Frontend: `apps/v1_web`

## Request

Expose chat-related content on the v1 home page body. Before this task, home only had a floating chat button, so chat was easy to miss when viewing the page.

## Acceptance Criteria

- Home shows a visible recent chat section in the main content.
- The section uses real `useV1ChatRooms()` data and links rows to `/chat/{roomId}`.
- Loading, error, signed-out, and empty states do not fake successful chat data.
- Existing floating chat entry remains available.

## Progress Snapshot

- Added home chat summary view model fields.
- Added recent chat section to the home body with unread counts and direct chat room links.
- Added a home smoke test assertion that the recent chat section is rendered.
- Verification: `pnpm --filter v1_web exec tsc --noEmit` passes. `pnpm --filter v1_web test -- src/app/home/page.test.tsx` is blocked by missing Rollup optional package `@rollup/rollup-linux-x64-gnu`; `pnpm --filter v1_web build` is blocked because the current shell uses Node.js `v18.19.1` and Next.js requires `>=20.9.0`.
