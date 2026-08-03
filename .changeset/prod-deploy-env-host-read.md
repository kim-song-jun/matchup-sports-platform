---
'v1_api': patch
'v1_web': patch
---

Read `V1_DB_HOST` from the runtime `.env` in `deploy-prod.sh`, and add a CI guard for the whole class of mistake.

Removing `source` from the deploy script meant every value the shell needs now has to be read explicitly through `env_value()`. `V1_DB_HOST` was not, so the shell variable was always unset and `${V1_DB_HOST:-v1_postgres}` always resolved to the default — the branch that skips starting the local Postgres when the database lives on RDS could never run. Reproduced on 2026-08-03: with `.env` containing an RDS endpoint, the logic still selected the local path. Found by a Copilot review on the promotion PR, not by us.

That defect only shows up after the cutover, which is exactly when nobody would be looking: the app would correctly reach RDS through Compose's `--env-file` while the deploy kept starting and waiting on an unused container, on a 2GB instance whose memory pressure was one of the reasons for moving to RDS in the first place. Once the `v1_postgres` service is eventually removed from the compose file, the same line breaks the deploy outright.

This is the third guard in this deploy path that reported success on the situation it existed to catch — after the file-wide credentials grep and the compose preflight that swallowed its own exit status. Three is enough to stop fixing them one at a time, so `findUnreadRuntimeEnvVariables()` now fails CI when `deploy-prod.sh` references a `V1_*` variable it never reads (the manifest-provided image URIs excepted). It was verified against its own negative control before being committed: the pre-fix file is rejected with the exact message, the fixed file passes, and the accompanying tests cover detection, the env_value case, manifest variables, comment false-positives, and the real script.
