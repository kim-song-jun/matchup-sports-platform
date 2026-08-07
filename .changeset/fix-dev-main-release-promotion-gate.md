---
'v1_api': patch
'v1_web': patch
---

Allow the canonical dev-to-main promotion PR to pass the release gate only after both fixed apps advance together, both changelogs are updated, pending Changesets are fully consumed, and the diff proves consumed release notes. Normalize workflow line endings so the production security guard enforces the same contract on Windows and CI.
