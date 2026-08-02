---
'v1_api': patch
'v1_web': patch
---

Give production a backup. Until now it had none — a survey on 2026-08-02 found zero EBS snapshots, no `crontab` installed at all, and no backup directory, which meant losing the instance or its volume would have lost the data with it. The database is small enough (24MB for v1, 43MB for the legacy stack) that a full nightly dump costs almost nothing.

`deploy/backup-prod-db.sh` dumps each database, gzips it, and uploads to a versioned, encrypted S3 bucket under `pg/<label>/<date>/`, authenticating through the instance role so no credentials sit on disk. It refuses to upload a dump smaller than 1KB and fails instead: an empty backup that uploads cleanly is only discovered when someone tries to restore from it. The systemd units run it daily at 02:30 KST — systemd rather than cron because this host has no `crontab` binary — and `Persistent=true` makes a missed window run at next boot rather than silently skipping a day.

That pairs with a DLM policy taking daily EBS snapshots at 03:00 KST with 7-day retention. The dump runs half an hour earlier on purpose, so each snapshot contains that night's dump. The two cover different failures: snapshots restore a whole volume but cannot roll back a single table and cannot follow the data to RDS, while dumps do both and cannot restore nginx config or certificates.

`docs/ops/prod-backup.md` documents the restore procedure for both paths and records what is still missing — for example, the first scheduled systemd timer run (02:30 KST) may not have been observed yet depending on when the change was deployed.
