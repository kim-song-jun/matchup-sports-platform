---
'v1_api': patch
'v1_web': patch
---

Unblock production deploys. The release-tag pruner filtered `:latest` out with `grep -v`, which exits 1 when nothing is left to print, and the remote deploy script runs under `set -euo pipefail` — so the perfectly normal state of having no stale tags aborted the whole deploy. Worse, it could not recover on its own: the build never ran, so SHA tags were never created, so every subsequent production deploy died at the same line. Replaced with an awk filter that returns 0 on no match, moved the function into `deploy/prod-release-common.sh` so it can actually be called by a test, and wired that test into the Gates job that runs on every push.
