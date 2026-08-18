#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

// Declared here rather than beside parseStatements because selfTest() runs
// during module evaluation, before a class declaration further down the file
// would have left its temporal dead zone.
class UnparsableSqlError extends Error {}

// ─── reviewed non-additive escape hatch ────────────────────────────────────
//
// Declared up here (not beside runAdditivityCheck) for the same reason as the
// class above: selfTest() calls runAdditivityCheck during module evaluation,
// and its `reviewed = REVIEWED_NON_ADDITIVE` default would hit the const's
// temporal dead zone if this lived further down.
//
// The additivity rules below are conservative by construction: they can only
// PROVE a statement additive, never that a genuinely non-additive one is
// nonetheless rollback-safe in this codebase's specific data/app reality. That
// last mile is a human judgement, and this is where it is recorded — auditable,
// in git, one entry per statement, each justifying WHY the rolling-deploy risk
// the gate exists to catch does not apply. Keep this list SHORT: every entry
// weakens the gate for exactly one (file, statement) pair and nothing else.
const REVIEWED_NON_ADDITIVE = [
  {
    file: 'apps/v1_api/prisma/migrations/20260817120000_v1_tournament_review_drop_team_unique/migration.sql',
    statement: 'DROP INDEX IF EXISTS "v1_tournament_reviews_tournament_id_team_id_key"',
    reason:
      'Drops the tournament-review "one per TEAM" unique so a team\'s owner AND managers can each leave a ' +
      'review, matching what post-event team reviews already do (their duplicate key became per-PERSON in ' +
      '2026-08-12). Rolling-deploy safe in both directions: a DROP only RELAXES a constraint, so no running ' +
      'instance can trip it, and the old app keeps rejecting a second per-team review in its service layer ' +
      '(ALREADY_REVIEWED) so it cannot create rows the restored index would reject on rollback. The ' +
      'per-person key (v1_tournament_reviews_tournament_id_author_user_id_key) is untouched and still bounds ' +
      'how many reviews one account can write. The gate rejects bare DROP INDEX as a category, not because ' +
      'this particular drop is unsafe. Reviewed 2026-08-17.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813200000_v1_team_lineup_reuse/migration.sql',
    statement:
      'DO $$ BEGIN IF NOT EXISTS ( SELECT 1 FROM pg_constraint WHERE conname = ' +
      "'v1_team_lineup_presets_team_id_fkey' ) THEN ALTER TABLE \"v1_team_lineup_presets\" ADD CONSTRAINT " +
      '\"v1_team_lineup_presets_team_id_fkey\" FOREIGN KEY (\"team_id\") REFERENCES \"v1_teams\"(\"id\") ON ' +
      'DELETE CASCADE ON UPDATE CASCADE; END IF; IF NOT EXISTS ( SELECT 1 FROM pg_constraint WHERE conname = ' +
      "'v1_team_lineup_preset_entries_preset_id_fkey' ) THEN ALTER TABLE " +
      '\"v1_team_lineup_preset_entries\" ADD CONSTRAINT \"v1_team_lineup_preset_entries_preset_id_fkey\" ' +
      'FOREIGN KEY (\"preset_id\") REFERENCES \"v1_team_lineup_presets\"(\"id\") ON DELETE CASCADE ON UPDATE ' +
      'CASCADE; END IF; END $$',
    reason:
      'Both FKs target tables this same migration creates a few statements earlier ' +
      '(v1_team_lineup_presets, v1_team_lineup_preset_entries), so there is no pre-existing row that could ' +
      'violate them and no old app instance that writes to those tables at all. The pg_constraint guards ' +
      'only make it re-runnable. The gate rejects it because it cannot parse inside a DO block, not because ' +
      'the enclosed ALTERs are unsafe — the same two ADD CONSTRAINT ... FOREIGN KEY statements written ' +
      'bare would pass its own new-table rule. Reviewed 2026-08-13 to unblock alpha deploys.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813200000_v1_team_lineup_reuse/migration.sql',
    statement:
      'CREATE UNIQUE INDEX IF NOT EXISTS "v1_team_memberships_team_id_jersey_number_key" ON ' +
      '"v1_team_memberships" ("team_id", "jersey_number")',
    reason:
      'jersey_number is added as a nullable column by the ALTER TABLE two statements above in this same ' +
      'migration, so every pre-existing v1_team_memberships row holds NULL there and Postgres never treats ' +
      'two NULLs as colliding — no existing row can trip this index, and an old app instance that has never ' +
      'heard of the column can only keep writing NULL. The gate rejects it only because its additive rule ' +
      'requires EVERY indexed column to be newly-added-and-nullable, while team_id is pre-existing; the ' +
      'safety actually comes from the nullable column alone. Reviewed 2026-08-13 to unblock alpha deploys.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813120000_v1_roster_identity_link/migration.sql',
    statement: `WITH latest_snapshot AS (
  SELECT DISTINCT ON (participant_id) participant_id, state
  FROM "v1_participant_consent_snapshots"
  ORDER BY participant_id, consent_version DESC
),
granted_user_ids AS (
  SELECT DISTINCT lc.user_id
  FROM "v1_participant_identity_link_current" lc
  JOIN latest_snapshot ls ON ls.participant_id = lc.participant_id
  WHERE ls.state = 'GRANTED'
)
INSERT INTO "v1_user_record_consents" ("user_id", "state", "effective_at", "policy_hash", "created_at", "updated_at")
SELECT "user_id", 'GRANTED', CURRENT_TIMESTAMP, 'backfill-20260813-participant-snapshot', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM granted_user_ids
ON CONFLICT ("user_id") DO NOTHING`,
    reason:
      'Seeds the v1_user_record_consents table that the SAME migration creates three statements earlier — ' +
      'it writes to a table no deployed revision has ever read, so neither an old app instance mid-rollout ' +
      'nor a rollback can observe it (rolling back leaves an unread table behind, exactly like the CREATE ' +
      'TABLE itself). It only INSERTs, never UPDATEs or DELETEs, and ON CONFLICT DO NOTHING makes a re-run ' +
      'a no-op. Why it exists: public record visibility moves from a per-participant consent snapshot to a ' +
      'per-user switch, so users who had already granted per-participant consent would silently vanish from ' +
      'public lineups/scorer names the moment the new gate went live (alpha holds at least one such ' +
      'participant — a named scorer on an official fixture). The read side never reads this table for ' +
      'anyone without a GRANTED snapshot, so the backfill grants nothing that was not already granted. ' +
      'Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813070000_v1_tournament_review_team_scope/migration.sql',
    statement: `UPDATE "v1_tournament_reviews" r
SET "team_id" = candidate.team_id
FROM (
  SELECT matched.review_id, matched.team_id
  FROM (
    SELECT
      rv.id AS review_id,
      reg.team_id AS team_id,
      COUNT(*) OVER (PARTITION BY rv.id) AS candidate_count
    FROM "v1_tournament_reviews" rv
    JOIN "v1_tournament_registrations" reg
      ON reg.tournament_id = rv.tournament_id
     AND reg.applied_by_user_id = rv.author_user_id
     AND reg.status = 'confirmed'
    JOIN "v1_teams" t ON t.id = reg.team_id
    WHERE rv.team_id IS NULL
      AND (rv.team_name IS NULL OR t.name = rv.team_name)
  ) AS matched
  WHERE matched.candidate_count = 1
) AS candidate
WHERE r.id = candidate.review_id`,
    reason:
      'Backfills the just-added nullable v1_tournament_reviews.team_id so a tournament review belongs to ' +
      'the team rather than to whoever pressed the apply button. Rolling-deploy safe: the OLD app has no ' +
      'knowledge of team_id at all — it neither reads nor writes the column (its review create/read paths ' +
      'select the pre-existing columns only) — so filling it changes nothing the OLD app can observe, and a ' +
      'rollback leaves the values sitting inert. No pre-existing column or row is deleted, narrowed, or ' +
      'reinterpreted; the statement only turns NULL into a value on a column that did not exist one ' +
      'migration ago. It is deliberately conservative about WHICH value: the candidate must come from a ' +
      "confirmed registration AND match the review's own team_name snapshot, and it is applied only when " +
      'exactly one candidate survives (COUNT(*) OVER (PARTITION BY rv.id) = 1) — ambiguous legacy rows are ' +
      'left NULL rather than guessed, and NULLs never collide under the (tournament_id, team_id) unique. ' +
      'Re-runnable: the WHERE rv.team_id IS NULL guard makes a second execution a no-op. It is a bare ' +
      'UPDATE rather than a DO block because no procedural control flow is needed; isAdditiveStatement has ' +
      'no data-statement branch and so cannot prove any UPDATE additive, which is why this needs review ' +
      'rather than a rule change. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813070000_v1_tournament_review_team_scope/migration.sql',
    statement: `DO $$
DECLARE
  duplicate_count bigint;
BEGIN
  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT 1
    FROM "v1_tournament_reviews"
    WHERE "team_id" IS NOT NULL
    GROUP BY "tournament_id", "team_id"
    HAVING count(*) > 1
  ) AS duplicated;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      '대회 후기에 팀당 1건 제약을 걸 수 없어요. (tournament_id, team_id) 충돌 %건. 백필 로직이 예상과 다르게 동작했습니다 — 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.',
      duplicate_count
      USING ERRCODE = '23505';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_team_id_key"
    ON "v1_tournament_reviews"("tournament_id", "team_id");
END $$`,
    reason:
      'Adds the per-team duplicate key for tournament reviews so one team gets one review per tournament, ' +
      'now that any owner/manager of the team can write it instead of only the applicant. Rolling-deploy ' +
      'safe: the OLD app never writes team_id (it does not know the column), so every row it inserts ' +
      'during the overlap carries team_id NULL, and Postgres never treats two NULLs as colliding — the ' +
      'new index cannot reject a single OLD-app write. The NEW app enforces the same one-per-team rule in ' +
      'application code before insert. The pre-existing (tournament_id, author_user_id) unique is kept, so ' +
      'the per-person rule the OLD app relies on is unchanged in both directions. The one shape that could ' +
      'collide — two backfilled rows landing on the same (tournament, team) — is not silently repaired: ' +
      'the preceding DO block counts it and aborts with ERRCODE 23505 so a human decides which review ' +
      'survives (same pattern as the two review re-pins below). The statement is a DO block purely because ' +
      'that guard needs procedural control flow; isAdditiveStatement has no DO branch and so cannot see ' +
      'the CREATE UNIQUE INDEX it wraps. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813070000_v1_tournament_review_team_scope/migration.sql',
    statement: `DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'v1_tournament_reviews_team_id_fkey'
  ) THEN
    ALTER TABLE "v1_tournament_reviews"
      ADD CONSTRAINT "v1_tournament_reviews_team_id_fkey"
      FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$`,
    reason:
      'Adds the FK behind the new nullable team_id column. Rolling-deploy safe by the same argument the ' +
      "gate's own ADD CONSTRAINT FK rule uses: the referencing column was created by this very migration " +
      'and is nullable, so no pre-existing row can violate it, and the OLD app never writes the column so ' +
      'it cannot insert an unmatched value during the overlap. RESTRICT (not CASCADE) is chosen so a team ' +
      'deletion can never take reviews with it — V1Team is always soft-deleted (deletedAt) in this ' +
      'codebase, matching v1_tournament_registrations.team. The statement is wrapped in a DO block only to ' +
      'make it idempotent via pg_constraint lookup (this repo requires re-runnable migrations); ' +
      'isAdditiveStatement has no DO branch and so cannot see the ADD CONSTRAINT it wraps. ' +
      'Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813061500_v1_tournament_personal_review_scope/migration.sql',
    statement: `DO $$
DECLARE
  group_conflicts bigint;
BEGIN
  SELECT count(*) INTO group_conflicts
  FROM (
    SELECT 1
    FROM "v1_post_event_reviews"
    WHERE "target_user_id" IS NOT NULL
      AND "source_group_id" IS NOT NULL
    GROUP BY "reviewer_user_id", "target_user_id", "source_type", "source_group_id"
    HAVING count(*) > 1
  ) AS duplicated_by_group;

  IF group_conflicts > 0 THEN
    RAISE EXCEPTION
      '개인 후기에 대회 단위 중복 방지 제약을 걸 수 없어요. (reviewer_user_id, target_user_id, source_type, source_group_id) 충돌 %건. 한 사람이 같은 대회에서 같은 상대를 두 번 이상 평가한 후기입니다. 어느 후기를 남길지 자동으로 정하지 않으니, 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.',
      group_conflicts
      USING ERRCODE = '23505';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_reviews_user_user_source_group_key"
    ON "v1_post_event_reviews"("reviewer_user_id", "target_user_id", "source_type", "source_group_id");
END $$`,
    reason:
      'Adds a tournament-scoped duplicate key for PERSONAL reviews so the same reviewer cannot rate the ' +
      'same opponent once per fixture (group stage, quarter-final, final) — team-target reviews already ' +
      'use this source_group_id scope. Rolling-deploy safe: the index is narrower only for a writer that ' +
      'submits more than one personal review per (reviewer, target, tournament), which no app version can ' +
      'do — the OLD app rejects targetType=user on tournament_fixture outright (assertSubmitShape 400), so ' +
      'no pre-existing row carries a non-NULL source_group_id on a personal review at all, and the NEW app ' +
      'enforces the same key in application code. match-sourced personal reviews keep source_group_id NULL, ' +
      'which Postgres never treats as colliding, so the pre-existing population is untouched. The one shape ' +
      'that could collide is not silently repaired: the preceding DO block counts it and aborts with ' +
      'ERRCODE 23505 so a human decides which review survives. The statement is a DO block purely because ' +
      'that guard needs procedural control flow; isAdditiveStatement has no DO branch and so cannot see the ' +
      'CREATE UNIQUE INDEX it wraps. The four ALTER TABLE ADD COLUMN IF NOT EXISTS statements in the same ' +
      'file are additive on their own and pass without review. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260812231238_v1_post_event_review_reviewer_user_unique/migration.sql',
    statement: `DO $$
DECLARE
  source_conflicts bigint;
  group_conflicts bigint;
BEGIN
  SELECT count(*) INTO source_conflicts
  FROM (
    SELECT 1
    FROM "v1_post_event_reviews"
    WHERE "target_team_id" IS NOT NULL
    GROUP BY "reviewer_user_id", "target_team_id", "source_type", "source_id"
    HAVING count(*) > 1
  ) AS duplicated_by_source;

  SELECT count(*) INTO group_conflicts
  FROM (
    SELECT 1
    FROM "v1_post_event_reviews"
    WHERE "target_team_id" IS NOT NULL
      AND "source_group_id" IS NOT NULL
    GROUP BY "reviewer_user_id", "target_team_id", "source_type", "source_group_id"
    HAVING count(*) > 1
  ) AS duplicated_by_group;

  IF source_conflicts > 0 OR group_conflicts > 0 THEN
    RAISE EXCEPTION
      '팀 후기 unique 제약을 사람 기준으로 바꿀 수 없어요. (reviewer_user_id, target_team_id, source_type, source_id) 충돌 %건, (reviewer_user_id, target_team_id, source_type, source_group_id) 충돌 %건. 한 사람이 서로 다른 두 팀 소속으로 같은 상대를 평가한 후기입니다. 어느 후기를 남길지 자동으로 정하지 않으니, 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.',
      source_conflicts, group_conflicts
      USING ERRCODE = '23505';
  END IF;

  DROP INDEX IF EXISTS "v1_post_event_reviews_reviewer_team_id_target_team_id_sourc_key";
  DROP INDEX IF EXISTS "v1_post_event_reviews_team_source_group_key";

  CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_reviews_user_team_source_key"
    ON "v1_post_event_reviews"("reviewer_user_id", "target_team_id", "source_type", "source_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "v1_post_event_reviews_user_team_source_group_key"
    ON "v1_post_event_reviews"("reviewer_user_id", "target_team_id", "source_type", "source_group_id");
END $$`,
    reason:
      'Swaps the team-review duplicate-prevention key from the reviewing TEAM to the reviewing PERSON, so ' +
      'that every member of a participating team can submit a review instead of only the owner/manager. ' +
      'Rolling-deploy safe in both directions: the two DROPs only RELAX constraints, which no running app ' +
      'instance can trip; and the two new indexes are strictly narrower only for a writer that submits more ' +
      'than one team review per person per source, which the OLD app cannot do — it gates writes to a single ' +
      'owner/manager per team, so pre-existing rows hold at most one review per (team, target, source) and ' +
      'therefore at most one per (person, target, source). The one shape that could collide — one person ' +
      'reviewing the same opponent as owner of two different teams — is not silently repaired: the preceding ' +
      'DO block counts it and aborts the migration with ERRCODE 23505 so a human decides which review ' +
      'survives. The whole statement is a DO block purely because that guard needs procedural control flow; ' +
      "isAdditiveStatement has no DO branch and so cannot see the CREATE UNIQUE INDEXes it wraps. Reviewed 2026-08-12.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260809133000_v1_team_schedule_match_unique/migration.sql',
    statement:
      'CREATE UNIQUE INDEX "v1_team_schedules_team_match_unique" ON "v1_team_schedules"("team_id", "team_match_id")',
    reason:
      'team_match_id is NULL for ordinary TRAINING/EVENT schedules, which Postgres never treats as ' +
      'colliding, so only MATCH schedules are constrained. Duplicate (team, match) schedules are already ' +
      'prevented by app-level idempotency (the per-team lock + transactional invariant in ' +
      "team-schedules.service.ts); this index is the author's last-resort DB defense (#296), not a new " +
      'shape old writers can trip. Alpha currently holds 0 rows with a non-NULL team_match_id. Reviewed 2026-08-09.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260809140000_v1_tournament_group_natural_key/migration.sql',
    statement:
      'CREATE UNIQUE INDEX "v1_tournament_groups_tournament_id_name_key" ON "v1_tournament_groups"("tournament_id", "name")',
    reason:
      'Natural-key unique that lets the alpha QA seed upsert tournament groups instead of delete-recreate ' +
      '(Part 2 of the append-only-audit deadlock fix). The QA seed already creates exactly one group per ' +
      '(tournament, name); no other writer creates tournament groups. Verified 0 duplicate (tournament_id, ' +
      'name) rows on alpha AND prod before adding. Reviewed 2026-08-09.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260809140100_v1_tournament_fixture_natural_key/migration.sql',
    statement:
      'CREATE UNIQUE INDEX "v1_tournament_fixtures_tournament_round_number_leg_key" ON "v1_tournament_fixtures"("tournament_id", "round", "fixture_number", "leg_number")',
    reason:
      'Natural-key unique that lets the alpha QA seed upsert fixtures instead of delete-recreate (Part 2). ' +
      'Fixtures are deterministic per (tournament, round, fixture_number, leg_number) in both the QA seed and ' +
      'the bracket generator. Verified 0 duplicate rows on that key on alpha AND prod (prod has 0 fixtures) ' +
      'before adding. Reviewed 2026-08-09.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260810130000_v1_official_fact_backfill_score_shape/migration.sql',
    statement:
      'CREATE OR REPLACE FUNCTION v1_guard_game_official_fact_insert() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE revision_row RECORD; game_source_type "V1GameSourceType"; game_tournament_id TEXT; home_team_id_value TEXT; away_team_id_value TEXT; revision_home JSONB; revision_away JSONB; BEGIN SELECT state, revision, score, events_hash, official_at INTO revision_row FROM v1_game_result_revisions WHERE game_id = NEW.game_id AND id = NEW.revision_id FOR KEY SHARE; IF NOT FOUND OR revision_row.state IS DISTINCT FROM \'OFFICIAL\' OR revision_row.official_at IS NULL THEN RAISE EXCEPTION \'official fact requires an official game revision\' USING ERRCODE = \'23514\'; END IF; SELECT game.source_type, fixture.tournament_id, home_side.team_id, away_side.team_id INTO game_source_type, game_tournament_id, home_team_id_value, away_team_id_value FROM v1_games AS game LEFT JOIN v1_tournament_fixtures AS fixture ON fixture.id = game.tournament_fixture_id LEFT JOIN v1_game_sides AS home_side ON home_side.game_id = game.id AND home_side.side_key = \'HOME\' LEFT JOIN v1_game_sides AS away_side ON away_side.game_id = game.id AND away_side.side_key = \'AWAY\' WHERE game.id = NEW.game_id FOR KEY SHARE OF game; revision_home := COALESCE(revision_row.score -> \'home\', revision_row.score -> \'regulation\' -> \'home\'); revision_away := COALESCE(revision_row.score -> \'away\', revision_row.score -> \'regulation\' -> \'away\'); IF NOT FOUND OR NEW.revision IS DISTINCT FROM revision_row.revision OR NEW.source_type IS DISTINCT FROM game_source_type OR NEW.tournament_id IS DISTINCT FROM game_tournament_id OR NEW.home_team_id IS DISTINCT FROM home_team_id_value OR NEW.away_team_id IS DISTINCT FROM away_team_id_value OR NEW.score IS DISTINCT FROM revision_row.score OR NEW.events_hash IS DISTINCT FROM revision_row.events_hash OR NEW.official_at IS DISTINCT FROM revision_row.official_at OR jsonb_typeof(revision_home) IS DISTINCT FROM \'number\' OR jsonb_typeof(revision_away) IS DISTINCT FROM \'number\' OR NEW.home_score IS DISTINCT FROM (revision_home #>> \'{}\')::INTEGER OR NEW.away_score IS DISTINCT FROM (revision_away #>> \'{}\')::INTEGER THEN RAISE EXCEPTION \'official fact must exactly snapshot its official game revision\' USING ERRCODE = \'23514\'; END IF; RETURN NEW; END $$',
    reason:
      'Trigger-function replacement that is a STRICT WIDENING: the only behavioural change is ' +
      "`revision_row.score -> 'home'` becoming `COALESCE(score -> 'home', score -> 'regulation' -> 'home')` " +
      '(same for away). Every score the previous guard accepted is still accepted and still validated ' +
      'identically; the nested shape that was previously rejected is now also accepted. So during a rolling ' +
      'deploy the OLD app + NEW trigger combination behaves exactly as before (old writers only ever produce ' +
      'the flat shape), and NEW app + OLD trigger fails closed (the fact insert raises, the manual backfill CLI ' +
      'quarantines it) rather than corrupting anything. Without this widening it is IMPOSSIBLE to ever insert a ' +
      'v1_game_official_facts row for a game imported by game-result-backfill.ts, which is exactly the 21 alpha ' +
      'games whose team records read 0 while the standings table showed a win. Reviewed 2026-08-10.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813200000_v1_appearance_gate_backfill/migration.sql',
    statement: 'ALTER TABLE v1_game_result_participants DISABLE TRIGGER v1_guard_result_participant_mutation',
    reason:
      'Scope-limited trigger toggle, not a schema change: the DISABLE and its matching ENABLE below bracket the two data statements inside this one migration transaction, so the guard is restored before anything else can observe it (a rolled-back migration never commits the DISABLE either). It is required because v1_guard_result_participant_mutation only permits writes while the owning revision is DRAFT, and this backfill by definition targets SUBMITTED/OFFICIAL revisions. No app code path reads or depends on the trigger being momentarily off. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813200000_v1_appearance_gate_backfill/migration.sql',
    statement: 'DELETE FROM v1_game_result_participants rp USING v1_game_result_revisions rev WHERE rp.result_revision_id = rev.id AND EXISTS ( SELECT 1 FROM v1_games g WHERE g.id = rev.game_id AND g.source_type = \'TOURNAMENT_FIXTURE\' ) AND rev.state IN (\'SUBMITTED\', \'OFFICIAL\') AND NOT EXISTS ( SELECT 1 FROM v1_game_participants p WHERE p.id = rp.participant_id AND p.started = TRUE ) AND NOT EXISTS ( SELECT 1 FROM v1_game_events e WHERE e.game_id = rev.game_id AND e.type = \'SUBSTITUTION\' AND e.participant_id = rp.participant_id AND NOT EXISTS (SELECT 1 FROM v1_game_events r WHERE r.reverses_event_id = e.id) ) AND rp.goals = 0 AND rp.assists = 0 AND rp.fouls = 0 AND COALESCE((rp.cards ->> \'yellow\')::int, 0) = 0 AND COALESCE((rp.cards ->> \'red\')::int, 0) = 0 AND rev.mvp_participant_id IS DISTINCT FROM rp.participant_id',
    reason:
      'Data-only correction with no schema change, so both rolling-deploy directions are safe: the OLD app reads v1_game_result_participants as a plain list (PublicUserRecordsService counts rows for summary.appearances) and simply sees the corrected, smaller set; the NEW app writes the same shape it always did. Only rows with NO evidence of playing are removed -- not a starter, never the incoming side of an active SUBSTITUTION, zero goals/assists/fouls/cards, and not the revision MVP -- so no goal, card or MVP reference is ever orphaned. Restricted to source_type=TOURNAMENT_FIXTURE and to SUBMITTED/OFFICIAL revisions, leaving in-progress DRAFT/CHANGE_REQUESTED edits untouched. Rollback is application-images-only and the old images do not need these rows to exist (a bench player who never played simply stops appearing in their own record); the judgement inputs (V1GameParticipant.started and the event stream) are untouched, so the deleted rows are reconstructible from the same rule at any time. Verified on a throwaway Postgres 16 with the full migration chain replayed: starter kept, active substitute kept, reversed substitution deleted, never-used bench deleted, a substitute whose substitution was never entered but who scored kept with goals=1, DRAFT row untouched, TEAM_MATCH row untouched. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813200000_v1_appearance_gate_backfill/migration.sql',
    statement: 'UPDATE v1_game_result_participants rp SET started = p.started FROM v1_game_result_revisions rev, v1_game_participants p WHERE rp.result_revision_id = rev.id AND rp.participant_id = p.id AND EXISTS ( SELECT 1 FROM v1_games g WHERE g.id = rev.game_id AND g.source_type = \'TOURNAMENT_FIXTURE\' ) AND rev.state IN (\'SUBMITTED\', \'OFFICIAL\') AND rp.started IS DISTINCT FROM p.started',
    reason:
      'Column-value correction on an existing boolean, no schema change. `started` was written as a hardcoded true for every participant by deriveTournamentRevision, so this realigns it with the lineup row it was always supposed to mirror (V1GameParticipant.started). Both rolling-deploy directions are safe: the OLD app only renders this flag (public records items[].started) and never branches on it in a way a more accurate value breaks, and the NEW app writes the same column with the same meaning. Same scoping as the DELETE above (TOURNAMENT_FIXTURE + SUBMITTED/OFFICIAL only), and it is idempotent -- the IS DISTINCT FROM guard makes a re-run a no-op. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813200000_v1_appearance_gate_backfill/migration.sql',
    statement: 'ALTER TABLE v1_game_result_participants ENABLE TRIGGER v1_guard_result_participant_mutation',
    reason:
      'The restoring half of the DISABLE above -- it puts v1_guard_result_participant_mutation back exactly as the schema declares it, inside the same transaction. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813070000_v1_tournament_review_team_scope/migration.sql',
    statement: 'UPDATE "v1_tournament_reviews" r SET "team_id" = candidate.team_id FROM ( SELECT matched.review_id, matched.team_id FROM ( SELECT rv.id AS review_id, reg.team_id AS team_id, COUNT(*) OVER (PARTITION BY rv.id) AS candidate_count FROM "v1_tournament_reviews" rv JOIN "v1_tournament_registrations" reg ON reg.tournament_id = rv.tournament_id AND reg.applied_by_user_id = rv.author_user_id AND reg.status = \'confirmed\' JOIN "v1_teams" t ON t.id = reg.team_id WHERE rv.team_id IS NULL AND (rv.team_name IS NULL OR t.name = rv.team_name) ) AS matched WHERE matched.candidate_count = 1 ) AS candidate WHERE r.id = candidate.review_id',
    reason:
      'Textbook expand-contract backfill of a column added nullable two statements earlier in the same file, so nothing pre-existing is rewritten: only rows WHERE team_id IS NULL are touched, and the migration deliberately leaves team_id NULL whenever the (tournament, author) join is ambiguous rather than guessing. Rolling-deploy safe in both directions because the OLD app has no notion of the column at all (it neither selects nor writes team_id), so a filled value is invisible to it, while the NEW app is the only reader. Rollback is application-images-only and old images keep working against the populated column. Reviewed 2026-08-13 while unblocking the alpha deploy (the gate runs at deploy time, not in PR CI, so this surfaced only after #439 merged).',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813070000_v1_tournament_review_team_scope/migration.sql',
    statement: 'DO $$ DECLARE duplicate_count bigint; BEGIN SELECT count(*) INTO duplicate_count FROM ( SELECT 1 FROM "v1_tournament_reviews" WHERE "team_id" IS NOT NULL GROUP BY "tournament_id", "team_id" HAVING count(*) > 1 ) AS duplicated; IF duplicate_count > 0 THEN RAISE EXCEPTION \'대회 후기에 팀당 1건 제약을 걸 수 없어요. (tournament_id, team_id) 충돌 %건. 백필 로직이 예상과 다르게 동작했습니다 — 수동으로 정리한 뒤 마이그레이션을 다시 실행하세요.\', duplicate_count USING ERRCODE = \'23505\'; END IF; CREATE UNIQUE INDEX IF NOT EXISTS "v1_tournament_reviews_tournament_id_team_id_key" ON "v1_tournament_reviews"("tournament_id", "team_id"); END $$',
    reason:
      'The unique index inside this DO block cannot be tripped by an old writer: (tournament_id, team_id) is unique only among non-NULL team_id under standard Postgres NULL-distinct semantics, and the OLD app never writes team_id (the column does not exist in its client), so every review it inserts is NULL-scoped and collision-free. Only the NEW app populates team_id, and it enforces the same one-review-per-team rule. The block also re-verifies zero duplicates BEFORE creating the index and raises 23505 otherwise, so a bad backfill fails loudly instead of silently skipping the constraint. The gate flags it because a DO block is opaque to the additivity parser, not because the index is reachable by legacy writes. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260813070000_v1_tournament_review_team_scope/migration.sql',
    statement: 'DO $$ BEGIN IF NOT EXISTS ( SELECT 1 FROM pg_constraint WHERE conname = \'v1_tournament_reviews_team_id_fkey\' ) THEN ALTER TABLE "v1_tournament_reviews" ADD CONSTRAINT "v1_tournament_reviews_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "v1_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$',
    reason:
      'FK on the same newly-added nullable column, which the additivity rules already treat as safe when written as a bare ALTER TABLE -- it is flagged here only because the idempotency guard wraps it in a DO block the parser cannot see into. Legacy NULL-valued rows bypass the constraint by definition, and the OLD app only ever produces NULL team_id, so no old write can violate it. ON DELETE RESTRICT adds no rolling risk either: V1Team is never physically deleted in this codebase (always deletedAt soft delete) and the sibling FK on v1_tournament_registrations.team_id already uses RESTRICT. Reviewed 2026-08-13.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
    statement: `INSERT INTO "v1_managed_terms_policies" ("id", "code", "name", "is_active", "created_at", "updated_at") VALUES ('f772fb99-2671-4066-8874-54867ce0ecf4', 'tournament_record_disclosure', '대회 경기 기록 공개 동의', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`,
    reason:
      "Seeds a brand-new managed-terms POLICY row (code 'tournament_record_disclosure') that nothing can " +
      "observe on its own: this repo surfaces terms only by walking placement -> policy -> latest published " +
      "document for a context (ManagedTermsRuntimeService.currentTournamentTerms), so a policy with no " +
      "placement is unreachable by every deployed revision, old and new. INSERT only, never UPDATE or " +
      "DELETE, and ON CONFLICT (\"id\") DO NOTHING makes a re-run a no-op. No pre-existing row is touched -- " +
      "in particular tournament_privacy v1.1 is deliberately left alone (this migration names it only in " +
      "comments), so no existing consent is invalidated and no re-consent is triggered. Rolling the app " +
      "back leaves an unread row behind, exactly like a CREATE TABLE. Why it exists: the public record " +
      "screens now show a nickname unless the player opts into real-name display, and that opt-in needs its " +
      "own consent basis -- tournament_privacy lists ten purposes, none of which is publishing match " +
      "records. Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
    statement: `INSERT INTO "v1_managed_terms_documents" ("id", "policy_id", "version", "title", "content", "content_hash", "change_summary", "requires_reconsent", "status", "effective_at", "published_at", "created_at", "updated_at") VALUES ( '86b39028-bd47-4a4e-9c09-6a4c71c34df6', 'f772fb99-2671-4066-8874-54867ce0ecf4', 'v1.1', '대회 경기 기록 공개 동의', $terms$본인은 팀밋 대회 경기 기록(라인업, 득점·어시스트 등 이벤트 기록, MVP 등)에 닉네임 대신 실명이 표시되는 것에 동의할 수 있습니다. 이 동의는 선택 사항이며, 동의하지 않아도 대회 신청 및 참가에는 어떠한 제한도 없습니다. 1. 공개 항목 이름, 등번호, 포지션, 소속 팀명, 경기별 기록(출전·득점·어시스트·경고·퇴장·MVP 등) 2. 공개 목적 대회 경기 기록 및 참가 명단을 팀밋 서비스 내에서 공개 게시하기 위한 목적으로 이용합니다. 3. 공개 위치 팀밋 서비스 내 대회 기록, 순위표, 선수 기록 화면 4. 공개 기간 동의 시점부터 본인이 철회하기 전까지 계속 공개됩니다. 철회 후에는 별도 요청 없이 즉시 닉네임 표시로 전환됩니다. 5. 동의 거부 및 철회 안내 본 동의는 선택 사항입니다. 동의하지 않아도 대회 신청 및 참가에는 제한이 없으며, 이 경우 경기 기록에는 닉네임이 표시됩니다. 이미 동의한 경우에도 마이페이지 > 설정 > 대회 기록 실명 표시에서 언제든지 철회할 수 있습니다. 6. 유의사항 회사는 공개된 경기 기록을 대회 운영, 기록 게시, 서비스 제공 목적 범위 내에서만 사용합니다. 본인은 위 내용을 확인하였으며 대회 경기 기록 공개(실명 표시)에 동의합니다. 회사명: 아이위(IWI) 대표자: 김봉목 이메일: teameetsports@naver.com 시행일: 2026년 8월 18일$terms$, 'b0527fa26264263b1ed78388472df50499c9e2cb0730ff0a3d28e090f278e65a', '대회 경기 기록(라인업/득점/MVP 등)에 실명 표시를 선택적으로 동의받기 위한 신규 정책 최초 발행', true, 'published'::"V1TermsDocumentStatus", '2026-08-18T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ) ON CONFLICT ("id") DO NOTHING`,
    reason:
      "Seeds the single published DOCUMENT (v1.1) of the tournament_record_disclosure policy created one " +
      "statement earlier in this same file, so it inherits that row's reachability argument: a document is " +
      "surfaced only through its policy's placement, leaving it invisible until the third statement lands. " +
      "After that it is read identically by both revisions -- " +
      "apps/v1_api/src/terms/managed-terms-runtime.service.ts is unchanged across this release, so there is " +
      "no version skew in how the row is interpreted. INSERT only with ON CONFLICT (\"id\") DO NOTHING; no " +
      "existing document, content hash, or consent event is modified, so the forced-re-consent path (which " +
      "keys on a policy's document version changing) is never entered. Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
    statement: `INSERT INTO "v1_managed_terms_placements" ("id", "policy_id", "context", "requirement", "display_order", "is_active", "created_at", "updated_at") VALUES ( '7ef702a4-6289-4913-a31a-319de15bebd8', 'f772fb99-2671-4066-8874-54867ce0ecf4', 'tournament_application'::"V1ManagedTermsContext", 'optional'::"V1ManagedTermsRequirement", 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ) ON CONFLICT ("id") DO NOTHING`,
    reason:
      "Seeds the PLACEMENT that makes the two rows above visible in the tournament_application context. " +
      "This is the one statement here an old app instance can actually observe mid-rollout, and it is safe " +
      "in that window precisely because it is optional: both gates in managed-terms-runtime.service.ts that " +
      "can block a user (currentTournamentTerms' readiness check and assertTournamentAcceptances' " +
      "missingRequiredDocumentIds) filter on requirement === 'required', so an optional placement can " +
      "neither reject a registration nor force re-consent. An old instance simply renders one more optional " +
      "checkbox -- it is fully data-driven and already does exactly this for the sibling optional " +
      "tournament_media placement. display_order 4 appends after the four existing placements (0-2 " +
      "required, 3 tournament_media) instead of renumbering any of them, and ON CONFLICT (\"id\") DO NOTHING " +
      "makes a re-run a no-op. The one behavioural gap in a rollback window is that the old submit() does " +
      "not flip V1UserProfile.tournamentRealNameVisible, so a user who ticks the box while rolled back " +
      "stays at the column default of false: they keep being shown by nickname, which is the " +
      "under-disclosure (safe) direction rather than publishing a name nobody asked to publish, and they " +
      "can turn it on themselves at my > settings > tournament real-name once the new build is back. " +
      "Reviewed 2026-08-18.",
  },
];

