---
"v1_api": patch
"v1_web": patch
---

Prune stale immutable release source directories after each successful alpha deploy. prepare_alpha_release_source() writes a full source-tree checkout under ALPHA_SOURCE_RELEASES_DIR for every deploy attempt (successful or failed), and nothing ever removed old ones, so disk usage grew without bound. Only the currently active and previous release directories are ever read again (by restore_active_release and rollback-alpha.sh), so everything else is now pruned right after state.json is promoted. Best-effort: a prune failure logs a warning but never fails an otherwise-healthy deploy.
