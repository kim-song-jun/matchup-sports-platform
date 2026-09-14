# Task 168 Stage B runbook (M11 final retirement)

Operator reference for the Stage B dispatch path (`deploy-alpha-stage-b.sh`,
`task168-stage-b-migrate.sh`) that applies M11 (the final tournament-fixture
retirement migration) to Alpha and retires the legacy physical schema. This
is the durable reference the scripts' own error messages point to; keep it in
sync with the scripts when either changes.

## Receipt vocabulary

| Receipt / marker | Written by | Meaning |
|---|---|---|
| `quiesce-intent.json` | runner, before any writer is touched | identifies which containers are about to be quiesced |
| `quiesce.json` | runner, after the pre-M11 backup completes | quiesce is complete: writers stopped, restart disabled, backup hash recorded |
| `m11-entry-marker.json` (status `ENTERED`) | runner, immediately before the M11 `migrate deploy` exec | this release is about to cross into the irreversible phase |
| `migration-stage.json` (status `MIGRATION_COMMITTED`) | runner, after M11 commits and every post-M11 check passes | the normal success receipt |
| `migration-stage.json` (status `MIGRATION_DIAGNOSIS_REQUIRED`) | runner's EXIT trap, on any after-M11 failure except a deferred-signal-on-an-already-committed-M11 | a real failure occurred after M11 started; requires manual diagnosis before any further Stage B attempt |
| `migration-stage.json` (status `MIGRATION_COMMITTED_RECOVERED`) | `stageBRecover`'s R-A branch | a reconstructed success receipt for a run that committed M11 but never got to write its own receipt (signal landed after commit) |
| `migration-stage.json.recover-diagnosis.json` | `stageBRecover`'s R-C branch | M11 has an unresolved (P3009) migration attempt; not auto-recoverable |
| `quiesce.json` | runner | also the source `deploy-alpha-stage-b.sh` reads `restartPolicyBefore.api`/`.worker` from when restoring writer restart policy after final-runtime activation (below) |
| `runtime-verification.json` (`kind: task168StageBRuntimeVerification`) | T7 (`scripts/release/task168-stage-b-post-live-verify.sh`), only once every check passes | binds the migration receipt and manifest hashes; required by `assert_stage_b_promotion_receipt` before a StageB candidate can be promoted |
| `activation-stage.json` (status `ACTIVATION_DIAGNOSIS_REQUIRED`) | `deploy-alpha-stage-b.sh`'s post-commit activation code, on any failure after MIGRATION_COMMITTED | names the failed step (`load-manifest`, `source-runtime-env`, `activate-source`, `pull-images`, `write-metadata`, `compose-up`, `restore-restart-policy`, `wait-worker-healthy`, `post-live-verify`, or `promote`) and the reason; see "Post-commit activation failure" below |

## Post-commit activation (U2 = continue automatically)

Once the runner reports `MIGRATION_COMMITTED`, `deploy-alpha-stage-b.sh` continues in the same
run: it activates the final release source, pulls and composes up the final images
(`v1_api`/`v1_web`/`v1_game_operations_worker`, then `nginx`), restores `v1_api`'s and
`v1_game_operations_worker`'s restart policy from `quiesce.json`'s `restartPolicyBefore` (never
hardcoded — compose's own static `restart: always` would otherwise silently override whatever
policy was actually in effect before quiesce; `v1_web` was never quiesced, so it keeps compose's
default), waits for the worker healthcheck, runs T7
(`scripts/release/task168-stage-b-post-live-verify.sh`), and — only once T7 writes
`runtime-verification.json` — promotes the candidate manifest to active
(`write_candidate_manifest` + `promote_candidate_manifest`, gated by
`assert_stage_b_promotion_receipt`).

### Post-commit activation failure

The database is irreversibly post-M11 from the moment the runner commits M11, so **nothing in
this phase ever restores predecessor images** — there is no rollback path once M11 has
committed. Any failure writes `activation-stage.json` naming the failed step and exits non-zero,
leaving the runtime exactly as the failure left it (a service may be down, on the old writer's
restart policy, or serving the final image without having passed T7 yet).

**This is currently a single-attempt activation with no automated retry entry point.**
Re-dispatching `stageBFinal` for the same release is refused by the runner itself once
`migration-stage.json` exists ("final retirement receipt already exists"), and `stageBRecover`'s
R-A branch also refuses to touch a release once `migration-stage.json` exists (R-A/R-B semantics
are unchanged by this section — they still judge purely from the ledger and the migration
receipt, never from `activation-stage.json`). Recovering from a failed activation is a **manual
procedure**:

1. Read `activation-stage.json` for the failed step and reason.
2. Confirm live state by hand (`docker compose ... ps`, `docker inspect`, the ledger) rather than
   trusting the step name alone — the failure may have left a partially-recreated runtime.
