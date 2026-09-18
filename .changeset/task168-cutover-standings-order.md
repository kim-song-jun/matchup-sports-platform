---
"v1_api": patch
---

Task 168 historical cutover now defers standings projection until every imported
historical result has its canonical game and official projection. This keeps the
standings calculation from observing a partially imported sibling set.

Source cutover also preserves existing game-side teams when registration is
unassigned, using the same conflict-checking team resolver as backfill.
