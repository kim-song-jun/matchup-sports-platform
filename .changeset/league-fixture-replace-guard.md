---
"v1_api": patch
---

Reject league fixture regeneration when a fixture still has a game attached, instead of failing with a 500. `V1Game.tournamentFixtureId` uses `onDelete: Restrict`, so deleting such a fixture aborts the whole transaction with a foreign-key violation — surfaced on alpha as an opaque internal error. The restriction exists to protect lineups, events and result revisions, so the guard now refuses up front and names what has to be cleared first.
