---
"v1_api": patch
"v1_web": patch
---

Fix restore_legacy_runtime's post-rollback header verification, which used a grep pattern with a literal backslash-r that the instance's GNU grep does not treat as carriage return (warns "stray \ before r" and never matches). Rewritten to use the same awk-based header extraction already used correctly elsewhere in this file, so a legitimate rollback no longer logs a false CRITICAL failure.
