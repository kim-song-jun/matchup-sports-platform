# Task 125 — Upload asset reference lifecycle

## Decision

- Selected: **B — asset references + unreferenced owner deletion**
- Target: v1 `dev` and alpha data only
- Excluded: `main` merge, production data deletion, broad seed/reset, deletion
  of any pre-existing production-derived asset
- Tier: HEAVY — adds a DB model/migration and an authenticated destructive API.

## Security patch contract

- Vulnerable path: an authenticated upload creates a retained file and
  `v1_upload_assets` ledger row, but there is no owner cleanup API. Restoring an
  entity URL leaves quota and storage permanently consumed.
- Attacker-controlled input: authenticated asset ID and existing public upload
  URLs.
- Invariant: only the ledger owner may delete an asset, and only while its
  authoritative active reference count is zero. Reference creation and delete
  eligibility must serialize on the asset row.
- Legitimate behavior to preserve: current image/video upload limits, MIME and
  signature checks, root-relative URLs, external/non-ledger URLs, existing
  entity update authorization, and all referenced files remaining available.
- Enforcement boundary: a database-backed reference registry maintained in
  the same entity transaction (or an equivalent database trigger), plus an
  authenticated upload asset deletion service that moves the file out of the
  public path before final ledger removal.

## Reference scope

Root-relative URLs present in the upload ledger are tracked from:

- user profile image
- match and team-match image
- team logo and cover
- tournament cover, home promo, and list promo
- tournament campaign hero/highlights JSON
- tournament review photo array
- tournament sponsor logo
- tournament popup image
- tournament fixture video

External URLs and historical audit JSON are not active asset references.

## Failing-first scenarios

### UPLOAD-RED-001 — referenced owner delete is blocked

Test: real PostgreSQL integration creates an owned upload asset, writes an
entity URL that registers a reference, then calls the authenticated delete
boundary.

RED observable: no route/reference registry exists. GREEN observable: response
is `409 UPLOAD_ASSET_IN_USE`, file and ledger remain, and reference metadata is
reported without leaking another owner's data.

### UPLOAD-RED-002 — unreferenced owner delete completes

Test: create a valid owned file and ledger row with zero references, call
delete once, and call it again.

PASS observable: first call removes public availability, physical file, and
ledger entry; retry has deterministic not-found semantics and quota no longer
includes the deleted/tombstoned asset.

### UPLOAD-ADVERSARIAL-001 — non-owner delete

Test: a second authenticated user submits the first user's asset ID.

PASS observable: fail-closed not-found/permission response, no file move, no
ledger mutation, no reference disclosure.

### UPLOAD-RACE-001 — reference/delete serialization

Test: concurrent reference registration and deletion target the same asset.

PASS observable: exactly one valid terminal state exists — referenced +
retained, or unreferenced + deleted — never a dangling entity URL.

### UPLOAD-SURFACE-001 — reversible alpha profile cleanup

Action: upload a real image as the alpha ordinary user, bind it to the profile,
restore the original URL, then delete the returned asset ID through the owner
API.

PASS observable: profile reflects the original image, delete succeeds only
after detachment, the upload URL returns 404, and no production row/file is
touched.

## Migration rules

- Additive schema first; no production row deletion.
- Backfill only references whose URL exactly matches an existing
  `v1_upload_assets.url` row.
- Missing-ledger legacy URLs remain untouched and are not made deletable.
- Deletion state must be recoverable if filesystem removal or DB finalization
  fails; no silent orphan success.

## Owned files

- `apps/v1_api/prisma/schema.prisma` and one additive migration
- `apps/v1_api/src/uploads/**`
- focused real PostgreSQL integration coverage and upload unit/controller tests
- upload API documentation under `docs/api/`
- compatible frontend upload result/delete hook types if needed
- Task 122/profile scenario cleanup contract and this task/Changeset

## Progress snapshot

- 2026-07-19: Decision B approved. Current ledger, upload service, consumer URL
  fields, and missing delete route confirmed. Reference scope additionally
  includes tournament review photo arrays discovered in the current schema.

