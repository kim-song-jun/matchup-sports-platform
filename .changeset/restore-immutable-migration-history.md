---
"v1_api": patch
"v1_web": patch
---

Restore original SQL for 5 already-deployed tournament migrations that a checkpoint commit had retroactively rewritten with IF NOT EXISTS guards, unblocking the alpha rollback-compatibility gate.
