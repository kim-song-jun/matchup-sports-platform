# 125 V1 Team Logo Presets

## Scope

- Frontend: `apps/v1_web`
- Backend contract verification: `apps/v1_api/src/teams`
- Assets: user-provided `team_logo/*.png` promoted into the v1 web public assets

## Goal

Offer ten bundled team-logo presets while preserving custom image uploads and the existing identicon failure fallback.

## Owned Files

- `.github/tasks/125-v1-team-logo-presets.md`
- `apps/v1_web/public/images/team-logos/**`
- `apps/v1_web/src/lib/team-logo-presets.ts`
- `apps/v1_web/src/components/teams/teams-form-client.tsx`
- `apps/v1_web/src/components/teams/teams-page.tsx`
- Related narrow tests and team CSS

## Forbidden Files

- Existing managed-terms work in `apps/v1_api/prisma/schema.prisma`, `apps/v1_api/src/terms/**`, and Task 124 files
- Legacy `apps/api` and `apps/web`

## Acceptance Criteria

- Team create selects one of ten bundled presets once per form session.
- Users can select any preset or upload a custom image.
- Team edit hydrates and preserves the saved logo until the user changes it.
- The selected preset or upload URL is submitted as `logoUrl` and reaches the Prisma team-profile create/update contract.
- Broken or absent image URLs still fall back to `TeamAvatar` identicon rendering.
- Desktop, tablet, and mobile layouts remain usable.

## Ambiguity Log

- No image-source column is added: preset and upload images continue to share the existing `logoUrl` contract.
- Existing teams with `logoUrl = null` are not silently modified.

## Progress Snapshot

- 2026-07-22: Confirmed ten user-provided opaque PNG files at 1254x1254 (21.14 MB total) under `team_logo/`.
- 2026-07-22: Started v1 asset optimization, preset selection UI, and create/update persistence verification.
- 2026-07-22: Optimized ten source PNGs into 512px public JPEG assets (482,048 bytes total) and added the preset catalog.
- 2026-07-22: Added create-only random initialization plus a responsive ten-preset/custom-upload selector shared by create and edit.
- 2026-07-22: Web targeted tests passed (3 files, 20 tests); team service unit passed (74 tests).
- 2026-07-22: Live v1 API DB proof passed on QA owner team 00000000-0000-4000-8000-000000000101: preset URL write/read matched and the original logo URL was restored.
- 2026-07-22: Isolated DB integration spec was added, but its local run was blocked before setup because the approved integration DATABASE_URL is absent.
- 2026-07-22: Headed visual QA reached the protected route but was redirected to login because the current API has no dev-login route; diagnostic evidence is under output/playwright/visual-audit/task-125-team-logo-presets/.
- 2026-07-22: Full web typecheck remains blocked by unrelated managed-terms route generation and an existing use-v1-api.ts query-param type error.
- 2026-07-22: Removed the user-facing null-logo action; identicon now remains an internal fallback only for legacy null values and image load failures.