const normalizeStatementText = (statement) => statement.replace(/\s+/g, ' ').trim();

function reviewedAcknowledgement(file, statement, reviewed) {
  return reviewed.find(
    (entry) => entry.file === file && normalizeStatementText(entry.statement) === normalizeStatementText(statement),
  );
}

const [baseSha, headSha] = process.argv.slice(2);
if (baseSha === '--self-test') {
  selfTest();
  process.exit(0);
}
for (const [label, sha] of [['base', baseSha], ['head', headSha]]) {
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) fail(`${label} SHA must be a full lowercase commit`);
}

runGit(['merge-base', '--is-ancestor', baseSha, headSha]);
const changes = runGit([
  'diff', '--name-status', '--find-renames', baseSha, headSha, '--',
  'apps/v1_api/prisma/migrations/*/migration.sql',
]).trim();
const addedFiles = [];
for (const line of changes.split('\n').filter(Boolean)) {
  const [status, file] = line.split('\t');
  if (status !== 'A') fail(`existing migration changed (${status}): ${file}`);
  addedFiles.push(file);
}

const statements = addedFiles.flatMap((file) => {
  const sql = runGit(['show', `${headSha}:${file}`]);
  try {
    return parseStatements(sql, file).map((statement) => ({ file, statement }));
  } catch (error) {
    if (error instanceof UnparsableSqlError) fail(error.message);
    throw error;
  }
});
const baseFunctionNames = collectBaseFunctionNames(baseSha);
runAdditivityCheck(statements, baseFunctionNames, fail);
console.log(`[expand-contract-sql-v1] ${baseSha} -> ${headSha} passed`);

