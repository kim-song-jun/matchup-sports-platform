# Task 146 — Tournament lineup goalkeeper required

Status: implementation complete; DB integration verification pending local Docker runtime
Target: v1 backend + v1 frontend + API docs

## Contract

- A tournament fixture lineup must contain exactly one starting goalkeeper.
- The goalkeeper is identified by the pinned competition config's `positions[].goalkeeper` code
  (`GK` for football, `GOLEIRO` for futsal), never by a hardcoded code.
- Save is blocked in the UI with an explicit reason until one goalkeeper is selected.
- Direct API writes with zero or multiple starting goalkeepers return
  `422 LINEUP_GOALKEEPER_INVALID`.
- Bench players do not count as a goalkeeper.

## Acceptance criteria

- [x] Frontend blocks save and submit without exactly one starting goalkeeper.
- [x] Backend accepts exactly one sport-specific goalkeeper and rejects zero/multiple.
- [x] Existing generic tournament-lineup fixtures carry a valid goalkeeper.
- [x] API docs describe the invariant.

## Validation

- v1 API and Web TypeScript checks: PASS
- DB integration scenario added; execution pending unavailable Docker QA runtime.
