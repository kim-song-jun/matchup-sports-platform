#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 셀프테스트가 **자기 자신을 자식 프로세스로** 다시 띄울 때 쓰는 경로.
 *
 * `new URL(import.meta.url).pathname` 을 쓰면 안 된다 — 그건 **URL 경로**라 퍼센트
 * 인코딩돼 있어서, 저장소 경로에 공백이나 비ASCII 가 섞이면 파일시스템에 **존재하지 않는
 * 문자열**이 된다(실측: `has space/디렉터리` 아래에서 `existsSync(pathname) === false`,
 * `existsSync(fileURLToPath(...)) === true`). 그러면 셀프테스트가 조용히 못 돌거나
 * 엉뚱한 실패로 보인다.
 *
 * **위치가 중요하다** — 바로 위 주석대로 `selfTest()` 는 **모듈 평가 중에** 실행되므로,
 * 이 `const` 를 파일 아래쪽에 두면 그 시점엔 아직 TDZ 라 `ReferenceError` 가 난다. 그리고
 * `gateExits` 의 맨 `catch` 가 그걸 삼켜 **"게이트가 exit 1 했다"로 보인다**(실제로 이 PR
 * 작업 중에 그렇게 한 번 헛짚었다). 선언은 첫 사용보다 위, 여기에 둔다.
 */