3. Re-run by hand only the remaining steps from the failed one onward, using the same primitives
   `deploy-alpha-stage-b.sh` uses (`activate_alpha_release_source`, `pull_release_images`,
   `write_release_metadata`, the `docker compose up -d --force-recreate` calls, `docker update
   --restart=` from `quiesce.json`'s recorded values, then
   `scripts/release/task168-stage-b-post-live-verify.sh`, then `write_candidate_manifest` +
   `promote_candidate_manifest`) — all under the same `direct user approval` rule as every other
   Alpha runtime/data change.
4. A future `stageBResume` entry point that automates this retry is out of scope here and was not
   guessed at — see the changeset for this change.

A `MIGRATION_COMMITTED_RECOVERED` receipt is deliberately never written with
the same status as an original `MIGRATION_COMMITTED` one — collapsing the two
would erase the fact that the run needed reconstruction from the audit trail.

## Receipt contract (authoritative — any other consumer must align to this)

Both receipts below live in the **same per-release state directory**:

```
<ALPHA_RELEASE_STATE_DIR>/task168/<releaseSha>/migration-stage.json
<ALPHA_RELEASE_STATE_DIR>/task168/<releaseSha>/runtime-verification.json
```

`<ALPHA_RELEASE_STATE_DIR>` defaults to `/home/ec2-user/.teameet-alpha-releases`
(the wrapper falls back to `${ALPHA_HOME_DIR}/.teameet-alpha-releases`, which is
the same path in real production since `ALPHA_HOME_DIR` is always
`/home/ec2-user` there). There is **no flat, non-per-release path** for either
receipt — a consumer that reads `<state-dir>/task168-final/...` or any other
shape is reading a path this contract does not produce.

### `migration-stage.json` (`kind: "task168StageBMigration"`)

Written by the runner (`deploy/task168-stage-b-migrate.sh`) once M11 commits and
every post-M11 check passes. Full field set on success:

```
schemaVersion (1), kind ("task168StageBMigration"), status ("MIGRATION_COMMITTED"),
stage ("stageBFinal"), releaseSha, apiImage, databaseIdentity, schemaSha256,
manifest, manifestSha256,
rehearsal: { mode, reason, decidedAt } (copied verbatim from the manifest's
`database.task168.rehearsal` — 2026-09-14: no isolated T5 rehearsal is wired
into this pipeline, so the only supported mode is `"waived"`; the runner
refuses to proceed on anything else),
predecessorStageAReleaseSha, predecessorTransition, predecessorTransitionSha256,
quiesceReceipt, quiesceReceiptSha256,
preM11Backup, preM11BackupSha256, preM11BackupBytes, backupFormat,
m11, m11Sha256, ledger (free-text string),
postVerification: { legacyTables, legacyLinkColumns, retirementTriggers, retirementFunctions, processingOutbox },
completedAt
```

The `MIGRATION_COMMITTED_RECOVERED` variant (`stageBRecover`'s R-A branch,
`deploy/deploy-alpha-stage-b.sh`) carries a different, smaller field set —
see that code for its exact shape; it is a reconstruction, not a copy of the
above.

**The only fields any consumer may bind on** (this is deliberately the
entirety of what `assert_stage_b_promotion_receipt`,
`deploy/alpha-release-common.sh`, checks):

```jq
.status == "MIGRATION_COMMITTED" or .status == "MIGRATION_COMMITTED_RECOVERED"
```

Everything else in this receipt is audit trail, not a contract another script
should parse — `databaseIdentity`/`schemaSha256`/etc. exist for a human or
`stageBRecover` reading this exact file, not as a stable API.

### `runtime-verification.json` (`kind: "task168StageBRuntimeVerification"`)

Written by T7 (`scripts/release/task168-stage-b-post-live-verify.sh`) — see
that script's `write()` call for the literal `jq -n` template — **only if
every one of its 8 checks passes** (digests, attestation, ledger names+count+
checksums, catalog, drift, health, outbox, read-only smoke). Full field set:

```
schemaVersion (1), kind ("task168StageBRuntimeVerification"),
migrationReceiptSha256 (sha256 of THIS release's migration-stage.json),
manifestSha256 (sha256 of the manifest this release activated),
apiDigest, webDigest, workerDigest (running image refs, as `docker inspect` reported them),
ledgerCount (int, always 11 on success — task168-stage-b-post-live-verify.sh now
  refuses to write ANY receipt unless the manifest names exactly 11 migrations),
catalogResult: { legacyTables, legacyLinkColumns } (both 0 on success),
driftCheck ("none" on success),
healthDbTrue (bool), workerHealthy (bool),
outboxProcessingZeroAt (ISO timestamp),
smokeCheck: { tournamentId, fixtureOrMatchId, status },
completedAt (ISO timestamp)
```

