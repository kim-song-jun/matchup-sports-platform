# Task 113 — V1 upload volume permission recovery

## Scope

- Target: infra
- Runtime: `deploy/docker-compose.prod.yml`, `deploy/restart-containers.sh`
- Documentation: `docs/security/v1-deploy-security-hardening.md`

## Problem

The production `v1_api` container runs as UID/GID `1001`, while an existing
`v1_uploads_data` volume or files restored with `docker cp` can remain owned by
root. Multer writes its temporary upload directly under
`/app/apps/v1_api/uploads`, so the mismatch surfaces as HTTP 500 before the
upload service can validate or move the file.

## Acceptance Criteria

- [x] A one-shot Compose service repairs the upload volume to UID/GID `1001`.
- [x] `v1_api` waits for that repair during normal Compose startup.
- [x] The canonical restart script repairs permissions before startup and again
      after restoring the upload backup.
- [x] The production runbook documents diagnosis, immediate recovery, and the
      automated prevention path.
- [x] Compose rendering and shell syntax validation pass where tooling is
      available.

## Progress Snapshot

- 2026-07-18: Root cause traced to the 2026-07-11 non-root container change and
  the root-owned persistent/restore path. Added `v1_uploads_init`, wired it into
  normal startup and backup restore, and passed Compose rendering, `bash -n`,
  and `git diff --check`. Production permission and authenticated upload checks
  remain deployment-time verification.