const SELF_PATH = fileURLToPath(import.meta.url);

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
    file: 'apps/v1_api/prisma/migrations/20260821115900_v1_team_record_facts_played_at_compat/migration.sql',
    statement:
      "CREATE OR REPLACE FUNCTION v1_block_team_record_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'played_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'played_at') AND OLD.played_at IS NULL AND NEW.played_at IS NOT NULL THEN RETURN NEW; END IF; RAISE EXCEPTION 'team record facts are append-only' USING ERRCODE = '55000'; END $function$",
    reason:
      'Hotfix 2026-08-21. The existing append-only trigger remains installed and continues rejecting every DELETE and every UPDATE except a row-preserving NULL-to-value write of the newly introduced played_at field. Before that field exists, OLD.played_at fails closed; after the backfill, NOT NULL makes the exception unreachable. The following migration restores the original unconditional rejection. Reviewed after alpha exposed SQLSTATE 55000.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260821120100_v1_team_record_facts_played_at_relock/migration.sql',
    statement:
      "CREATE OR REPLACE FUNCTION v1_block_team_record_fact_mutation() RETURNS trigger LANGUAGE plpgsql AS $function$ BEGIN RAISE EXCEPTION 'team record facts are append-only' USING ERRCODE = '55000'; END $function$",
    reason:
      'Hotfix 2026-08-21. Restores the original unconditional append-only trigger function immediately after played_at becomes NOT NULL. It narrows permissions and mutates no data or schema shape. Reviewed after alpha exposed SQLSTATE 55000.',
  },
  // --- records played-at hotfix (2026-08-21) ---------------------------------
  {
    file: 'apps/v1_api/prisma/migrations/20260821120000_v1_team_record_facts_played_at/migration.sql',
    statement:
      'UPDATE "v1_team_record_facts" AS fact SET "played_at" = COALESCE(team_match."start_at", fixture."scheduled_at", fact."official_at") FROM "v1_games" AS game LEFT JOIN "v1_team_matches" AS team_match ON team_match."id" = game."team_match_id" LEFT JOIN "v1_tournament_fixtures" AS fixture ON fixture."id" = game."tournament_fixture_id" WHERE game."id" = fact."game_id"',
    reason:
      'Hotfix 2026-08-21. Backfills only the newly added played_at column from the immutable match source date, falling back to the existing official_at value. Old app instances neither select nor write this new column; new instances require it for team-record ordering. No pre-existing business column or result row is changed. Reviewed 2026-08-21.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260821120000_v1_team_record_facts_played_at/migration.sql',
    statement:
      'UPDATE "v1_team_record_facts" SET "played_at" = "official_at" WHERE "played_at" IS NULL',
    reason:
      'Hotfix 2026-08-21. Defensive completion of the new played_at column for malformed legacy source links only. It touches no pre-existing column, and guarantees the following NOT NULL constraint cannot reject an existing row. Old instances ignore the column. Reviewed 2026-08-21.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260821120000_v1_team_record_facts_played_at/migration.sql',
    statement:
      'ALTER TABLE "v1_team_record_facts" ALTER COLUMN "played_at" SET NOT NULL',
    reason:
      'Hotfix 2026-08-21. The two bounded backfills immediately above populate every existing row before this constraint is applied, while every new projection insert in the same release supplies played_at. Old instances do not insert team-record facts directly; projection writes are owned by the new service path. Reviewed 2026-08-21.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260821120000_v1_team_record_facts_played_at/migration.sql',
    statement: 'DROP INDEX IF EXISTS "v1_team_record_facts_team_official_at_idx"',
    reason:
      'Hotfix 2026-08-21. Replaces an ordering-only index after reads move from correction time to match time. Dropping it changes performance only; old queries remain semantically correct and PostgreSQL can execute them without the index during a rolling deploy. Reviewed 2026-08-21.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260821120000_v1_team_record_facts_played_at/migration.sql',
    statement: 'DROP INDEX IF EXISTS "v1_team_record_facts_team_tournament_idx"',
    reason:
      'Hotfix 2026-08-21. Replaces the tournament ordering index with the played_at equivalent created later in the same transaction. The old app retains correct query semantics if it overlaps the rollout; only its query plan may differ briefly. Reviewed 2026-08-21.',
  },
  // ── PR #563 v1_records_profile_integration_repair (2026-08-19) ──────────
  // 8 statements, reviewed 2026-08-20 after this migration blocked every alpha
  // deploy from 06:44. Two of them (DISABLE TRIGGER, DELETE) carry residual risk
  // that is named explicitly in their own reason rather than argued away.
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "WITH penalty_outcomes AS ( SELECT trf.id, CASE WHEN trf.team_id = gof.home_team_id THEN CASE WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int THEN 'WON' ELSE 'LOST' END ELSE CASE WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int THEN 'WON' ELSE 'LOST' END END AS repaired_result FROM v1_team_record_facts trf JOIN v1_game_official_facts gof ON gof.revision_id = trf.revision_id JOIN v1_games game ON game.id = trf.game_id AND game.current_official_revision_id = trf.revision_id WHERE gof.home_score = gof.away_score AND jsonb_typeof(COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) = 'object' AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'home') = 'number' AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'away') = 'number' AND ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int <> ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int ) UPDATE v1_team_record_facts trf SET result = penalty_outcomes.repaired_result FROM penalty_outcomes WHERE trf.id = penalty_outcomes.id AND trf.result IS DISTINCT FROM penalty_outcomes.repaired_result",
    reason:
      "PR #563. Repairs v1_team_record_facts.result for regulation draws decided by a shootout: the fact row said LOST/WON from the drawn regulation score while the official revision's penalties say otherwise. Rolling-deploy safe both ways — it mutates no schema, and the column an old instance reads simply becomes CORRECT (that is the defect being fixed, alpha-observed). Idempotent by construction: the WHERE ends with `trf.result IS DISTINCT FROM penalty_outcomes.repaired_result`, and the row set is bounded to `home_score = away_score` rows whose penalties object has two numeric, unequal sides. Goals-for/against are untouched — penalties only decide WON/LOST. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "CREATE TEMP TABLE v1_record_repair_identity_links ON COMMIT DROP AS SELECT participant.id AS participant_id, participant.user_id, gen_random_uuid()::text AS link_id FROM v1_game_participants participant WHERE participant.user_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM v1_participant_identity_link_current current_link WHERE current_link.participant_id = participant.id ) AND NOT EXISTS ( SELECT 1 FROM v1_participant_identity_link_events identity_event WHERE identity_event.participant_id = participant.id )",
    reason:
      "PR #563. `CREATE TEMP TABLE ... ON COMMIT DROP` — a session-local scratch table that no other connection can see and that Postgres drops at commit. It cannot affect a concurrently running old or new instance in either direction; the gate rejects it only because CREATE TEMP TABLE is not in its provably-additive list. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "INSERT INTO v1_participant_identity_link_events ( id, participant_id, link_id, event_version, request_id, action, user_id, effective_at, actor_type, actor_user_id, system_actor, reason, created_at ) SELECT gen_random_uuid()::text, participant_id, link_id, 1, link_id, 'ROSTER_ASSERTED'::\"V1IdentityLinkAction\", user_id, CURRENT_TIMESTAMP, 'SYSTEM'::\"V1IdentityActorType\", NULL, 'V1_RECORD_PROFILE_REPAIR', 'Backfill trusted roster participant identity for public record projection', CURRENT_TIMESTAMP FROM v1_record_repair_identity_links",
    reason:
      "PR #563. Appends ROSTER_ASSERTED identity-link EVENT rows for legacy tournament participants that predate automatic linking. Insert-only, and its source (the temp table above) already excludes any participant that has ANY existing identity event — so a revoked or disputed historical link is never recreated and no existing row is touched. An old instance reads one extra event row for a participant it already trusted; on rollback the rows are simply ignored. The gate rejects INSERT as a category because it cannot PROVE additivity, not because these rows are unsafe. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "INSERT INTO v1_participant_identity_link_current ( participant_id, link_id, user_id, version, effective_from, updated_at ) SELECT participant_id, link_id, user_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM v1_record_repair_identity_links ON CONFLICT (participant_id) DO NOTHING",
    reason:
      "PR #563. Materializes the current-link projection for exactly the participants seeded above, `ON CONFLICT (participant_id) DO NOTHING`. Insert-only with an explicit no-op on collision, so a participant that already has a current link keeps it untouched. Same rollback story as the event rows. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "ALTER TABLE v1_game_result_participants DISABLE TRIGGER v1_guard_result_participant_mutation",
    reason:
      "PR #563. `v1_guard_result_participant_mutation` rejects ANY insert/update/delete on v1_game_result_participants whose revision is not DRAFT (ERRCODE 55000). This repair by definition targets rows on OFFICIAL revisions, so the guard must be lifted for the two statements that follow and is restored immediately after (see the ENABLE entry). Scope is bounded by Postgres itself: ALTER TABLE takes ACCESS EXCLUSIVE, and Prisma runs a migration file in one transaction, so concurrent writers BLOCK rather than slip through the disabled window — no instance, old or new, can bypass the guard while it is off. RESIDUAL RISK, stated plainly: that same lock stalls live traffic touching this table for the duration of the repair. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "DELETE FROM v1_game_result_participants result_participant USING v1_game_result_revisions revision, v1_games game, v1_game_participants participant, v1_game_lineups lineup WHERE result_participant.result_revision_id = revision.id AND revision.id = game.current_official_revision_id AND game.source_type = 'TOURNAMENT_FIXTURE' AND result_participant.participant_id = participant.id AND participant.lineup_id = lineup.id AND EXISTS ( SELECT 1 FROM v1_game_lineups newer_lineup WHERE newer_lineup.game_id = lineup.game_id AND newer_lineup.side_id = lineup.side_id AND newer_lineup.revision > lineup.revision )",
    reason:
      "PR #563. Deletes appearance rows that hang off a SUPERSEDED lineup revision — the predicate requires `EXISTS (newer_lineup ... revision > lineup.revision)` for the same game+side, so every deleted row is provably orphaned by a later lineup and is re-derived by the backfill that follows. An old instance reading these rows was reading a stale roster; after the repair it reads the current one. RESIDUAL RISK, stated plainly: this is real, irreversible data removal, and its safety rests entirely on that superseded-lineup predicate being right. It is the single statement in this migration I would re-examine first if record counts look wrong after deploy. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "WITH reversed_events AS ( SELECT DISTINCT reverses_event_id AS event_id FROM v1_game_events WHERE reverses_event_id IS NOT NULL ), active_events AS ( SELECT event.* FROM v1_game_events event LEFT JOIN reversed_events reversed ON reversed.event_id = event.id WHERE reversed.event_id IS NULL ), appearance_rows AS ( SELECT revision.id AS result_revision_id, participant.id AS participant_id, participant.side_id, participant.started, participant.position, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'GOAL' AND event.participant_id = participant.id ) AS goals, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'GOAL' AND event.assist_participant_id = participant.id ) AS assists, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'FOUL' AND event.participant_id = participant.id ) AS fouls, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'CARD' AND event.participant_id = participant.id AND event.payload ->> 'card' IS DISTINCT FROM 'RED' ) AS yellow_cards, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'CARD' AND event.participant_id = participant.id AND event.payload ->> 'card' = 'RED' ) AS red_cards FROM v1_games game JOIN v1_game_result_revisions revision ON revision.id = game.current_official_revision_id AND revision.state = 'OFFICIAL' JOIN v1_game_participants participant ON participant.game_id = game.id JOIN v1_game_lineups lineup ON lineup.id = participant.lineup_id WHERE game.source_type = 'TOURNAMENT_FIXTURE' AND NOT EXISTS ( SELECT 1 FROM v1_game_lineups newer_lineup WHERE newer_lineup.game_id = lineup.game_id AND newer_lineup.side_id = lineup.side_id AND newer_lineup.revision > lineup.revision ) ), appeared AS ( SELECT row.* FROM appearance_rows row WHERE row.started OR row.goals > 0 OR row.assists > 0 OR row.fouls > 0 OR row.yellow_cards > 0 OR row.red_cards > 0 OR EXISTS ( SELECT 1 FROM active_events event JOIN v1_game_result_revisions revision ON revision.id = row.result_revision_id WHERE event.game_id = revision.game_id AND event.type = 'SUBSTITUTION' AND event.participant_id = row.participant_id ) ) INSERT INTO v1_game_result_participants ( id, result_revision_id, participant_id, side_id, started, minutes_played, goals, assists, fouls, cards, goalkeeper, created_at, updated_at ) SELECT gen_random_uuid()::text, appeared.result_revision_id, appeared.participant_id, appeared.side_id, appeared.started, NULL, appeared.goals, appeared.assists, appeared.fouls, jsonb_build_object('yellow', appeared.yellow_cards, 'red', appeared.red_cards), COALESCE(appeared.position IN ('GK', 'GOALKEEPER', 'GOLEIRO'), false), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM appeared ON CONFLICT (result_revision_id, participant_id) DO NOTHING",
    reason:
      "PR #563. Backfills the missing appearance rows for current OFFICIAL tournament revisions, mirroring deriveAppearedParticipantIds plus the stat-event safety net (started, or any goal/assist/foul/card/substitution, with reversed events excluded). `ON CONFLICT (result_revision_id, participant_id) DO NOTHING` so an existing row is never rewritten — this only ADDS the rows whose absence is the bug. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260819090000_v1_records_profile_integration_repair/migration.sql",
    statement:
      "ALTER TABLE v1_game_result_participants ENABLE TRIGGER v1_guard_result_participant_mutation",
    reason:
      "PR #563. Restores the guard disabled above, in the same transaction. If the migration fails at any point the transaction rolls back and the trigger is never left off — the disabled state cannot outlive this file. Reviewed 2026-08-20.",
  },
  // ── v1_records_repair_goalkeeper_null (2026-08-20) ──────────────────────
  // 바로 위 PR #563 마이그레이션을 **고쳐서 다시 수행하는** 파일이다. SQL 은 한 줄만 다르다
  // (`position IN (...)` → `COALESCE(..., false)`): nullable 인 position 이 NULL 이면 IN 이
  // NULL 을 돌려주고, 그 NULL 이 NOT NULL 인 goalkeeper 컬럼에 들어가 alpha 배포가 23502 로
  // 죽었다. 게이트가 기존 마이그레이션 수정을 금지하므로 새 파일로 앞으로 고친다.
  // 판정 근거는 아래 8개 각 항목에서 위 원본과 동일하다 — 같은 구문, 같은 위험, 같은 결론.
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "WITH penalty_outcomes AS ( SELECT trf.id, CASE WHEN trf.team_id = gof.home_team_id THEN CASE WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int THEN 'WON' ELSE 'LOST' END ELSE CASE WHEN ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int > ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int THEN 'WON' ELSE 'LOST' END END AS repaired_result FROM v1_team_record_facts trf JOIN v1_game_official_facts gof ON gof.revision_id = trf.revision_id JOIN v1_games game ON game.id = trf.game_id AND game.current_official_revision_id = trf.revision_id WHERE gof.home_score = gof.away_score AND jsonb_typeof(COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) = 'object' AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'home') = 'number' AND jsonb_typeof((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) -> 'away') = 'number' AND ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'home')::int <> ((COALESCE(gof.score -> 'penalties', gof.score -> 'penalty')) ->> 'away')::int ) UPDATE v1_team_record_facts trf SET result = penalty_outcomes.repaired_result FROM penalty_outcomes WHERE trf.id = penalty_outcomes.id AND trf.result IS DISTINCT FROM penalty_outcomes.repaired_result",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). Repairs v1_team_record_facts.result for regulation draws decided by a shootout: the fact row said LOST/WON from the drawn regulation score while the official revision's penalties say otherwise. Rolling-deploy safe both ways — it mutates no schema, and the column an old instance reads simply becomes CORRECT (that is the defect being fixed, alpha-observed). Idempotent by construction: the WHERE ends with `trf.result IS DISTINCT FROM penalty_outcomes.repaired_result`, and the row set is bounded to `home_score = away_score` rows whose penalties object has two numeric, unequal sides. Goals-for/against are untouched — penalties only decide WON/LOST. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "CREATE TEMP TABLE v1_record_repair_identity_links ON COMMIT DROP AS SELECT participant.id AS participant_id, participant.user_id, gen_random_uuid()::text AS link_id FROM v1_game_participants participant WHERE participant.user_id IS NOT NULL AND NOT EXISTS ( SELECT 1 FROM v1_participant_identity_link_current current_link WHERE current_link.participant_id = participant.id ) AND NOT EXISTS ( SELECT 1 FROM v1_participant_identity_link_events identity_event WHERE identity_event.participant_id = participant.id )",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). `CREATE TEMP TABLE ... ON COMMIT DROP` — a session-local scratch table that no other connection can see and that Postgres drops at commit. It cannot affect a concurrently running old or new instance in either direction; the gate rejects it only because CREATE TEMP TABLE is not in its provably-additive list. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "INSERT INTO v1_participant_identity_link_events ( id, participant_id, link_id, event_version, request_id, action, user_id, effective_at, actor_type, actor_user_id, system_actor, reason, created_at ) SELECT gen_random_uuid()::text, participant_id, link_id, 1, link_id, 'ROSTER_ASSERTED'::\"V1IdentityLinkAction\", user_id, CURRENT_TIMESTAMP, 'SYSTEM'::\"V1IdentityActorType\", NULL, 'V1_RECORD_PROFILE_REPAIR', 'Backfill trusted roster participant identity for public record projection', CURRENT_TIMESTAMP FROM v1_record_repair_identity_links",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). Appends ROSTER_ASSERTED identity-link EVENT rows for legacy tournament participants that predate automatic linking. Insert-only, and its source (the temp table above) already excludes any participant that has ANY existing identity event — so a revoked or disputed historical link is never recreated and no existing row is touched. An old instance reads one extra event row for a participant it already trusted; on rollback the rows are simply ignored. The gate rejects INSERT as a category because it cannot PROVE additivity, not because these rows are unsafe. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "INSERT INTO v1_participant_identity_link_current ( participant_id, link_id, user_id, version, effective_from, updated_at ) SELECT participant_id, link_id, user_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM v1_record_repair_identity_links ON CONFLICT (participant_id) DO NOTHING",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). Materializes the current-link projection for exactly the participants seeded above, `ON CONFLICT (participant_id) DO NOTHING`. Insert-only with an explicit no-op on collision, so a participant that already has a current link keeps it untouched. Same rollback story as the event rows. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "ALTER TABLE v1_game_result_participants DISABLE TRIGGER v1_guard_result_participant_mutation",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). `v1_guard_result_participant_mutation` rejects ANY insert/update/delete on v1_game_result_participants whose revision is not DRAFT (ERRCODE 55000). This repair by definition targets rows on OFFICIAL revisions, so the guard must be lifted for the two statements that follow and is restored immediately after (see the ENABLE entry). Scope is bounded by Postgres itself: ALTER TABLE takes ACCESS EXCLUSIVE, and Prisma runs a migration file in one transaction, so concurrent writers BLOCK rather than slip through the disabled window — no instance, old or new, can bypass the guard while it is off. RESIDUAL RISK, stated plainly: that same lock stalls live traffic touching this table for the duration of the repair. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "DELETE FROM v1_game_result_participants result_participant USING v1_game_result_revisions revision, v1_games game, v1_game_participants participant, v1_game_lineups lineup WHERE result_participant.result_revision_id = revision.id AND revision.id = game.current_official_revision_id AND game.source_type = 'TOURNAMENT_FIXTURE' AND result_participant.participant_id = participant.id AND participant.lineup_id = lineup.id AND EXISTS ( SELECT 1 FROM v1_game_lineups newer_lineup WHERE newer_lineup.game_id = lineup.game_id AND newer_lineup.side_id = lineup.side_id AND newer_lineup.revision > lineup.revision )",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). Deletes appearance rows that hang off a SUPERSEDED lineup revision — the predicate requires `EXISTS (newer_lineup ... revision > lineup.revision)` for the same game+side, so every deleted row is provably orphaned by a later lineup and is re-derived by the backfill that follows. An old instance reading these rows was reading a stale roster; after the repair it reads the current one. RESIDUAL RISK, stated plainly: this is real, irreversible data removal, and its safety rests entirely on that superseded-lineup predicate being right. It is the single statement in this migration I would re-examine first if record counts look wrong after deploy. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "WITH reversed_events AS ( SELECT DISTINCT reverses_event_id AS event_id FROM v1_game_events WHERE reverses_event_id IS NOT NULL ), active_events AS ( SELECT event.* FROM v1_game_events event LEFT JOIN reversed_events reversed ON reversed.event_id = event.id WHERE reversed.event_id IS NULL ), appearance_rows AS ( SELECT revision.id AS result_revision_id, participant.id AS participant_id, participant.side_id, participant.started, participant.position, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'GOAL' AND event.participant_id = participant.id ) AS goals, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'GOAL' AND event.assist_participant_id = participant.id ) AS assists, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'FOUL' AND event.participant_id = participant.id ) AS fouls, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'CARD' AND event.participant_id = participant.id AND event.payload ->> 'card' IS DISTINCT FROM 'RED' ) AS yellow_cards, ( SELECT COUNT(*)::int FROM active_events event WHERE event.game_id = game.id AND event.type = 'CARD' AND event.participant_id = participant.id AND event.payload ->> 'card' = 'RED' ) AS red_cards FROM v1_games game JOIN v1_game_result_revisions revision ON revision.id = game.current_official_revision_id AND revision.state = 'OFFICIAL' JOIN v1_game_participants participant ON participant.game_id = game.id JOIN v1_game_lineups lineup ON lineup.id = participant.lineup_id WHERE game.source_type = 'TOURNAMENT_FIXTURE' AND NOT EXISTS ( SELECT 1 FROM v1_game_lineups newer_lineup WHERE newer_lineup.game_id = lineup.game_id AND newer_lineup.side_id = lineup.side_id AND newer_lineup.revision > lineup.revision ) ), appeared AS ( SELECT row.* FROM appearance_rows row WHERE row.started OR row.goals > 0 OR row.assists > 0 OR row.fouls > 0 OR row.yellow_cards > 0 OR row.red_cards > 0 OR EXISTS ( SELECT 1 FROM active_events event JOIN v1_game_result_revisions revision ON revision.id = row.result_revision_id WHERE event.game_id = revision.game_id AND event.type = 'SUBSTITUTION' AND event.participant_id = row.participant_id ) ) INSERT INTO v1_game_result_participants ( id, result_revision_id, participant_id, side_id, started, minutes_played, goals, assists, fouls, cards, goalkeeper, created_at, updated_at ) SELECT gen_random_uuid()::text, appeared.result_revision_id, appeared.participant_id, appeared.side_id, appeared.started, NULL, appeared.goals, appeared.assists, appeared.fouls, jsonb_build_object('yellow', appeared.yellow_cards, 'red', appeared.red_cards), COALESCE(appeared.position IN ('GK', 'GOALKEEPER', 'GOLEIRO'), false), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM appeared ON CONFLICT (result_revision_id, participant_id) DO NOTHING",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). Backfills the missing appearance rows for current OFFICIAL tournament revisions, mirroring deriveAppearedParticipantIds plus the stat-event safety net (started, or any goal/assist/foul/card/substitution, with reversed events excluded). `ON CONFLICT (result_revision_id, participant_id) DO NOTHING` so an existing row is never rewritten — this only ADDS the rows whose absence is the bug. Reviewed 2026-08-20.",
  },
  {
    file: "apps/v1_api/prisma/migrations/20260820190000_v1_records_repair_goalkeeper_null/migration.sql",
    statement:
      "ALTER TABLE v1_game_result_participants ENABLE TRIGGER v1_guard_result_participant_mutation",
    reason:
      "PR #563 재수행(#600 이후 alpha 차단 복구). Restores the guard disabled above, in the same transaction. If the migration fails at any point the transaction rolls back and the trigger is never left off — the disabled state cannot outlive this file. Reviewed 2026-08-20.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
    statement:
      "INSERT INTO \"v1_managed_terms_placements\" (\"id\", \"policy_id\", \"context\", \"requirement\", \"display_order\", \"is_active\", \"created_at\", \"updated_at\") VALUES ( '7ef702a4-6289-4913-a31a-319de15bebd8', 'f772fb99-2671-4066-8874-54867ce0ecf4', 'tournament_application'::\"V1ManagedTermsContext\", 'optional'::\"V1ManagedTermsRequirement\", 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ) ON CONFLICT (\"id\") DO NOTHING",
    reason:
      "Seeds the tournament_application PLACEMENT that binds the policy above, explicitly as requirement='optional' (PR #516). This is the row that makes the other two safe: optional placements are excluded from assertTournamentAcceptances()'s missingRequiredDocumentIds, so neither a new nor an old instance can require it. One new row, ON CONFLICT DO NOTHING, no existing row touched. Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
    statement:
      "INSERT INTO \"v1_managed_terms_documents\" (\"id\", \"policy_id\", \"version\", \"title\", \"content\", \"content_hash\", \"change_summary\", \"requires_reconsent\", \"status\", \"effective_at\", \"published_at\", \"created_at\", \"updated_at\") VALUES ( '86b39028-bd47-4a4e-9c09-6a4c71c34df6', 'f772fb99-2671-4066-8874-54867ce0ecf4', 'v1.1', '\ub300\ud68c \uacbd\uae30 \uae30\ub85d \uacf5\uac1c \ub3d9\uc758', $terms$\ubcf8\uc778\uc740 \ud300\ubc0b \ub300\ud68c \uacbd\uae30 \uae30\ub85d(\ub77c\uc778\uc5c5, \ub4dd\uc810\u00b7\uc5b4\uc2dc\uc2a4\ud2b8 \ub4f1 \uc774\ubca4\ud2b8 \uae30\ub85d, MVP \ub4f1)\uc5d0 \ub2c9\ub124\uc784 \ub300\uc2e0 \uc2e4\uba85\uc774 \ud45c\uc2dc\ub418\ub294 \uac83\uc5d0 \ub3d9\uc758\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4. \uc774 \ub3d9\uc758\ub294 \uc120\ud0dd \uc0ac\ud56d\uc774\uba70, \ub3d9\uc758\ud558\uc9c0 \uc54a\uc544\ub3c4 \ub300\ud68c \uc2e0\uccad \ubc0f \ucc38\uac00\uc5d0\ub294 \uc5b4\ub5a0\ud55c \uc81c\ud55c\ub3c4 \uc5c6\uc2b5\ub2c8\ub2e4. 1. \uacf5\uac1c \ud56d\ubaa9 \uc774\ub984, \ub4f1\ubc88\ud638, \ud3ec\uc9c0\uc158, \uc18c\uc18d \ud300\uba85, \uacbd\uae30\ubcc4 \uae30\ub85d(\ucd9c\uc804\u00b7\ub4dd\uc810\u00b7\uc5b4\uc2dc\uc2a4\ud2b8\u00b7\uacbd\uace0\u00b7\ud1f4\uc7a5\u00b7MVP \ub4f1) 2. \uacf5\uac1c \ubaa9\uc801 \ub300\ud68c \uacbd\uae30 \uae30\ub85d \ubc0f \ucc38\uac00 \uba85\ub2e8\uc744 \ud300\ubc0b \uc11c\ube44\uc2a4 \ub0b4\uc5d0\uc11c \uacf5\uac1c \uac8c\uc2dc\ud558\uae30 \uc704\ud55c \ubaa9\uc801\uc73c\ub85c \uc774\uc6a9\ud569\ub2c8\ub2e4. 3. \uacf5\uac1c \uc704\uce58 \ud300\ubc0b \uc11c\ube44\uc2a4 \ub0b4 \ub300\ud68c \uae30\ub85d, \uc21c\uc704\ud45c, \uc120\uc218 \uae30\ub85d \ud654\uba74 4. \uacf5\uac1c \uae30\uac04 \ub3d9\uc758 \uc2dc\uc810\ubd80\ud130 \ubcf8\uc778\uc774 \ucca0\ud68c\ud558\uae30 \uc804\uae4c\uc9c0 \uacc4\uc18d \uacf5\uac1c\ub429\ub2c8\ub2e4. \ucca0\ud68c \ud6c4\uc5d0\ub294 \ubcc4\ub3c4 \uc694\uccad \uc5c6\uc774 \uc989\uc2dc \ub2c9\ub124\uc784 \ud45c\uc2dc\ub85c \uc804\ud658\ub429\ub2c8\ub2e4. 5. \ub3d9\uc758 \uac70\ubd80 \ubc0f \ucca0\ud68c \uc548\ub0b4 \ubcf8 \ub3d9\uc758\ub294 \uc120\ud0dd \uc0ac\ud56d\uc785\ub2c8\ub2e4. \ub3d9\uc758\ud558\uc9c0 \uc54a\uc544\ub3c4 \ub300\ud68c \uc2e0\uccad \ubc0f \ucc38\uac00\uc5d0\ub294 \uc81c\ud55c\uc774 \uc5c6\uc73c\uba70, \uc774 \uacbd\uc6b0 \uacbd\uae30 \uae30\ub85d\uc5d0\ub294 \ub2c9\ub124\uc784\uc774 \ud45c\uc2dc\ub429\ub2c8\ub2e4. \uc774\ubbf8 \ub3d9\uc758\ud55c \uacbd\uc6b0\uc5d0\ub3c4 \ub9c8\uc774\ud398\uc774\uc9c0 > \uc124\uc815 > \ub300\ud68c \uae30\ub85d \uc2e4\uba85 \ud45c\uc2dc\uc5d0\uc11c \uc5b8\uc81c\ub4e0\uc9c0 \ucca0\ud68c\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4. 6. \uc720\uc758\uc0ac\ud56d \ud68c\uc0ac\ub294 \uacf5\uac1c\ub41c \uacbd\uae30 \uae30\ub85d\uc744 \ub300\ud68c \uc6b4\uc601, \uae30\ub85d \uac8c\uc2dc, \uc11c\ube44\uc2a4 \uc81c\uacf5 \ubaa9\uc801 \ubc94\uc704 \ub0b4\uc5d0\uc11c\ub9cc \uc0ac\uc6a9\ud569\ub2c8\ub2e4. \ubcf8\uc778\uc740 \uc704 \ub0b4\uc6a9\uc744 \ud655\uc778\ud558\uc600\uc73c\uba70 \ub300\ud68c \uacbd\uae30 \uae30\ub85d \uacf5\uac1c(\uc2e4\uba85 \ud45c\uc2dc)\uc5d0 \ub3d9\uc758\ud569\ub2c8\ub2e4. \ud68c\uc0ac\uba85: \uc544\uc774\uc704(IWI) \ub300\ud45c\uc790: \uae40\ubd09\ubaa9 \uc774\uba54\uc77c: teameetsports@naver.com \uc2dc\ud589\uc77c: 2026\ub144 8\uc6d4 18\uc77c$terms$, 'b0527fa26264263b1ed78388472df50499c9e2cb0730ff0a3d28e090f278e65a', '\ub300\ud68c \uacbd\uae30 \uae30\ub85d(\ub77c\uc778\uc5c5/\ub4dd\uc810/MVP \ub4f1)\uc5d0 \uc2e4\uba85 \ud45c\uc2dc\ub97c \uc120\ud0dd\uc801\uc73c\ub85c \ub3d9\uc758\ubc1b\uae30 \uc704\ud55c \uc2e0\uaddc \uc815\ucc45 \ucd5c\ucd08 \ubc1c\ud589', true, 'published'::\"V1TermsDocumentStatus\", '2026-08-18T00:00:00.000Z'::timestamptz, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP ) ON CONFLICT (\"id\") DO NOTHING",
    reason:
      "Seeds the v1.1 consent DOCUMENT for that same optional policy (PR #516). Same reasoning as the policy row: one new row, ON CONFLICT DO NOTHING, nothing existing modified. Because its policy's placement is optional it never enters the required-terms set an older instance computes, so it cannot trigger forced re-consent, and tournament_privacy stays at v1.1 untouched. Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818090000_v1_tournament_record_disclosure_consent/migration.sql',
    statement:
      "INSERT INTO \"v1_managed_terms_policies\" (\"id\", \"code\", \"name\", \"is_active\", \"created_at\", \"updated_at\") VALUES ('f772fb99-2671-4066-8874-54867ce0ecf4', 'tournament_record_disclosure', '\ub300\ud68c \uacbd\uae30 \uae30\ub85d \uacf5\uac1c \ub3d9\uc758', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (\"id\") DO NOTHING",
    reason:
      "Seeds the new OPTIONAL 'tournament_record_disclosure' consent POLICY row (PR #516). Rolling-deploy safe both ways: it only INSERTs a brand-new row with ON CONFLICT DO NOTHING and touches no existing row, and its placement is requirement='optional', so ManagedTermsRuntimeService.currentTournamentTerms() leaves it out of missingRequiredDocumentIds. An older instance therefore sees no new required term and blocks no registration; on rollback the row is simply ignored. The gate rejects INSERT as a category because it cannot PROVE additivity, not because this row is unsafe. Reviewed 2026-08-18.",
  },
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
  {
    file: 'apps/v1_api/prisma/migrations/20260818120000_v1_league_expand/migration.sql',
    statement: `INSERT INTO "v1_leagues" ( "id", "title", "sport_id", "region_id", "created_by_admin_user_id", "starts_on", "ends_on", "tie_break_json", "state", "created_at", "updated_at" ) SELECT s."id", s."title", s."sport_id", s."region_id", s."created_by_admin_user_id", s."starts_on", s."ends_on", s."tie_break_json", s."state"::text::"V1LeagueState", s."created_at", s."updated_at" FROM "v1_team_match_series" s ON CONFLICT ("id") DO NOTHING`,
    reason:
      "Copies existing rows from v1_team_match_series into the newly created v1_leagues table -- the expand " +
      "half of a two-release rename (2026-08-18 user decision: expand-contract, zero downtime). It writes " +
      "only to a table this same migration creates three statements earlier, so no deployed revision -- old " +
      "or new -- can observe it as a change: the old app has never heard of v1_leagues, and the new app " +
      "finds it already populated. The source table is left completely untouched and keeps serving old " +
      "containers through the rolling window. Row ids are carried over verbatim rather than regenerated, so " +
      "v1_team_matches.series_id and .league_id always point at the same league and no id-mapping table is " +
      "needed. INSERT ... SELECT with ON CONFLICT (\"id\") DO NOTHING, so a re-run is a no-op. Why a straight " +
      "RENAME was rejected instead: deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it " +
      "recreates the containers (line 288), with seeds and standings recalculation in between -- renaming " +
      "in place would leave old containers querying a table that no longer exists for that whole span. " +
      "Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818120000_v1_league_expand/migration.sql',
    statement: `INSERT INTO "v1_league_teams" ("id", "league_id", "team_id", "created_at") SELECT t."id", t."series_id", t."team_id", t."created_at" FROM "v1_team_match_series_teams" t ON CONFLICT ("id") DO NOTHING`,
    reason:
      "Same expand-half copy for the join table: v1_team_match_series_teams -> v1_league_teams, into a " +
      "table created by this same migration. Carries ids over verbatim for the same reason as the parent " +
      "copy, and maps the old series_id column onto the new league_id column. The source table is " +
      "untouched. ON CONFLICT (\"id\") DO NOTHING makes a re-run a no-op. Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818120000_v1_league_expand/migration.sql',
    statement: `UPDATE "v1_team_matches" SET "league_id" = "series_id" WHERE "series_id" IS NOT NULL AND "league_id" IS NULL`,
    reason:
      "Backfills the new v1_team_matches.league_id column that this same migration adds, from the existing " +
      "series_id. This is the one statement that touches a pre-existing table, and it is safe in the " +
      "rolling window for two reasons: it only writes the brand-new column (WHERE league_id IS NULL), so no " +
      "column any deployed revision reads is modified, and series_id -- which old containers do read -- is " +
      "left exactly as it was. Since ids were carried over by the two copies above, league_id ends up " +
      "holding the identical value as series_id, so the two columns can never disagree about which league a " +
      "match belongs to during the window. Re-running is a no-op because of the IS NULL guard. The " +
      "contract-phase release drops series_id once no old container remains. Reviewed 2026-08-18.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818160000_v1_team_record_facts_penalty_result/migration.sql',
    statement: 'ALTER TABLE v1_team_record_facts DISABLE TRIGGER v1_block_team_record_fact_mutation',
    reason:
      'Turns off the append-only guard trigger for the duration of THIS migration transaction only; the ' +
      'matching ENABLE runs a few statements later in the same transaction, so a failure rolls the disable ' +
      'back with everything else and no window exists where a running app can mutate the table unguarded ' +
      '(ALTER TABLE takes ACCESS EXCLUSIVE, so concurrent writers are blocked, not merely unguarded). Same ' +
      'device and same reason as 20260813200000_v1_appearance_gate_backfill, which disables ' +
      'v1_guard_result_participant_mutation to backfill the sibling facts table. The gate rejects ALTER ' +
      'TABLE ... DISABLE TRIGGER as a category because it cannot prove additivity, not because this pair is ' +
      'unsafe. Reviewed 2026-08-19.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818160000_v1_team_record_facts_penalty_result/migration.sql',
    statement: 'ALTER TABLE v1_team_record_facts ENABLE TRIGGER v1_block_team_record_fact_mutation',
    reason:
      'Restores the guard disabled above, in the same transaction. Strictly a RE-tightening: it returns the ' +
      'table to exactly the state every deployed revision expects, so neither a rolling deploy nor a ' +
      'rollback can observe a difference. Reviewed 2026-08-19.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260818160000_v1_team_record_facts_penalty_result/migration.sql',
    statement:
      "WITH penalty_scores AS ( SELECT trf.id AS fact_id, side.side_key AS team_side_key, COALESCE(rev.score -> 'penalties', rev.score -> 'penalty') AS penalty_json FROM v1_team_record_facts trf JOIN v1_game_result_revisions rev ON rev.id = trf.revision_id JOIN v1_game_sides side ON side.game_id = trf.game_id AND side.team_id = trf.team_id WHERE trf.result = 'DRAWN' ), decided AS ( SELECT fact_id, CASE WHEN team_side_key = 'HOME' THEN (penalty_json ->> 'home')::int ELSE (penalty_json ->> 'away')::int END AS penalties_for, CASE WHEN team_side_key = 'HOME' THEN (penalty_json ->> 'away')::int ELSE (penalty_json ->> 'home')::int END AS penalties_against FROM penalty_scores WHERE penalty_json IS NOT NULL AND jsonb_typeof(penalty_json -> 'home') = 'number' AND jsonb_typeof(penalty_json -> 'away') = 'number' ) UPDATE v1_team_record_facts trf SET result = CASE WHEN decided.penalties_for > decided.penalties_against THEN 'WON' ELSE 'LOST' END FROM decided WHERE trf.id = decided.fact_id AND decided.penalties_for <> decided.penalties_against",
    reason:
      'Corrects rows that were recorded wrong: a knockout decided on penalties was stored as DRAWN because ' +
      'the projection only looked at the regulation score (production: a final at 1:1 with penalties 2:3 ' +
      'showed "draw" for BOTH teams). Rolling-deploy safe in both directions. Old instances only ever ' +
      'INSERT into this table (GameResultOfficialFactsService.project, ON CONFLICT DO NOTHING) — they never ' +
      'UPDATE or DELETE a row, so this cannot race a writer. On the read side both old and new code render ' +
      'the same column as 승/무/패; the corrected value is the factually right one, so a rollback leaves ' +
      'the data MORE accurate than before, not broken. The one cosmetic difference while rolled back: the ' +
      'old UI has no "승부차기 N-M" line, so such a row reads as "승" next to a 1:1 scoreline without the ' +
      'explanation — a missing annotation, not a wrong result, and it disappears once rolled forward again. ' +
      'goals_for/goals_against are deliberately untouched (regulation score is the record). Re-running is a ' +
      "no-op: the WHERE clause only selects result = 'DRAWN', which an already-corrected row no longer is. " +
      'The gate rejects UPDATE as a category because it cannot prove additivity. Reviewed 2026-08-19.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260819100000_v1_league_contract/migration.sql',
    statement: `ALTER TABLE "v1_team_matches" DROP CONSTRAINT IF EXISTS "v1_team_matches_series_fk"`,
    reason:
      "This is the contract half of the two-release league rename whose expand half shipped in " +
      "20260818120000_v1_league_expand (2026-08-18 user decision: expand-contract, zero downtime). The gate " +
      "rejects it because dropping is never provably additive, which is exactly right for a rename done in " +
      "ONE release -- deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it recreates containers " +
      "(line 289), so a same-release drop would leave old containers reading a column that no longer exists " +
      "for that whole span. That is not the situation here: the expand release is already deployed and " +
      "every running container reads only the new names. Verified by exhaustive grep on dev before writing " +
      "this migration -- raw SQL referencing v1_team_match_series or team_match.series_id: 0; Prisma code " +
      "READING the legacy models: 0; tests using them: 0. The only remaining references were the " +
      "expand-phase dual writes, removed in this same release. Drops the FK first because the column it " +
      "constrains cannot be dropped while it exists. Removing a constraint only RELAXES the schema, so no " +
      "running instance can be tripped by it. Reviewed 2026-08-19.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260819100000_v1_league_contract/migration.sql',
    statement: `DROP INDEX IF EXISTS "v1_team_matches_series_start_at_idx"`,
    reason:
      "This is the contract half of the two-release league rename whose expand half shipped in " +
      "20260818120000_v1_league_expand (2026-08-18 user decision: expand-contract, zero downtime). The gate " +
      "rejects it because dropping is never provably additive, which is exactly right for a rename done in " +
      "ONE release -- deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it recreates containers " +
      "(line 289), so a same-release drop would leave old containers reading a column that no longer exists " +
      "for that whole span. That is not the situation here: the expand release is already deployed and " +
      "every running container reads only the new names. Verified by exhaustive grep on dev before writing " +
      "this migration -- raw SQL referencing v1_team_match_series or team_match.series_id: 0; Prisma code " +
      "READING the legacy models: 0; tests using them: 0. The only remaining references were the " +
      "expand-phase dual writes, removed in this same release. Drops the index on (series_id, start_at). An " +
      "index is pure read acceleration -- no query depends on it for correctness, and nothing reads " +
      "series_id any more. Reviewed 2026-08-19.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260819100000_v1_league_contract/migration.sql',
    statement: `ALTER TABLE "v1_team_matches" DROP COLUMN IF EXISTS "series_id"`,
    reason:
      "This is the contract half of the two-release league rename whose expand half shipped in " +
      "20260818120000_v1_league_expand (2026-08-18 user decision: expand-contract, zero downtime). The gate " +
      "rejects it because dropping is never provably additive, which is exactly right for a rename done in " +
      "ONE release -- deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it recreates containers " +
      "(line 289), so a same-release drop would leave old containers reading a column that no longer exists " +
      "for that whole span. That is not the situation here: the expand release is already deployed and " +
      "every running container reads only the new names. Verified by exhaustive grep on dev before writing " +
      "this migration -- raw SQL referencing v1_team_match_series or team_match.series_id: 0; Prisma code " +
      "READING the legacy models: 0; tests using them: 0. The only remaining references were the " +
      "expand-phase dual writes, removed in this same release. Drops v1_team_matches.series_id. Its data is " +
      "not lost: the expand migration copied it into league_id carrying the SAME ids, and every write since " +
      "then set both columns to the same value (the dual write removed in this release), so league_id is a " +
      "complete and identical replacement. Reviewed 2026-08-19.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260819100000_v1_league_contract/migration.sql',
    statement: `DROP TABLE IF EXISTS "v1_team_match_series_teams"`,
    reason:
      "This is the contract half of the two-release league rename whose expand half shipped in " +
      "20260818120000_v1_league_expand (2026-08-18 user decision: expand-contract, zero downtime). The gate " +
      "rejects it because dropping is never provably additive, which is exactly right for a rename done in " +
      "ONE release -- deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it recreates containers " +
      "(line 289), so a same-release drop would leave old containers reading a column that no longer exists " +
      "for that whole span. That is not the situation here: the expand release is already deployed and " +
      "every running container reads only the new names. Verified by exhaustive grep on dev before writing " +
      "this migration -- raw SQL referencing v1_team_match_series or team_match.series_id: 0; Prisma code " +
      "READING the legacy models: 0; tests using them: 0. The only remaining references were the " +
      "expand-phase dual writes, removed in this same release. Drops the join table. Dropped before its " +
      "parent because it holds the FK pointing at it. Its rows were copied id-for-id into v1_league_teams " +
      "by the expand migration. Reviewed 2026-08-19.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260819100000_v1_league_contract/migration.sql',
    statement: `DROP TABLE IF EXISTS "v1_team_match_series"`,
    reason:
      "This is the contract half of the two-release league rename whose expand half shipped in " +
      "20260818120000_v1_league_expand (2026-08-18 user decision: expand-contract, zero downtime). The gate " +
      "rejects it because dropping is never provably additive, which is exactly right for a rename done in " +
      "ONE release -- deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it recreates containers " +
      "(line 289), so a same-release drop would leave old containers reading a column that no longer exists " +
      "for that whole span. That is not the situation here: the expand release is already deployed and " +
      "every running container reads only the new names. Verified by exhaustive grep on dev before writing " +
      "this migration -- raw SQL referencing v1_team_match_series or team_match.series_id: 0; Prisma code " +
      "READING the legacy models: 0; tests using them: 0. The only remaining references were the " +
      "expand-phase dual writes, removed in this same release. Drops the legacy league table. Its rows were " +
      "copied id-for-id into v1_leagues by the expand migration and kept in sync afterwards by " +
      "mirrorLeagueToLegacy, so what is dropped here is a mirror, not an original. Reviewed 2026-08-19.",
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260819100000_v1_league_contract/migration.sql',
    statement: `DROP TYPE IF EXISTS "V1TeamMatchSeriesState"`,
    reason:
      "This is the contract half of the two-release league rename whose expand half shipped in " +
      "20260818120000_v1_league_expand (2026-08-18 user decision: expand-contract, zero downtime). The gate " +
      "rejects it because dropping is never provably additive, which is exactly right for a rename done in " +
      "ONE release -- deploy-alpha.sh runs prisma migrate deploy (line 246) BEFORE it recreates containers " +
      "(line 289), so a same-release drop would leave old containers reading a column that no longer exists " +
      "for that whole span. That is not the situation here: the expand release is already deployed and " +
      "every running container reads only the new names. Verified by exhaustive grep on dev before writing " +
      "this migration -- raw SQL referencing v1_team_match_series or team_match.series_id: 0; Prisma code " +
      "READING the legacy models: 0; tests using them: 0. The only remaining references were the " +
      "expand-phase dual writes, removed in this same release. Drops the now-unreferenced enum type. Its " +
      "only users were the two tables dropped just above, so this cannot affect anything still in the " +
      "schema. Reviewed 2026-08-19.",
  },
  // ── PR #627 v1_team_contacts (2026-08-21) ───────────────────────────────
  // 링크 대상 CHECK 제약에 새 컬럼을 편입하는 DROP+재생성 쌍의 앞 절반.
  {
    file: 'apps/v1_api/prisma/migrations/20260821000000_v1_team_contacts/migration.sql',
    statement: `ALTER TABLE "v1_chat_rooms" DROP CONSTRAINT IF EXISTS "v1_chat_rooms_exactly_one_target_check"`,
    reason:
      'v1_chat_rooms 의 "링크 대상은 정확히 하나" CHECK 를 team_contact_id 까지 포함하도록 넓히는 ' +
      'DROP + 즉시 재생성 쌍의 앞 절반이다. 게이트가 막는 이유는 DROP 이 결코 provably additive 하지 ' +
      '않기 때문인데, 실제로 일어나는 일은 제약의 **완화**다: 새 술어는 ' +
      '(match_id) + (team_id) + (team_match_id) + (team_contact_id) = 1 로, 기존 3개 술어를 만족하는 ' +
      '모든 행이 새 술어도 그대로 만족한다(네 번째 항이 0 이라 합이 변하지 않는다). ' +
      '롤링 배포 양방향 검증: (1) 구 인스턴스는 team_contact_id 를 아는 코드가 없어 match/team/team_match ' +
      '방만 쓰는데 그 write 는 새 제약에서도 합=1 이라 거부되지 않는다. (2) 신 인스턴스가 만드는 ' +
      'team_contact 방은 구 제약에서 합=0 으로 거부되므로, 이 마이그레이션이 신 코드보다 먼저 도는 ' +
      '기존 배포 순서(deploy-alpha.sh 가 migrate deploy 를 컨테이너 재생성보다 먼저 실행)를 그대로 전제한다. ' +
      '(3) 롤백 시 구 앱은 team_contact 행을 읽지도 쓰지도 않으므로 영향이 없다. ' +
      'DROP 과 ADD 가 같은 migration.sql 안에 있어 제약 없는 창이 커밋 밖으로 노출되지 않는다. ' +
      '같은 테이블에 team_id 를 추가했을 때도 동일한 DROP+재생성을 했다 ' +
      '(20260630000000_v1_chat_room_team_target_constraint). Reviewed 2026-08-21.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260821000000_v1_team_contacts/migration.sql',
    statement:
      `ALTER TABLE "v1_chat_rooms" ADD CONSTRAINT "v1_chat_rooms_exactly_one_target_check" ` +
      `CHECK ( ( ("match_id" IS NOT NULL)::int + ("team_id" IS NOT NULL)::int ` +
      `+ ("team_match_id" IS NOT NULL)::int + ("team_contact_id" IS NOT NULL)::int ) = 1 )`,
    reason:
      '위 DROP 의 짝 — 같은 이름의 제약을 team_contact_id 를 포함한 형태로 되돌려 놓는다. ' +
      '게이트가 ADD CONSTRAINT 를 막는 이유는 새 제약이 기존 행을 거부할 수 있어 provably additive 가 ' +
      '아니기 때문인데, 여기서는 그 위험이 구조적으로 없다: 새 술어는 직전 술어에 ' +
      '`+ ("team_contact_id" IS NOT NULL)::int` 항 하나만 더한 것이고, 이 마이그레이션 이전에는 ' +
      '그 컬럼 자체가 존재하지 않았으므로 모든 기존 행에서 그 항은 0 이다. 따라서 합이 변하지 않아 ' +
      '**기존 제약을 만족하던 모든 행이 새 제약도 만족한다** — ADD 시점의 검증이 실패할 수 없다. ' +
      '같은 이유로 구 인스턴스의 write(match/team/team_match 중 하나만 채움)도 새 제약을 통과한다. ' +
      '즉 이 ADD 는 스키마를 조이는 것이 아니라 직전 DROP 이 만든 공백을 **더 느슨한 형태로** 메우는 ' +
      '것이고, 둘이 같은 migration.sql 에 있어 제약 없는 창이 커밋 밖으로 노출되지 않는다. ' +
      'Reviewed 2026-08-21.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260824100100_v1_inquiry_reported_team_backfill/migration.sql',
    statement:
      'UPDATE "v1_inquiries" i SET "reported_team_id" = sub.reported_team_id FROM ( SELECT i2."id" AS id, CASE WHEN EXISTS (SELECT 1 FROM "v1_team_memberships" m WHERE m."team_id" = c."from_team_id" AND m."user_id" = i2."user_id" AND m."status" = \'active\') THEN c."to_team_id" WHEN EXISTS (SELECT 1 FROM "v1_team_memberships" m WHERE m."team_id" = c."to_team_id" AND m."user_id" = i2."user_id" AND m."status" = \'active\') THEN c."from_team_id" ELSE NULL END AS reported_team_id FROM "v1_inquiries" i2 JOIN "v1_team_contacts" c ON c."id" = i2."related_id" WHERE i2."related_type" = \'team_contact\' AND i2."category" = \'report\' AND i2."user_id" IS NOT NULL ) sub WHERE i."id" = sub.id AND sub.reported_team_id IS NOT NULL',
    reason:
      'Backfills only the newly introduced nullable reported_team_id. It reads existing rows but writes no pre-existing column, so a rolling deploy running the old code sees an unchanged schema surface. Rollback is DROP COLUMN, which the preceding additive migration owns. Rows whose reporter has no active membership on either side are intentionally left NULL rather than guessed.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260831090000_android_privacy_policy_v12/migration.sql',
    statement: String.raw`INSERT INTO "v1_managed_terms_documents" (
  "id",
  "policy_id",
  "version",
  "title",
  "subtitle",
  "content",
  "content_hash",
  "change_summary",
  "requires_reconsent",
  "status",
  "effective_at",
  "published_at",
  "supersedes_document_id",
  "created_at",
  "updated_at"
)
SELECT
  'a1130000-0000-4000-8000-000000000004',
  "policy_id",
  'v1.2',
  '개인정보처리방침',
  '회원가입 및 서비스 이용에 필요한 개인정보 수집·이용 동의예요.',
  regexp_replace("content", E'\n시행일: 2026년 7월 1일$', '') || $android_privacy$

11. Android 앱에서의 개인정보 처리

Android 앱은 teameet.co.kr 서비스를 WebView로 제공하며 로그인 세션을 위한 쿠키와 서비스 이용 기록을 처리합니다.

이용자가 앱에서 알림 수신에 명시적으로 동의하면 Firebase Cloud Messaging 알림 전송을 위해 앱 설치 식별자, FCM 토큰, 앱 버전, 기기 제조사·모델 정보를 처리합니다. 알림 동의를 철회하거나 로그아웃하면 해당 설치의 푸시 등록을 해제하고 토큰 삭제를 요청합니다. Firebase Cloud Messaging 제공 과정에서는 Google이 수탁자로서 관련 정보를 처리할 수 있습니다.

이용자가 현재 위치 기능을 직접 실행한 경우에만 Android의 대략적 위치 권한을 요청합니다. 제공된 좌표는 가까운 지역을 확인하기 위해 회사 서버로 전송되고, 현재 날씨 제공을 위해 Open-Meteo에 전송될 수 있습니다. 위치 권한을 거부해도 위치 기반 편의 기능을 제외한 서비스는 이용할 수 있습니다.

사진·파일은 이용자가 파일 선택기를 직접 실행하고 제출한 경우에만 업로드됩니다. 앱은 기기 저장소 전체를 조회하는 권한을 요청하지 않습니다.

계정 삭제는 앱의 설정 > 회원 탈퇴에서 직접 진행하거나 https://teameet.co.kr/account-deletion 에서 요청할 수 있습니다. 법령상 보관 의무가 있는 정보를 제외한 계정 연결 정보는 처리 목적이 끝난 뒤 파기합니다.

시행일: 2026년 7월 1일
최종 변경일: 2026년 8월 31일$android_privacy$,
  '8b157cae4348c80f0a185a555b29666c16a5122e516b0f8f17dcc0e55457f8a9',
  'Android 앱의 WebView, FCM, 대략적 위치, 파일 선택 및 계정 삭제 처리 기준 추가',
  false,
  'published'::"V1TermsDocumentStatus",
  '2026-08-31T00:00:00.000Z'::timestamptz,
  CURRENT_TIMESTAMP,
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "v1_managed_terms_documents"
WHERE "id" = 'a1110000-0000-4000-8000-000000000004'
ON CONFLICT ("policy_id", "version") DO NOTHING`,
    reason:
      'Publishes one immutable v1.2 privacy document derived from the retained v1.1 row. It inserts a new version only, uses ON CONFLICT (policy_id, version) DO NOTHING, and never updates or deletes legal history. requires_reconsent=false means old and new app instances do not block existing users during a rolling deploy; older code can render the same managed-terms shape and safely ignores the Android-specific appendix on rollback. Reviewed 2026-08-31 for PR #838.',
  },
  {
    file: 'apps/v1_api/prisma/migrations/20260831090000_android_privacy_policy_v12/migration.sql',
    statement: String.raw`DO $privacy_v12_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "v1_managed_terms_documents" AS candidate
    INNER JOIN "v1_managed_terms_documents" AS baseline
      ON baseline."id" = 'a1110000-0000-4000-8000-000000000004'
    WHERE candidate."id" = 'a1130000-0000-4000-8000-000000000004'
      AND candidate."policy_id" = baseline."policy_id"
      AND candidate."version" = 'v1.2'
      AND candidate."content_hash" = '8b157cae4348c80f0a185a555b29666c16a5122e516b0f8f17dcc0e55457f8a9'
      AND md5(candidate."content") = 'd31b4d3136f443697c08b4f987a69f2d'
      AND candidate."requires_reconsent" = false
      AND candidate."status" = 'published'::"V1TermsDocumentStatus"
      AND candidate."effective_at" = '2026-08-31T00:00:00.000Z'::timestamptz
      AND candidate."supersedes_document_id" = baseline."id"
  ) THEN
    RAISE EXCEPTION 'canonical Android privacy policy v1.2 was not materialized'
      USING ERRCODE = '23514';
  END IF;
END
$privacy_v12_guard$`,
    reason:
      'Read-only postcondition guard for the immutable v1.2 insert above. It mutates no row or schema: the block only verifies the retained baseline and exact canonical candidate identity, metadata, SHA-256 field, and independently computed content digest, then aborts the migration with SQLSTATE 23514 instead of recording a silent no-op. Reviewed 2026-08-31 for PR #838 remediation.',
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

// PR 이벤트가 넘기는 base 는 **대상 브랜치의 현재 tip** 이다(github.event.pull_request.base.sha).
// 브랜치를 딴 뒤 dev 가 전진하면 그 tip 은 head 의 조상이 아니게 되고, 아래 diff 가 "dev 에는
// 있고 내 브랜치엔 없는" 남의 마이그레이션까지 D 로 뱉어 `existing migration changed (D)` 로
// 엉뚱하게 죽는다 — 이 PR 이 마이그레이션을 전혀 건드리지 않아도 그렇다(2026-08-21 리그전
// 작업에서 5개 PR 이 이 사유로 red 였다). 그래서 조상이 아니면 **실제 분기점** 을 diff base 로
// 쓴다. 그래야 이 PR 이 정말로 **추가한** 마이그레이션만 A 로 잡힌다.
//
// 게이트를 느슨하게 만들지 않는다는 점이 중요하다: 바꾸는 것은 "무엇을 이 PR 의 변경으로 볼
// 것인가" 뿐이고, 아래 collectBaseFunctionNames 는 계속 **대상 브랜치 tip**(baseSha)을 본다 —
// 함수 존재 여부는 머지된 뒤의 현실로 판정해야 CREATE OR REPLACE 가 새 함수로 오인되지 않는다.
const diffBase = isAncestorOf(baseSha, headSha) ? baseSha : mergeBaseOf(baseSha, headSha);
const changes = runGit([
  'diff', '--name-status', '--find-renames', diffBase, headSha, '--',
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
//
// `splitTopLevel` keeps the separator's trailing whitespace, so every clause
// after the first arrives as " ADD COLUMN …" — and this match is anchored.
// Without the trim only the FIRST column of a multi-column ALTER TABLE was
// ever registered, which silently withdrew the unique-index and FK exemptions
// from columns 2..n even though they are just as newly-added-and-nullable as
// the first. Prisma emits exactly that shape (one ALTER TABLE, one ADD COLUMN
// clause per new column), so the gap fired on ordinary generated migrations.
// The sibling parsers (uniqueIndexColumns, foreignKeyColumns) already trim.
function addedNullableColumns(statement) {
  if (!/^ALTER TABLE\b/i.test(statement)) return [];
  const afterTable = statement.replace(/^ALTER TABLE\s+(?:"[^"]+"\.)?(?:"[^"]+"|[a-zA-Z_][\w$]*)\s*/i, '');
  const clauses = splitTopLevel(afterTable);
  const columns = [];
  for (const clause of clauses) {
    const match = clause.trim().match(/^ADD COLUMN\s+(?:IF NOT EXISTS\s+)?("[^"]+"|[a-zA-Z_][\w$]*)([\s\S]*)$/i);
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

// runGit 과 달리 실패를 예외로 흘리지 않고 boolean 으로 돌려준다 — 조상이 아닌 것은
// 오류가 아니라 판정해야 할 상태다(runGit 은 git 이 non-zero 면 곧바로 fail() 로 종료한다).
/**
 * 분기점을 구한다. `runGit` 을 안 쓰는 이유는 **rc 1 이 오류가 아니기 때문**이다 — git 은
 * "공통 조상이 없다"를 rc 1 + 빈 출력으로 답한다(실측 2026-09-01). 그걸 `Command failed`
 * 로 뭉뚱그리면 읽는 사람이 원인을 못 짚는다.
 */
function mergeBaseOf(baseSha, headSha) {
  let out;
  try {
    out = execFileSync('git', ['merge-base', baseSha, headSha], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (error?.status === 1) {
      fail(
        `base 와 head 의 공통 조상을 찾지 못했다: ${baseSha} / ${headSha}. `
        + '두 이력이 정말 무관하거나, 이 저장소가 그 분기점까지 갖고 있지 않다 '
        + '(얕은 클론이면 fetch 깊이를 늘려야 한다 — 평범한 fetch 로는 회복되지 않는다).',
      );
    }
    fail(`git merge-base ${baseSha} ${headSha} failed${describeGitFailure(error)}`);
  }
  if (!out) fail(`git merge-base ${baseSha} ${headSha} 가 빈 값을 돌려줬다`);
  return out;
}

function isAncestorOf(ancestor, descendant) {
  try {
    // `stdio: 'ignore'` 였을 땐 git 의 말을 **받지도 않았다.** 고장을 가려내려면 stderr 가 필요하다.
    // `encoding` 은 진단 문구를 바꾸지 않는다 — `error.message` 에는 둘 다 `fatal: …` 이 실린다
    // (실측: 차이는 `error.stderr` 가 Uint8Array 냐 String 이냐뿐이고, describeGitFailure 는
    // message 만 쓴다). 그래도 명시한다 — runGit·mergeBaseOf 와 **세 호출부가 어긋나 있으면**
    // 나중에 누가 stderr 를 직접 읽도록 고칠 때 여기만 Buffer 라 조용히 달라진다.
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      encoding: 'utf8',
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return true;
  } catch (error) {
    // 맨 `catch { return false }` 는 **"조상이 아니다"(판정)와 "저장소가 고장났다"(오류)를
    // 같은 값으로 만든다.** 그래서 base 객체가 없거나 저장소가 깨져도 조용히 `false` 가 되고,
    // 호출부는 아무 일 없다는 듯 merge-base 로 내려가 거기서 죽는다 — **첫 신호를 여기서
    // 삼킨다.** git 은 이 둘을 rc 로 구분해 준다(실측 2026-09-01):
    //   rc 1   → 조상이 아니다. stderr 는 비어 있다. **정상적인 답이다.**
    //   rc 128 → `fatal: Not a valid commit name …` 류. **고장이다.**
    if (error?.status === 1) return false;
    fail(`git merge-base --is-ancestor ${ancestor} ${descendant} failed${describeGitFailure(error)}`);
  }
}

function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 64 });
  } catch (error) {
    // 없던 건 **exit status** 다. stderr 는 원래도 안 사라졌다 — Node 가 `error.message`
    // 뒤에 붙여 준다(describeGitFailure 참조). 2026-09-01 로그에 아무 말이 없었던 건
    // 유실이 아니라 **rc 1 이라 stderr 가 실제로 비어 있었기** 때문이고, 그 사실을 알려면
    // rc 가 필요했다. 아래 판정들이 전부 rc 로 갈린다.
    fail(`git ${args.join(' ')} failed${describeGitFailure(error)}`);
  }
}

/**
 * `execFileSync` 가 던진 것에서 **밖에서 판단에 쓸 수 있는 것**만 뽑아 한 줄로 만든다.
 *
 * stderr 를 따로 붙이지 않는다 — Node 가 이미 `error.message` 뒤에 이어 준다(실측):
 *   rc 128 → `Command failed: git merge-base … \nfatal: Not a valid commit name …`
 *   rc 1   → `Command failed: git merge-base …`            (stderr 가 비어 있다)
 * 따로 붙이면 같은 문장이 두 번 나오거나, 아무 차이도 없는 분기가 하나 남는다.
 *
 * 없던 것은 **exit status** 다. 그리고 그게 이 게이트에서 실제로 갈리는 값이다 —
 * rc 1 은 git 의 정상적인 답이고 rc 128 은 고장이다.
 */
function describeGitFailure(error) {
  const status = typeof error?.status === 'number' ? ` (exit ${error.status})` : '';
  const details = error instanceof Error ? error.message : String(error);
  return `${status}: ${details}`;
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

  // A multi-column ALTER TABLE must register EVERY nullable column it adds,
  // not just the first — Prisma generates one ALTER TABLE with several ADD
  // COLUMN clauses, and the clause parser is anchored, so columns 2..n used to
  // be dropped. Both directions are asserted: the second added column earns the
  // unique-index exemption, and a NOT NULL DEFAULT column in the same statement
  // does not (it is not nullable, so a legacy row could collide on it).
  const multiColumnAccepted = [
    { file: 'multi.sql', statement: 'ALTER TABLE "User" ADD COLUMN "firstNew" TEXT, ADD COLUMN "secondNew" TEXT' },
    { file: 'multi.sql', statement: 'CREATE UNIQUE INDEX "User_secondNew_key" ON "User"("secondNew")' },
  ];
  const multiColumnAcceptedFailures = [];
  runAdditivityCheck(multiColumnAccepted, baseFunctionNames, (message) => multiColumnAcceptedFailures.push(message));
  if (multiColumnAcceptedFailures.length > 0) {
    fail(`non-first column of a multi-column ADD COLUMN lost its nullable-new status: ${multiColumnAcceptedFailures.join(' | ')}`);
  }

  const multiColumnRejected = [
    { file: 'multi.sql', statement: 'ALTER TABLE "User" ADD COLUMN "nullableNew" TEXT, ADD COLUMN "requiredNew" TEXT NOT NULL DEFAULT \'x\'' },
    { file: 'multi.sql', statement: 'CREATE UNIQUE INDEX "User_requiredNew_key" ON "User"("requiredNew")' },
  ];
  const multiColumnRejectedFailures = [];
  runAdditivityCheck(multiColumnRejected, baseFunctionNames, (message) => multiColumnRejectedFailures.push(message));
  if (!multiColumnRejectedFailures.some((message) => message.includes('User_requiredNew_key'))) {
    fail('a NOT NULL column added alongside a nullable one must not earn the unique-index exemption');
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

  baseResolutionSelfTest();
  baseFailureDiagnosticsSelfTest();
}

/**
 * base 해석이 **실패할 때 무엇을 말하는가**를 검증한다.
 *
 * 위 baseResolutionSelfTest 는 해석이 **성공하는** 경로만 본다. 그런데 2026-09-01 에 실제로
 * 터진 것은 실패 경로였고, 그때 로그에 남은 건 `Command failed: git merge-base …` 한 줄뿐이라
 * **원인을 아무도 못 짚었다**(가설이 여러 개 나왔고 전부 증거와 충돌했다). 그래서 여기서는
 * 판정 결과가 아니라 **메시지가 원인을 담는지**를 본다.
 *
 * ⚠️ 이 대조군은 **프로덕션 실패를 재현하지 않는다.** 그 실패의 원인은 아직 미상이다
 * (그 CI job 은 `fetch-depth: 0` 이고 두 SHA 는 체크아웃된 머지 커밋의 부모였다 — 아래 두
 * 모양 어느 쪽도 아니다). 여기서 덮는 것은 **git 이 실패를 알리는 두 가지 방식**이고,
 * 목적은 다음번에 게이트가 **스스로 원인을 말하게** 하는 것이다.
 */
function baseFailureDiagnosticsSelfTest() {
  const origin = mkdtempSync(join(tmpdir(), 'ec-origin-'));
  const shallow = mkdtempSync(join(tmpdir(), 'ec-shallow-'));
  const gitIn = (repo) => (...args) =>
    execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = gitIn(origin);
  const commitIn = (repo, dir, sql, message) => {
    mkdirSync(join(repo, 'apps/v1_api/prisma/migrations', dir), { recursive: true });
    writeFileSync(join(repo, 'apps/v1_api/prisma/migrations', dir, 'migration.sql'), `${sql}\n`);
    gitIn(repo)('add', '-A');
    gitIn(repo)('-c', 'user.email=selftest@local', '-c', 'user.name=selftest', 'commit', '-qm', message);
    return gitIn(repo)('rev-parse', 'HEAD');
  };
  /** 게이트를 돌려 **종료코드와 사람이 읽을 메시지**를 함께 받는다. */
  const gateRun = (repo, base, head) => {
    try {
      execFileSync(process.execPath, [SELF_PATH, base, head], {
        cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { code: 0, text: '' };
    } catch (error) {
      return { code: error?.status ?? -1, text: `${error?.stdout ?? ''}${error?.stderr ?? ''}` };
    }
  };
  const expectMessage = (label, got, needles) => {
    if (got.code === 0) fail(`base failure self-test: ${label} 은 실패해야 하는데 통과했다`);
    for (const needle of needles) {
      if (!got.text.includes(needle)) {
        fail(`base failure self-test: ${label} 메시지에 "${needle}" 이 없다 — 받은 것: ${got.text.trim()}`);
      }
    }
  };

  try {
    git('init', '-q', '.');
    const fork = commitIn(origin, '20260101000000_base', 'CREATE TABLE "Thing" ("id" UUID NOT NULL);', 'base');
    git('checkout', '-q', '-b', 'mainline');
    const movedTip = commitIn(origin, '20260103000000_other', 'ALTER TABLE "Thing" ADD COLUMN "other" TEXT;', 'other');
    git('checkout', '-q', fork);
    git('checkout', '-q', '-b', 'feature');
    const featureHead = commitIn(origin, '20260102000000_safe', 'ALTER TABLE "Thing" ADD COLUMN "note" TEXT;', 'safe');

    // (A) 형식은 맞지만 **없는** base — base 가 force-push 로 사라지면 실제로 생긴다.
    //
    //     ⚠️ `Not a valid commit name` 만 단언하면 **이 케이스는 헛돈다.** isAncestorOf 를
    //     예전의 맨 catch 로 되돌려도 통과하기 때문이다 — 거기서 조용히 false 가 된 뒤
    //     mergeBaseOf 가 같은 rc 128 을 다시 만나 같은 문장을 뱉는다(실제로 변이를 걸어
    //     확인했다: 통과했다). 그러니 여기서 봐야 하는 건 문구가 아니라 **어느 층이 먼저
    //     보고하는가** 다. 고장은 처음 감지되는 자리에서 이름을 대야 한다 — 한 층 미뤄지면
    //     읽는 사람은 "조상이 아니었나 보다" 라고 잘못 읽는다.
    const missing = '0'.repeat(40);
    expectMessage('없는 base SHA', gateRun(origin, missing, featureHead), [
      '--is-ancestor',
      'Not a valid commit name',
    ]);

    // (B) 객체는 있는데 **분기점이 없는** 저장소. 얕게 받은 두 tip 이 그 모양이다.
    //     git 은 이걸 rc 1 + **빈 stderr** 로 답한다 — 그래서 stderr 를 실어도 아무 말이 없고,
    //     게이트가 직접 문장을 만들어 줘야 한다.
    gitIn(shallow)('init', '-q', '.');
    gitIn(shallow)('remote', 'add', 'origin', origin);
    gitIn(shallow)('fetch', '-q', '--depth=1', 'origin', 'mainline', 'feature');
    expectMessage('분기점이 없는 저장소', gateRun(shallow, movedTip, featureHead), ['공통 조상']);

    console.log('[expand-contract-sql-v1] base failure diagnostics passed');
  } finally {
    rmSync(origin, { recursive: true, force: true });
    rmSync(shallow, { recursive: true, force: true });
  }
}

/**
 * base 해석(조상 여부에 따른 diff base 선택)을 임시 저장소로 검증한다.
 *
 * 이 케이스가 없으면 조상이 아닐 때의 동작을 CI 가 전혀 보지 못한다 — 실제로 그 구간이
 * 비어 있어서, 대상 브랜치가 전진할 때마다 무관한 PR 이 죽는 결함이 오래 남아 있었다.
 * 특히 C 케이스(조상이 아니면서 위험한 마이그레이션)가 중요하다: base 를 느슨하게 고르면
 * 게이트가 조용히 fail-open 되는데, 그건 원래 결함보다 훨씬 나쁘다.
 */
function baseResolutionSelfTest() {
  const repo = mkdtempSync(join(tmpdir(), 'ec-gate-'));
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (dir, sql, message) => {
    mkdirSync(join(repo, 'apps/v1_api/prisma/migrations', dir), { recursive: true });
    writeFileSync(join(repo, 'apps/v1_api/prisma/migrations', dir, 'migration.sql'), `${sql}\n`);
    git('add', '-A');
    git('-c', 'user.email=selftest@local', '-c', 'user.name=selftest', 'commit', '-qm', message);
    return git('rev-parse', 'HEAD');
  };
  const gateExits = (base, head) => {
    try {
      execFileSync(process.execPath, [SELF_PATH, base, head], { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
      return 0;
    } catch (error) {
      // 맨 `catch { return 1 }` 은 **게이트가 판정으로 exit 1 한 것**과 **자식이 아예 못 뜬
      // 것**을 같은 값으로 만든다. 이 PR 작업 중에 실제로 당했다 — SELF_PATH 가 TDZ 라
      // `node undefined` 가 실행됐고, 그것도 exit 1 이라 "게이트가 잘못 판정한다"로 보였다.
      //
      // **종료코드로는 못 가른다** — node 가 스크립트를 못 찾아도 1 이다(실측). 가를 수 있는
      // 것은 게이트가 자기 판정 경로에서 **반드시 찍는 표식**이다. 표식 없이 죽었으면 그건
      // 판정이 아니라 고장이니 삼키지 않는다.
      const text = String(error?.stderr ?? '');
      if (text.includes('[expand-contract-sql-v1]')) return 1;
      throw new Error(`게이트를 띄우지 못했다 (exit ${error?.status}): ${text.trim() || error?.message}`);
    }
  };

  try {
    git('init', '-q', '.');
    const fork = commit('20260101000000_base', 'CREATE TABLE "Thing" ("id" UUID NOT NULL);', 'base');

    git('checkout', '-q', '-b', 'safe');
    const safeHead = commit('20260102000000_safe', 'ALTER TABLE "Thing" ADD COLUMN "note" TEXT;', 'safe');

    git('checkout', '-q', fork);
    git('checkout', '-q', '-b', 'risky');
    const riskyHead = commit('20260102000000_risky', 'ALTER TABLE "Thing" DROP COLUMN "id";', 'risky');

    // 대상 브랜치가 그사이 전진해 fork 이후로 벌어진다 — 여기서 조상 관계가 깨진다.
    git('checkout', '-q', fork);
    git('checkout', '-q', '-b', 'mainline');
    const movedTip = commit('20260103000000_other', 'ALTER TABLE "Thing" ADD COLUMN "other" TEXT;', 'other');

    const cases = [
      ['ancestor base, additive migration', fork, safeHead, 0],
      ['moved base, additive migration', movedTip, safeHead, 0],
      ['moved base, destructive migration', movedTip, riskyHead, 1],
      ['ancestor base, destructive migration', fork, riskyHead, 1],
    ];
    for (const [label, base, head, expected] of cases) {
      const actual = gateExits(base, head);
      if (actual !== expected) fail(`base resolution self-test: ${label} expected exit ${expected}, got ${actual}`);
    }
    console.log('[expand-contract-sql-v1] base resolution controls passed');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

function fail(message) {
  console.error(`[expand-contract-sql-v1] ${message}`);
  process.exit(1);
}