// ─── dollar-quote / string aware statement splitter ────────────────────────
//
// The naive `sql.split(';')` approach breaks PL/pgSQL function bodies
// (`CREATE FUNCTION ... AS $$ ... ; ... $$`) into multiple garbage
// fragments at every semicolon *inside* the dollar-quoted body, which then
// fail every additive-statement pattern and get misreported as unsafe. This
// splitter treats `$$...$$` / `$tag$...$tag$` spans and `'...'` string
// literals as opaque so semicolons inside them are not treated as statement
// terminators.
function parseStatements(sql, source = 'migration SQL') {
  const stripped = sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
  const statements = [];
  let current = '';
  let i = 0;
  const n = stripped.length;
  while (i < n) {
    const dollarQuote = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(stripped.slice(i));
    if (dollarQuote) {
      const tag = dollarQuote[0];
      const closeAt = stripped.indexOf(tag, i + tag.length);
      // Never fall back to "consume to EOF". An unterminated delimiter would
      // silently swallow every following statement into this one, and the
      // additivity check would then judge one giant blob instead of the real
      // statements — a gate that reports "passed" while having inspected
      // almost nothing. Refuse to guess.
      if (closeAt === -1) {
        throw new UnparsableSqlError(`unterminated dollar-quoted block opened with ${tag} in ${source}`);
      }
      const end = closeAt + tag.length;
      current += stripped.slice(i, end);
      i = end;
      continue;
    }
    if (stripped[i] === "'") {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (stripped[j] === "'") {
          if (stripped[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          closed = true;
          break;
        }
        j += 1;
      }
      if (!closed) {
        throw new UnparsableSqlError(`unterminated string literal in ${source}`);
      }
      current += stripped.slice(i, j);
      i = j;
      continue;
    }
    if (stripped[i] === ';') {
      statements.push(current);
      current = '';
      i += 1;
      continue;
    }
    current += stripped[i];
    i += 1;
  }
  if (current.trim()) statements.push(current);
  return statements.map((statement) => statement.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// ─── identifier extraction (quote-normalized) ───────────────────────────────

function normalizeIdent(value) {
  return value ? value.toLowerCase().replace(/"/g, '') : value;
}

/**
 * `CREATE TABLE`이 만드는 테이블 이름. `IF NOT EXISTS`를 건너뛰지 않으면 그 키워드의
 * 첫 낱말(`IF`)을 테이블 이름으로 읽어, **이 마이그레이션이 방금 만든 테이블**을 기존
 * 테이블로 오인한다 — 그러면 그 새 테이블에 거는 UNIQUE INDEX·FK가 전부 non-additive로
 * 거부된다(2026-08-13 alpha 배포 차단의 실제 원인: v1_team_lineup_presets).
 */
function tableCreatedBy(statement) {
  return normalizeIdent(
    statement.match(
      /^CREATE TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i,
    )?.[1],
  );
}

function alteredTable(statement) {
  return normalizeIdent(
    statement.match(/^ALTER TABLE\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i)?.[1],
  );
}

function indexedTable(statement) {
  return normalizeIdent(
    statement.match(/\bON\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i)?.[1],
  );
}

function triggerTargetTable(statement) {
  const match = statement.match(
    /^CREATE(?:\s+CONSTRAINT)?\s+TRIGGER\s+\S+\s+(?:BEFORE|AFTER|INSTEAD OF)[\s\S]*?\bON\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i,
  );
  return normalizeIdent(match?.[1]);
}

function functionName(statement) {
  const match = statement.match(
    /^CREATE (?:OR REPLACE )?FUNCTION\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)\s*\(/i,
  );
  return normalizeIdent(match?.[1]);
}

// Splits the tail of a comma-separated clause list on top-level commas only
// (parens are not nested in any ADD COLUMN / index-column list this gate
// needs to parse, so a paren-depth counter is sufficient).
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

// Returns [{ column }] for every `ADD COLUMN <name> ...` clause in an ALTER
// TABLE statement that does NOT carry `NOT NULL` (i.e. genuinely nullable,
// matching the same safety bar the existing ADD COLUMN additive rule uses).
function addedNullableColumns(statement) {
  if (!/^ALTER TABLE\b/i.test(statement)) return [];
  const afterTable = statement.replace(/^ALTER TABLE\s+(?:"[^"]+"\.)?(?:"[^"]+"|[a-zA-Z_][\w$]*)\s*/i, '');
  const clauses = splitTopLevel(afterTable);
  const columns = [];
  for (const clause of clauses) {
    const match = clause.match(/^ADD COLUMN\s+(?:IF NOT EXISTS\s+)?("[^"]+"|[a-zA-Z_][\w$]*)([\s\S]*)$/i);
    if (!match) continue;
    const [, rawColumn, rest] = match;
    if (/\bNOT NULL\b/i.test(rest)) continue;
    columns.push(normalizeIdent(rawColumn));
  }
  return columns;
}

// Returns the column name for `ALTER TABLE T ALTER COLUMN C SET NOT NULL`.
function setNotNullColumn(statement) {
  const match = statement.match(
    /^ALTER TABLE\s+(?:"[^"]+"\.)?(?:"[^"]+"|[a-zA-Z_][\w$]*)\s+ALTER COLUMN\s+("[^"]+"|[a-zA-Z_][\w$]*)\s+SET NOT NULL\b/i,
  );
  return normalizeIdent(match?.[1]);
}

// Returns the referencing column list for `ADD CONSTRAINT ... FOREIGN KEY (a, b)`.
function foreignKeyColumns(statement) {
  const match = statement.match(/\bFOREIGN KEY\s*\(([^)]*)\)/i);
  if (!match) return [];
  return splitTopLevel(match[1]).map((column) => normalizeIdent(column.trim()));
}

// Returns the indexed column list for `CREATE UNIQUE INDEX name ON table(a, b)`.
function uniqueIndexColumns(statement) {
  const match = statement.match(/\bON\s+(?:"[^"]+"\.)?(?:"[^"]+"|[a-zA-Z_][\w$]*)\s*\(([^)]*)\)/i);
  if (!match) return [];
  return splitTopLevel(match[1]).map((column) => normalizeIdent(column.trim()));
}

// ─── base-state lookups ─────────────────────────────────────────────────────

// Every function name already defined by a migration that existed at
// baseSha. `CREATE (OR REPLACE) FUNCTION` is additive only when it does NOT
// redefine one of these — redefining a function an old, still-running app
// instance relies on is exactly the kind of non-additive change this gate
// exists to catch; defining a function whose name has never existed before
// this diff cannot break anything (nothing calls it yet).
function collectBaseFunctionNames(sha) {
  const files = runGit(['ls-tree', '-r', '--name-only', sha, '--', 'apps/v1_api/prisma/migrations'])
    .trim()
    .split('\n')
    .filter((file) => file.endsWith('/migration.sql'));
  const names = new Set();
  for (const file of files) {
    const sql = runGit(['show', `${sha}:${file}`]);
    let baseStatements;
    try {
      baseStatements = parseStatements(sql, `${file} (at base ${sha})`);
    } catch (error) {
      if (error instanceof UnparsableSqlError) fail(error.message);
      throw error;
    }
    for (const statement of baseStatements) {
      const name = functionName(statement);
      if (name) names.add(name);
    }
  }
  return names;
}

// ─── additivity ──────────────────────────────────────────────────────────────

function runAdditivityCheck(statements, baseFunctionNames, onFail, reviewed = REVIEWED_NON_ADDITIVE) {
  const newTables = new Set(
    statements.map(({ statement }) => tableCreatedBy(statement)).filter(Boolean),
  );
  // table -> Set(column) currently nullable *and* introduced within this same
  // diff, tracked sequentially in migration-application order so a later
  // `SET NOT NULL` on that column revokes its eligibility for the FK rule
  // below (matches real Postgres semantics: only a column that is still
  // nullable at the moment the FK is added lets legacy NULL-valued rows
  // bypass the constraint).
  const nullableNewColumnsByTable = new Map();
  const markNullable = (table, column) => {
    if (!nullableNewColumnsByTable.has(table)) nullableNewColumnsByTable.set(table, new Set());
    nullableNewColumnsByTable.get(table).add(column);
  };
  const clearNullable = (table, column) => {
    nullableNewColumnsByTable.get(table)?.delete(column);
  };

  for (const { file, statement } of statements) {
    if (!isAdditiveStatement(statement, { newTables, nullableNewColumnsByTable, baseFunctionNames })) {
      const acknowledged = reviewedAcknowledgement(file, statement, reviewed);
      if (acknowledged) {
        console.log(`[expand-contract-sql-v1] reviewed non-additive accepted in ${file}: ${acknowledged.reason}`);
      } else {
        onFail(`non-additive migration statement in ${file}: ${statement}`);
      }
    }
    // Statement-order-sensitive bookkeeping happens *after* the additivity
    // check so a statement is judged against the state that existed
    // immediately before it ran, not one that includes its own effect.
    if (/^ALTER TABLE\b/i.test(statement)) {
      const table = alteredTable(statement);
      for (const column of addedNullableColumns(statement)) markNullable(table, column);
      const notNulledColumn = setNotNullColumn(statement);
      if (notNulledColumn) clearNullable(table, notNulledColumn);
    }
  }
}

function isAdditiveStatement(statement, { newTables, nullableNewColumnsByTable, baseFunctionNames }) {
  if (/^(BEGIN|COMMIT)$/i.test(statement)) return true;
  if (/^CREATE (TABLE|TYPE|INDEX|EXTENSION|SEQUENCE)\b/i.test(statement)) return true;
  if (/^CREATE UNIQUE INDEX\b/i.test(statement)) {
    const table = indexedTable(statement);
    if (table === undefined) return false;
    if (newTables.has(table)) return true;
    const columns = uniqueIndexColumns(statement);
    // A unique index that includes the table's `id` primary key column is
    // trivially satisfied by every existing row (id already guarantees no
    // duplicate can exist in any superset of it) — safe on an existing
    // table regardless of legacy app awareness. This repo's schema
    // universally names its primary key column `id`.
    if (columns.includes('id')) return true;
    // A unique index whose ENTIRE column list is still nullable-and-newly-
    // added at this point in the diff (same eligibility test as the FK rule
    // below) is also additive: Postgres unique indexes never treat two NULLs
    // as colliding, and no pre-existing row can have a non-NULL value in a
    // column no old app instance has ever written to.
    const nullableColumns = nullableNewColumnsByTable.get(table);
    if (!nullableColumns) return false;
    return columns.length > 0 && columns.every((column) => nullableColumns.has(column));
  }
  if (/^COMMENT ON\b/i.test(statement)) return true;
  if (/^ALTER TYPE\b[\s\S]*\bADD VALUE\b/i.test(statement)) return true;
  if (/^CREATE (?:OR REPLACE )?FUNCTION\b/i.test(statement)) {
    const name = functionName(statement);
    return name !== undefined && !baseFunctionNames.has(name);
  }
  if (/^CREATE(?:\s+CONSTRAINT)?\s+TRIGGER\b/i.test(statement)) {
    const table = triggerTargetTable(statement);
    return table !== undefined && newTables.has(table);
  }
  if (/^ALTER TABLE\b[\s\S]*\bADD CONSTRAINT\b[\s\S]*\bFOREIGN KEY\b/i.test(statement)) {
    const table = alteredTable(statement);
    if (newTables.has(table)) return true;
    const nullableColumns = nullableNewColumnsByTable.get(table);
    if (!nullableColumns) return false;
    // Postgres FK checks use MATCH SIMPLE by default: a composite FK is
    // satisfied whenever *any* referencing column is NULL. A column this
    // same diff just added as nullable is guaranteed NULL for every
    // pre-existing row (no old app instance knows the column exists), so
    // attaching a FOREIGN KEY that includes it cannot reject legacy rows.
    return foreignKeyColumns(statement).some((column) => nullableColumns.has(column));
  }
  if (/^ALTER TABLE\b[\s\S]*\bADD CONSTRAINT\b/i.test(statement)) {
    return newTables.has(alteredTable(statement));
  }
  if (/^ALTER TABLE\b[\s\S]*\bADD COLUMN\b/i.test(statement)) {
    return !/\bNOT NULL\b/i.test(statement) || /\bDEFAULT\b/i.test(statement);
  }
  return false;
}

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 64 });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    fail(`git ${args.join(' ')} failed: ${details}`);
  }
}