This receipt does **not** carry `status` or `databaseIdentity` fields — a
consumer that requires either is checking for something this contract does
not produce. The exact jq predicate a consumer must use to accept this
receipt for a given candidate (verbatim from
`assert_stage_b_promotion_receipt`, `deploy/alpha-release-common.sh`):

```jq
.schemaVersion == 1 and
.kind == "task168StageBRuntimeVerification" and
.migrationReceiptSha256 == <sha256sum of that release's migration-stage.json> and
.manifestSha256 == <sha256sum of the candidate manifest being promoted> and
.ledgerCount == 11 and
.driftCheck == "none" and
.healthDbTrue == true and
.workerHealthy == true and
(.completedAt | type == "string" and length > 0)
```

Both hash comparisons (`migrationReceiptSha256`, `manifestSha256`) are
computed by the consumer at check time (`sha256sum` of the actual files on
disk) and compared for exact string equality — never trust a hash embedded
in one file to describe a *different* file without independently recomputing
it. `scripts/qa/test-task168-post-live.sh` and
`scripts/qa/test-task168-stage-b-manifest.sh` pin this shape: a field rename
or a loosened check in either script goes red there.

## `stageBRecover`: which branch applies

Run when a Stage B host command's outcome is unknown (SSM timeout, GitHub
Actions cancel, or any other case where the SSM invocation's own terminal
status cannot be read back as a clean success or failure). Judges strictly
from the database and the state directory; never re-runs the migration
script, never activates a source, never composes up the final runtime.

1. **R-A — M11 applied, no receipt.** The `_prisma_migrations` ledger has one
   M11 row (checksum matches, `finished_at` set, not rolled back), the
   post-M11 catalog checks pass, `quiesce.json` exists and its recorded
   backup hash matches the backup file on disk, and no
   `migration-stage.json` exists yet. Writes a `MIGRATION_COMMITTED_RECOVERED`
   receipt; the writer stays stopped (`restart=no`).
2. **R-B — writers stopped, M11 not applied, no receipt.** No M11 row exists
   in the ledger. Restores the exact pre-quiesce writer container (matched by
   id and image, never recreated) to its original restart policy and starts
   it. This is the only branch of the three that mutates the running
   runtime.
3. **R-C — M11 has an unresolved attempt (P3009).** The M11 row has
   `finished_at IS NULL AND rolled_back_at IS NULL`. Not auto-recoverable:
   writes a diagnosis-only receipt and requires the manual
   `prisma migrate resolve --rolled-back` procedure before any further Stage
   B attempt.

### Preconditions before running `stageBRecover` for a given release

Confirm all of the following, read-only, before invoking it:

- the relevant SSM command invocation has reached a terminal status
  (Success/Failed/TimedOut/Cancelled) — do not treat "GitHub Actions reported
  the step as failed" alone as proof the host command has stopped;
- the Stage B `flock` for that release is not held;
- no container carries the `com.teameet.task168.stage-b=<release sha>`
  label;
- `pg_stat_activity` shows no migrate session and no Prisma advisory lock is
  held.

`stageBRecover` itself re-checks the lock and the labeled-container
precondition and refuses (touching nothing) if either still holds.

### Approval

R-B mutates the running Alpha runtime (restarts a writer) and needs the same
direct user approval any other Alpha runtime change needs. R-A only writes a
receipt — no database or runtime mutation — but that receipt becomes the
basis for any later resume, so it is approved under the same request.

## Rollback (backup restore)

Once a `stageBFinal` manifest is the active release, `rollback-alpha.sh`
refuses to perform an automated image rollback — the M11 migration drops the
legacy tables it would need to roll an image back onto. Restoring service
after that point is a **manual, backup-only procedure**, gated on direct user
approval like every other Alpha data-restoring action:

1. Confirm the actual state via `stageBRecover`'s read-only judgment (R-A /
   R-B / R-C above) before touching anything — a GitHub run reporting
   "failed" is not sufficient evidence on its own that the host command has
   actually stopped.
2. If the state is R-B (M11 never applied), no restore is needed — the
   writers are the ones to bring back, which `stageBRecover` already does.
3. If the state is R-C (an unresolved M11 attempt), M11's own explicit
   transaction means the schema was never actually changed — the fix is the
   ledger-only `prisma migrate resolve --rolled-back` procedure, not a
   backup restore.
4. If the state is R-A (M11 applied), restoring service means restoring the
   release's own `pre-m11-backup.sql` (the format is fixed by
   `BACKUP_FORMAT` in `deploy/task168-stage-b-migrate.sh`) onto the
   database, then reactivating the predecessor Stage A release's source and
   image.
5. Any window in which the final runtime was already brought up and started
   accepting writes before the restore begins means those writes are lost by
   the restore — there is no merge path back onto the pre-M11 schema.

This procedure has no scripted entry point; it is executed by hand against
the live host, under the same "any Alpha data change needs direct user
approval" rule as every other manual Alpha write.
