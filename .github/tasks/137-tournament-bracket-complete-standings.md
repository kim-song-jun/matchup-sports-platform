# Task 137 — Complete tournament bracket standings

## Scope

- Frontend: keep every assigned group team visible in the public bracket standings before and after results start arriving.
- Tests/docs: protect zero-match and partial-standing payloads without inventing match records.

## Acceptance Criteria

- [x] A group with no standings rows shows every assigned team with 0-0-0, 0 points, and 0 goal difference.
- [x] After one completed match, recorded standing rows retain every server-provided statistic.
- [x] Assigned teams missing from a partial standings payload remain visible with zero statistics.
- [x] Server positions remain authoritative; missing rows are appended deterministically without duplicating registrations.

## Progress Snapshot

- 2026-08-14: Root cause confirmed in `toGroupStandingsRows()`: the first standing row disabled the existing assigned-team fallback for the whole group.
- 2026-08-14: Public bracket rows now merge server standings with assigned teams by registration id; recorded statistics stay authoritative and only absent teams receive zero baselines.
- 2026-08-14: Focused Web regression suite passed 14/14, including explicit zero-match and partial-standing cases.
