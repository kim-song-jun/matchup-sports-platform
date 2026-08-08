#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

// Declared here rather than beside parseStatements because selfTest() runs
// during module evaluation, before a class declaration further down the file
// would have left its temporal dead zone.
class UnparsableSqlError extends Error {}

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

function runAdditivityCheck(statements, baseFunctionNames, onFail) {
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
      onFail(`non-additive migration statement in ${file}: ${statement}`);
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

  console.log('[expand-contract-sql-v1] negative controls passed');
}

function fail(message) {
  console.error(`[expand-contract-sql-v1] ${message}`);
  process.exit(1);
}
