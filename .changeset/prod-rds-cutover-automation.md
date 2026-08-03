---
'v1_api': patch
'v1_web': patch
---

Add the unattended container-Postgres → RDS cutover, scheduled for 04:07 KST on 2026-08-04.

`deploy/cutover-to-rds.sh` runs the whole window: preflight, maintenance page, app stop, final dump, restore into RDS, per-table row comparison, `.env` switch, restart, health verification, maintenance off. Every failure after the maintenance page opens rolls back automatically — the container Postgres is never stopped and its volume is never touched, so rolling back is only restoring the `.env` snapshot and restarting the apps.

A `--rehearse` mode does the dump, restore into a throwaway `teameet_v1_rehearsal` database, and the row comparison without touching `.env`, compose, the apps, or the maintenance page. It was run three times against production on 2026-08-03; the first two failures are the reason this changeset exists.

The first rehearsal failed on `elasticloadbalancing:DescribeLoadBalancers`. Every maintenance-window command so far had been issued from an operator's laptop, so nobody had noticed that the instance role holds no ELB permissions at all — an unattended run has to open its own maintenance window. Added as inline policy `TeameetProdMaintenanceWindow`, with `ModifyRule` scoped to the single default-rule ARN and nothing else; S3 was deliberately left alone by writing cutover artifacts under the existing `pg/*` grant instead of widening it.

The second failure was worse. `V1_API_IMAGE`/`V1_WEB_IMAGE` do not live in `.env` — `load_prod_release_manifest` exports them, and `/etc/sudoers` has `env_reset` so the compose array also needs `--preserve-env`. Without both, `compose up` resolves the image names to empty strings. The cutover would have stopped the apps at 4am and then been unable to start them again, and the rollback path uses the same compose array, so it would have failed identically: a full outage with nobody watching. Neither defect was visible by reading the script.

`ExecStopPost` runs `deploy/cutover-guard.sh` whichever way the service ends. The ERR trap only fires while the shell is alive, so a `TimeoutStartSec` kill or an OOM would otherwise leave the maintenance page up until morning. The guard turns it off, restores the app if it is unhealthy, and publishes to SNS.

Also fixes `deploy/backup-prod-db.sh`, which had been exiting 1 every night since the legacy stack was stopped: `docker inspect` succeeds on a stopped container, so the failure surfaced at `docker exec`, and the non-zero exit meant the success heartbeat was never published even though the v1 dump had uploaded fine. Backups were working and the monitoring said otherwise. A stopped database cannot drift, so it is now skipped explicitly; a dump that fails while the container is running still fails the run.
