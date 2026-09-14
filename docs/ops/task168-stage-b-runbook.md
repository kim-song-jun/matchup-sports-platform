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

A `MIGRATION_COMMITTED_RECOVERED` receipt is deliberately never written with
the same status as an original `MIGRATION_COMMITTED` one — collapsing the two
would erase the fact that the run needed reconstruction from the audit trail.

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
