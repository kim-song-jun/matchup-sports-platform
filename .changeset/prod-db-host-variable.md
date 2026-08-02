---
'v1_api': patch
'v1_web': patch
---

Make the production database host configurable so the database can move off the instance. `DATABASE_URL` pointed at the `v1_postgres` container by name, which is fine while the database lives beside the app and impossible to change once it doesn't. The host is now `${V1_DB_HOST:-v1_postgres}`, so an unset variable resolves exactly as before — that default matters because `docker-compose.prod.yml` is also the base alpha loads, and a required-variable guard in this file has broken alpha once already.

The application's password is a separate variable from the container's. `V1_DB_PASSWORD` feeds `POSTGRES_PASSWORD` on the local `v1_postgres` service as well as the connection string, so pointing it at an RDS password would leave the already-initialised local container on its old credentials while the app tried the new ones — an authentication failure that looks like a database outage. `V1_DB_APP_PASSWORD` overrides only what the app connects with and falls back to the existing chain when unset. This is not hypothetical: the same collision was created and caught earlier the same day, when the RDS master password was written to the parameter path the deploy syncs into `.env`.

`deploy-prod.sh` skips starting the local Postgres and waiting on its readiness when `V1_DB_HOST` points elsewhere — waiting for a container the app will not talk to proves nothing. The service and its volume stay defined either way, because the rollback window needs the old data intact.

Verified with real `docker compose config`: unset variables reproduce today's connection string byte for byte, including under the alpha overlay; setting the two new variables moves the app to RDS while `POSTGRES_PASSWORD` on the local container stays unchanged.
