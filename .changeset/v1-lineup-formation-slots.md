---
"v1_api": minor
"v1_web": minor
---

Replace auto-spread formation placement with slot-based lineup placement in both the team-match and tournament-fixture pitch editors.

Selecting a formation used to immediately scatter every starter across computed coordinates (`applyFormation`/`computeFormationPositions`), with no notion of which named position ("픽소", "피보", ...) each spot was. Selecting a formation now only reveals the formation's empty, labeled slots; tapping an empty slot opens a picker to fill it with a waiting player (`placeInSlot`/`unplaceFromSlot`), and `matchSlotsToEntries` matches by `positionCode` so a dragged token still counts its slot as filled.

Formation and position data has a single source of truth: the server's `lineupConfig` (positions + formations from `V1CompetitionConfigVersion.lineup`, T1-5), now attached to both the `GET /team-matches/:id/lineup` and `GET /games/:gameId` responses. The frontend no longer hardcodes any formation/position catalog (`FUTSAL_FORMATION_PRESETS`-style tables are gone) — `formation-slots.ts` only transforms whatever the server sends, and a headcount with no matching preset shows guidance text instead of hiding the section. If the selected formation stops matching the current headcount (e.g. a starter is removed), the editor now clears back to free placement instead of leaving a stale formation code in the save payload.

Also fixes a real bug: `toParticipantInput` (team-match save payload) was dropping `entry.position` before sending it to the server, so a player's placed position silently vanished on save even though the DTO supports it.
