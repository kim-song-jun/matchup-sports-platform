# Task 9 competition-config — deferred contract-phase migration

## Why this document exists

PR `fix/v1-expand-contract-split` rewrote 4 of the 10 Task 9 migrations
(`20260729000100_v1_game_operations`, `20260729000200_v1_competition_config`,
`20260801040000_v1_task7_staff_audit_scope`,
`20260802000300_v1_result_escalation_lifecycle`) so they pass
`scripts/qa/check-expand-contract-migrations.mjs` — the gate the
`deploy-alpha.yml` "Resolve rollback compatibility base" step runs on every
`dev` push. That gate rejects any migration statement that could break a
**previous** app release if alpha ever needs to roll back to it while the DB
keeps the new migrations. A handful of statements genuinely fail that test —
not because the gate is wrong, but because they really would reject a
pre-Task-9 app instance's ordinary writes. Those statements were pulled out
of the migrations entirely rather than weakened or deleted; this document is
where they live until it is safe to apply them.

## What moved out, and where it went

| Original statement | Moved to |
|---|---|
| Seed 2 `v1_competition_config_versions` rows (football-v1, futsal-v1) | `apps/v1_api/src/tournaments/competition-config/competition-config-backfill.ts` (`seedCompetitionConfigVersions`) |
| Sport-support guard (`DO $$ ... $$` in the old migration) | same file, `assertAllSourcesHaveSupportedSport` |
| Backfill `competition_config_version_id` on `v1_tournaments`/`v1_team_matches`/`v1_tournament_fixtures` | same file, `backfillCompetitionConfigVersionIds` |
| Mask `v1_operation_audits.source_ip` | same file, `maskOperationAuditSourceIps` |
| All four, run together | same file, `runCompetitionConfigContractPhaseBackfill`, wired to the CLI at `competition-config-backfill.cli.ts` |

Run the CLI with:

```bash
pnpm --filter v1_api exec ts-node --transpile-only \
  src/tournaments/competition-config/competition-config-backfill.cli.ts
```

Every step is idempotent — safe to run repeatedly, including against a DB
that already has some or all of this data.

## What is still deferred (not yet written as a migration file)

These statements were **removed from the shipped migrations** and are not
yet a migration file anywhere — they must ship as a **separate, later PR**
once the conditions below are met, because the gate will reject them again
if diffed against `fix/v1-expand-contract-split`'s head the same way it
rejected them against `dev`'s previous head. That is expected: the gate's
job is exactly to keep asking "would this break the previous release" every
time, not just once.

```sql
-- v1_tournaments / v1_team_matches / v1_tournament_fixtures
ALTER TABLE v1_tournaments ALTER COLUMN competition_config_version_id SET NOT NULL;
ALTER TABLE v1_team_matches ALTER COLUMN competition_config_version_id SET NOT NULL;
ALTER TABLE v1_tournament_fixtures ALTER COLUMN competition_config_version_id SET NOT NULL;

ALTER TABLE v1_tournaments
  ALTER COLUMN competition_config_version_id SET DEFAULT v1_default_competition_config_version();
ALTER TABLE v1_team_matches
  ALTER COLUMN competition_config_version_id SET DEFAULT v1_default_competition_config_version();
ALTER TABLE v1_tournament_fixtures
  ALTER COLUMN competition_config_version_id SET DEFAULT v1_default_competition_config_version();

CREATE TRIGGER v1_pin_tournament_competition_config
BEFORE INSERT OR UPDATE OF sport_id, competition_config_version_id ON v1_tournaments
FOR EACH ROW EXECUTE FUNCTION v1_pin_sport_competition_config();

CREATE TRIGGER v1_pin_team_match_competition_config
BEFORE INSERT OR UPDATE OF sport_id, competition_config_version_id ON v1_team_matches
FOR EACH ROW EXECUTE FUNCTION v1_pin_sport_competition_config();

CREATE TRIGGER v1_pin_fixture_competition_config
BEFORE INSERT OR UPDATE OF tournament_id, competition_config_version_id ON v1_tournament_fixtures
FOR EACH ROW EXECUTE FUNCTION v1_pin_fixture_competition_config();
```

The functions these triggers attach (`v1_pin_sport_competition_config`,
`v1_pin_fixture_competition_config`, `v1_default_competition_config_version`)
are already defined in the shipped `20260729000200_v1_competition_config`
migration — defining a function is harmless (it doesn't run until something
calls it), only *attaching the triggers to pre-existing tables* and the
NOT NULL/DEFAULT changes are deferred.

