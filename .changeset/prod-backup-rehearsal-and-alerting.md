---
'v1_api': patch
'v1_web': patch
---

Prove the backups restore, and notice when one stops arriving. A backup nobody has restored from is a guess — dumps fail at restore time for reasons a file listing never shows: a missing role, an absent extension, an ordering dependency. `verify-prod-backup-restore.sh` restores the latest dump into a throwaway Postgres container, never the live one, reports table, row, foreign key and index counts, and removes the container and its volume on the way out. `psql` runs with `ON_ERROR_STOP=1`, because the default keeps going after an error and would report a half-restored database as a success. The first run came back with 72 tables, 10,716 rows, 120 foreign keys and 278 indexes, no SQL errors.

Running it needs S3 read, which the instance role deliberately does not have — it holds `PutObject` only, so a compromised host can neither read nor delete the backups. Read is granted as a temporary inline policy for the rehearsal and revoked afterwards, which keeps that property intact.

The backup script now publishes a CloudWatch heartbeat, and only on success. The alarm treats missing data as breaching, so it fires whether the script failed, the timer never ran, or the instance was down. Publishing a zero on failure would have stayed silent in exactly the case that matters most — when the script never executes at all.

`docs/ops/rds-migration-design.md` records the plan to move the database off the instance, written against measured state rather than assumption: 24MB across 72 tables, a default VPC with no private subnets, an unencrypted root volume, and a deploy that recreates the Postgres container on every run.
