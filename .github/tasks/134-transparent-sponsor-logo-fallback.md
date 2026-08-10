# Task 134 — Transparent sponsor logo fallback overlap

## Problem

The public tournament sponsor card always rendered the sponsor initials underneath the logo
image. Transparent PNG/WebP logos therefore exposed the fallback letters through their transparent
pixels.

## Scope

- Public tournament sponsor card rendering
- Focused component regression coverage
- Preserve the already-implemented group fixture date/time and explicit `시간 미정` contract with focused regression coverage
- No API, database, upload, or layout changes

## Acceptance Criteria

- [x] A sponsor with a logo does not render initials underneath it.
- [x] A sponsor without a logo still renders initials.
- [x] The logo keeps its original aspect ratio and fits its longer side inside the square frame.
- [x] Group fixture cards continue to show date/time and an explicit undetermined-time state.
- [x] Focused component tests pass.

## Progress Snapshot

- 2026-08-11: Conditional fallback rendering implemented and public sponsor logos changed from
  crop (`cover`) to long-side fit (`contain`) inside the square frame. Focused Vitest result:
  2 files, 4 tests passed, including the existing group fixture schedule contract already merged
  to `dev` by commit `c86837ec`.
