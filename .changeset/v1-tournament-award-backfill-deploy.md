---
"v1_api": patch
---

Move historical tournament-award recipient linking out of the additive schema migration and into an idempotent post-migrate CLI used by CI and deployment.
