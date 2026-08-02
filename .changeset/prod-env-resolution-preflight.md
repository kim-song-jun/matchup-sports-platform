---
'v1_api': patch
'v1_web': patch
---

Stop the production deploy when a Compose variable would resolve to an empty string. Compose substitutes a blank for any variable it cannot find and only emits a warning, so a runtime `.env` that is missing keys still deploys. That is what happened on 2026-08-02: `DB_PASSWORD` and `JWT_SECRET` were absent from the synced runtime env, and the run died on `P1000: Authentication failed against database server`. The database error was the lucky outcome — the same two blanks feed `JWT_SECRET: ${V1_JWT_SECRET:-${JWT_SECRET}}` and `V1_SESSION_SECRET`, so without it the API would have gone live with an empty JWT signing key and an empty session secret.

`assert_compose_variables_resolve()` asks Compose itself via `config` and aborts on any "variable is not set" warning, rather than reimplementing the substitution rules and drifting from them. Deploy checks right after the compose array is built; rollback checks after the manifest loads, since that is what exports `V1_API_IMAGE` / `V1_WEB_IMAGE`. Both abort before a single container is touched — a rollback that restores service with blank secrets is no better than a failed deploy.
