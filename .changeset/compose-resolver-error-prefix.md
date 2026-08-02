---
'v1_api': patch
'v1_web': patch
---

Name the failing script in the Compose resolver's error message. `resolve_compose_binary()` lives in a file both `deploy-prod.sh` and `rollback-prod.sh` source, but its failure line was hardcoded to `[prod-deploy]`, so a rollback that could not find a working Compose form reported itself as a deploy failure. That is exactly the case an operator most needs to read correctly — the run that prompted this helper failed on both paths at once, and the log gave no way to tell them apart. The prefix now expands to the calling script's own name, which resolves to `[deploy-prod.sh]` or `[rollback-prod.sh]` respectively.
