# Task 116 - V1 upload static delivery rate-limit hotfix

## Scope

- Target: infra
- Runtime: `deploy/nginx.conf`

## Problem

The public `/v1/uploads/` static image route used the upload mutation limiter
(`10r/m`, burst `5`). Team list pages request multiple logos at once, causing
nginx to return HTTP 503 for otherwise healthy public image files.

## Acceptance Criteria

- [x] Public static image GET requests under `/v1/uploads/` are not throttled by
      the upload mutation limiter.
- [x] API upload rate limiting remains unchanged.
- [ ] Production nginx reload and anonymous/authenticated/admin team-list smoke
      verification are completed after deployment.

## Progress Snapshot

- 2026-07-18: Removed `limit_req zone=uploads burst=5 nodelay` from the public
  `/v1/uploads/` static route. The separate API upload limiter remains intact.