`v1_tournaments_competition_config_fk`,
`v1_team_matches_competition_config_fk`, and
`v1_tournament_fixtures_competition_config_fk` are **already live** — they
were kept in the shipped migrations because the referencing column is still
nullable at the point each FK statement runs (no pre-existing row can
violate a FK on a column it never populates; see the gate's Rule 5 below).
Only the follow-up work above (NOT NULL + DEFAULT + the pin triggers) is
deferred.

### Note on `v1_notifications_business_key_key`

An earlier draft of this split also deferred `CREATE UNIQUE INDEX
"v1_notifications_business_key_key" ON "v1_notifications"("business_key")`.
That turned out to be unsafe, not just an expand/contract nuance:
`apps/v1_api/src/jobs/result-escalation/game-result-submitted-escalation.service.ts`'s
`notifyReviewer()` does a raw `INSERT ... ON CONFLICT (business_key) DO
NOTHING`, which requires that exact index to exist — Postgres throws "no
unique or exclusion constraint matching the ON CONFLICT specification" if it
doesn't, and because that INSERT runs inside the same transaction as the
escalation-queue INSERT before it, the failure rolled the whole
GAME_RESULT_SUBMITTED outbox-handler transaction back, silently dropping
every escalation. Confirmed by actually running the Task 22 result-review
integration suite (`test/tournaments/tournament-officialize.integration-spec.ts`)
against a build that deferred it — see the gate's Rule 7 below for why it is
still additive despite `v1_notifications` being a pre-existing table.

## When it is safe to apply the deferred contract-phase migration

1. `runCompetitionConfigContractPhaseBackfill` (the CLI above) has run
   against alpha **and reported zero rows still needing backfill on a
   second run** (re-run it once — the second run's `tournamentsBackfilled`/
   `teamMatchesBackfilled`/`tournamentFixturesBackfilled` counts should all
   be `0`, meaning nothing was created between the two runs that the first
   one missed).
2. `assertAllSourcesHaveSupportedSport` passes (the CLI throws
   `COMPETITION_CONFIG_SOURCE_UNSUPPORTED` and exits non-zero if it doesn't
   — this must be resolved as a data problem before contract phase, not
   worked around).
3. The contract-phase migration ships in a **separate PR**, based on
   whatever `dev` head is current at that time — the gate will diff it
   against the (by-then) canonical alpha release, and SET NOT
   NULL/triggers-on-existing-tables will always be flagged by the gate.
   That PR's migration file needs to be deployed via a path this gate does
   not (and structurally cannot) auto-approve; coordinate the exact
   mechanism with whoever owns `scripts/release/resolve-alpha-rollback-base.sh`
   at that time.
4. Re-run the backfill CLI **immediately before** that follow-up PR
   deploys, to catch any tournament/team match/fixture created in the gap
   between step 1 and the deploy.

## Coordination note: local dev databases

No environment (alpha, `main`, or any CI run) has ever applied any of the 10
Task 9 migrations before this PR — confirmed by direct inspection (`main`
has zero of them; alpha's applied-migration count and `v1_` table list were
checked directly via SSM and neither includes them). The one residual risk
is a **local development database** where someone ran `prisma migrate dev`
against the pre-split migration files. If that is you: your local DB may
have the old inline seed/backfill/triggers already applied under the old
migration checksums. Compare `_prisma_migrations` checksums for the 4
rewritten migration names against this branch, and if they differ, drop and
recreate your local V1 dev database rather than trying to reconcile in
place — nothing in that data is meant to be durable.

## Gate rule reference (`scripts/qa/check-expand-contract-migrations.mjs`)

Rules 1–4 (dollar-quote-aware statement parsing, function redefinition
safety, trigger-on-new-table safety, `BEGIN`/`COMMIT` as no-ops) were
authorized up front as pure parser/policy accuracy fixes. Rules 5–7 were
added during implementation and approved after the fact, each with a
concrete negative control in `--self-test`:

- **Rule 5**: `ADD CONSTRAINT ... FOREIGN KEY` on an existing table is
  additive if at least one referencing column is still nullable-and-newly-
  added *at that point in the diff's statement order* (an intervening
  `SET NOT NULL` revokes it). Postgres FK checks never reject a NULL
  referencing column.
- **Rule 6**: `CREATE UNIQUE INDEX` on an existing table is additive if the
  index includes the table's `id` column — this schema's universal primary
  key, so any superset of it is trivially already unique.
- **Rule 7**: `CREATE UNIQUE INDEX` on an existing table is additive if
  *every* indexed column is nullable-and-newly-added at that point in the
  diff (same eligibility test as Rule 5) — Postgres unique indexes never
  treat two NULLs as colliding, so a legacy app instance that never
  populates the column can never violate it.
