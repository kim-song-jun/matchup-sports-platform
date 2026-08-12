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

function tableCreatedBy(statement) {
  return normalizeIdent(
    statement.match(/^CREATE TABLE\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i)?.[1],
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
