---
"v1_api": patch
"v1_web": patch
---

Wire scripts/qa/test-alpha-release-state.sh into the Gates CI job. This suite existed but was never run in CI, matching the same "untested contract" pattern behind several bugs found and fixed today in the alpha immutable-release pipeline (certbot migration permission, health contract assertion, source-directory pruning).