function selfTest() {
  const safeSql = `
    CREATE TABLE "AssetRef" ("id" UUID NOT NULL);
    ALTER TABLE "AssetRef" ADD CONSTRAINT "AssetRef_pkey" PRIMARY KEY ("id");
    ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
    CREATE INDEX "AssetRef_id_idx" ON "AssetRef"("id");
    CREATE UNIQUE INDEX "User_id_avatar_key" ON "User"("id", "avatar");
    ALTER TABLE "User" ADD COLUMN "assetRefId" TEXT;
    ALTER TABLE "User" ADD CONSTRAINT "User_assetRefId_fkey" FOREIGN KEY ("assetRefId") REFERENCES "AssetRef"("id");
    ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
    CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
    CREATE TRIGGER "AssetRef_guard" BEFORE INSERT ON "AssetRef" FOR EACH ROW EXECUTE FUNCTION "asset_ref_guard"();
    CREATE OR REPLACE FUNCTION "asset_ref_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id IS NULL THEN
        RAISE EXCEPTION 'id required; semicolon inside a dollar-quoted body must not split the statement';
      END IF;
      RETURN NEW;
    END;
    $$;
    BEGIN;
    COMMIT;
  `;
  const safe = parseStatements(safeSql).map((statement) => ({ file: 'safe.sql', statement }));
  const baseFunctionNames = new Set(['legacy_guard']);
  const failures = [];
  runAdditivityCheck(safe, baseFunctionNames, (message) => failures.push(message));
  if (failures.length > 0) fail(`safe fixture rejected: ${failures.join(' | ')}`);
  if (parseStatements(safeSql).length !== 13) {
    fail(`dollar-quote-aware parser mis-split the safe fixture (expected 13 statements, got ${parseStatements(safeSql).length})`);
  }

  const unsafeCases = [
    // Pre-existing negative controls (must still reject).
    'ALTER TABLE "User" DROP COLUMN "name"',
    'DROP INDEX "user_idx"',
    'CREATE UNIQUE INDEX "User_email_key" ON "User"("email")',
    'ALTER TABLE "User" ADD CONSTRAINT "required_fk" FOREIGN KEY ("x") REFERENCES "X"("id")',
    'DELETE FROM "User"',
    'ALTER TABLE "User" ADD COLUMN "required" TEXT NOT NULL',
    // New negative controls for the rules added in this revision.
    'CREATE TRIGGER "user_guard" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION "user_guard_fn"()',
    'CREATE OR REPLACE FUNCTION "legacy_guard"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$',
  ];
  for (const statement of unsafeCases) {
    const failuresForCase = [];
    runAdditivityCheck([{ file: 'unsafe.sql', statement }], baseFunctionNames, (message) => failuresForCase.push(message));
    if (failuresForCase.length === 0) fail(`unsafe fixture accepted: ${statement}`);
  }

  // Negative controls for the splitter itself. An unterminated delimiter used
  // to be absorbed to EOF, which folds every following statement into one blob
  // — the additivity check then inspects that blob instead of the real
  // statements and can report "passed" having verified almost nothing. Both
  // shapes must stop the gate outright.
  const unparsableCases = [
    ['an unterminated dollar-quoted block', 'CREATE FUNCTION f() RETURNS trigger AS $$ BEGIN RETURN NEW; END;'],
    ['an unterminated string literal', "INSERT INTO \"User\" (\"name\") VALUES ('never closed;"],
  ];
  for (const [label, sql] of unparsableCases) {
    let refused = false;
    try {
      parseStatements(sql, 'selftest.sql');
    } catch (error) {
      refused = error instanceof UnparsableSqlError;
    }
    if (!refused) fail(`splitter swallowed ${label} instead of refusing to parse it`);
  }

  // A FK on an existing table's column is additive only while that column
  // is still nullable *at the point the FK statement runs* — an intervening
  // SET NOT NULL must revoke the exemption.
  const fkAfterNotNull = [
    { file: 'seq.sql', statement: 'ALTER TABLE "User" ADD COLUMN "planId" TEXT' },
    { file: 'seq.sql', statement: 'ALTER TABLE "User" ALTER COLUMN "planId" SET NOT NULL' },
    { file: 'seq.sql', statement: 'ALTER TABLE "User" ADD CONSTRAINT "User_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id")' },
  ];
  const fkAfterNotNullFailures = [];
  runAdditivityCheck(fkAfterNotNull, baseFunctionNames, (message) => fkAfterNotNullFailures.push(message));
  // Both the (always non-additive) SET NOT NULL and the FK that now targets
  // an already-required column must be rejected.
  if (
    fkAfterNotNullFailures.length !== 2 ||
    !fkAfterNotNullFailures.some((message) => message.includes('SET NOT NULL')) ||
    !fkAfterNotNullFailures.some((message) => message.includes('User_planId_fkey'))
  ) {
    fail('FK-after-SET-NOT-NULL must be rejected once nullability is revoked');
  }

  // A unique index on an existing table without the `id` column, and with no
  // preceding nullable ADD COLUMN for its own column(s) in this diff, must
  // still be rejected even when the table happens to be mentioned elsewhere.
  const uniqueIndexWithoutId = [
    { file: 'idx.sql', statement: 'CREATE UNIQUE INDEX "User_planId_key" ON "User"("planId")' },
  ];
  const uniqueIndexFailures = [];
  runAdditivityCheck(uniqueIndexWithoutId, baseFunctionNames, (message) => uniqueIndexFailures.push(message));
  if (uniqueIndexFailures.length !== 1) fail('unique index on existing table without id must be rejected');

  // A unique index on an existing table IS additive when its column was
  // added nullable earlier in the same diff (mirrors the FK rule above) —
  // and, symmetrically, an intervening SET NOT NULL must revoke that too.
  const uniqueIndexOnNullableNewColumn = [
    { file: 'idx2.sql', statement: 'ALTER TABLE "User" ADD COLUMN "referralCode" TEXT' },
    { file: 'idx2.sql', statement: 'CREATE UNIQUE INDEX "User_referralCode_key2" ON "User"("referralCode")' },
  ];
  const uniqueIndexOnNullableNewColumnFailures = [];
  runAdditivityCheck(
    uniqueIndexOnNullableNewColumn,
    baseFunctionNames,
    (message) => uniqueIndexOnNullableNewColumnFailures.push(message),
  );
  if (uniqueIndexOnNullableNewColumnFailures.length !== 0) {
    fail('unique index on a nullable-new column must be accepted');
  }
  const uniqueIndexAfterNotNull = [
    { file: 'idx3.sql', statement: 'ALTER TABLE "User" ADD COLUMN "referralCode" TEXT' },
    { file: 'idx3.sql', statement: 'ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL' },
    { file: 'idx3.sql', statement: 'CREATE UNIQUE INDEX "User_referralCode_key3" ON "User"("referralCode")' },
  ];
  const uniqueIndexAfterNotNullFailures = [];
  runAdditivityCheck(
    uniqueIndexAfterNotNull,
    baseFunctionNames,
    (message) => uniqueIndexAfterNotNullFailures.push(message),
  );
  if (
    uniqueIndexAfterNotNullFailures.length !== 2 ||
    !uniqueIndexAfterNotNullFailures.some((message) => message.includes('SET NOT NULL')) ||
    !uniqueIndexAfterNotNullFailures.some((message) => message.includes('User_referralCode_key3'))
  ) {
    fail('unique-index-after-SET-NOT-NULL must be rejected once nullability is revoked');
  }

  // The reviewed-non-additive escape hatch accepts EXACTLY one (file, statement)
  // pair and nothing else: a statement not on the list, the same statement in a
  // different file, and a different statement in the same file must all still be
  // rejected. Whitespace differences must not defeat the match.
  const reviewedAllow = [
    { file: 'reviewed.sql', statement: 'CREATE UNIQUE INDEX "X_a_b_key" ON "X"("a", "b")', reason: 'test' },
  ];
  const runReviewed = (input) => {
    const messages = [];
    runAdditivityCheck(input, baseFunctionNames, (message) => messages.push(message), reviewedAllow);
    return messages;
  };
  if (
    runReviewed([{ file: 'reviewed.sql', statement: 'CREATE UNIQUE INDEX  "X_a_b_key"  ON "X"("a", "b")' }]).length !== 0
  ) {
    fail('a reviewed-allowlisted non-additive statement must be accepted (whitespace-insensitively)');
  }
  if (runReviewed([{ file: 'reviewed.sql', statement: 'CREATE UNIQUE INDEX "X_c_key" ON "X"("c")' }]).length !== 1) {
    fail('a non-additive statement absent from the allowlist must still be rejected');
  }
  if (runReviewed([{ file: 'other.sql', statement: 'CREATE UNIQUE INDEX "X_a_b_key" ON "X"("a", "b")' }]).length !== 1) {
    fail('the allowlist must be scoped to its exact file, not match the same statement elsewhere');
  }

  console.log('[expand-contract-sql-v1] negative controls passed');
}

function fail(message) {
  console.error(`[expand-contract-sql-v1] ${message}`);
  process.exit(1);
}
