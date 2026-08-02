---
'v1_api': patch
'v1_web': patch
---

Wire the two root runtime secrets through the workflow so GitHub can be their single source. `DB_PASSWORD` and `JWT_SECRET` are the only variables the production compose file references without a default, and they were the ones missing from the synced runtime env on 2026-08-02 — the deploy died on a database authentication failure, which happened to mask the worse outcome, since the same two feed `${V1_JWT_SECRET:-${JWT_SECRET}}` and `V1_SESSION_SECRET`. They currently live only in Parameter Store, so rotating them means touching two places and losing them there leaves nothing to restore from.

Declaring them in the `Sync runtime env` step is safe before the repository secrets exist: the sync script skips empty values rather than writing them, so the existing Parameter Store entries survive untouched. Registering the two secrets is what flips GitHub into being the source of truth — until then nothing changes.

The deploy security guard now also fails when the compose file gains a default-less variable that no `SECRET_*` entry feeds, catching at review time what `deploy-prod.sh`'s runtime preflight only catches once a deploy is already running. It reads variables inside nested defaults, since that inner reference is what actually resolves to a blank, and exempts `V1_API_IMAGE` / `V1_WEB_IMAGE`, which the release manifest supplies and validates as ECR digests.
