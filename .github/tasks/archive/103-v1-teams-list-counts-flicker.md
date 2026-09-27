# 103 - v1 teams list counts and flicker

## Scope

- Frontend: `apps/v1_web/src/components/teams/*`
- Route: `/teams`

## Issue

- `/teams` initially renders sample team data, then replaces it with API data, causing visible flicker.
- Sport chip counts do not change when filters/search are applied.
- Summary shows fixed sample copy `내 주변 7` even though the current `/teams` API does not return a nearby aggregate.

## Acceptance Criteria

- Initial API loading does not show sample team cards as real results.
- Sport chip counts are derived from the currently applied search/filter dataset where the frontend has data.
- Nearby count is not shown on the live list unless a real API-backed value exists.
- Existing `/teams` card layout and filter/search behavior remain intact.

## Progress Snapshot

- 2026-06-22: Frontend fix implemented. Backend aggregate contract intentionally not expanded in this scoped bug fix.
