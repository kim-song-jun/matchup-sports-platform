#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

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
  return parseStatements(sql).map((statement) => ({ file, statement }));
});
const newTables = new Set(
  statements.map(({ statement }) => tableCreatedBy(statement)).filter(Boolean),
);
for (const { file, statement } of statements) {
  if (!isAdditiveStatement(statement, newTables)) {
    fail(`non-additive migration statement in ${file}: ${statement}`);
  }
}
console.log(`[expand-contract-sql-v1] ${baseSha} -> ${headSha} passed`);

function parseStatements(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function tableCreatedBy(statement) {
  return statement.match(/^CREATE TABLE\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i)?.[1]?.toLowerCase();
}

function alteredTable(statement) {
  return statement.match(/^ALTER TABLE\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i)?.[1]?.toLowerCase();
}

function isAdditiveStatement(statement, newTables) {
  if (/^CREATE (TABLE|TYPE|INDEX|EXTENSION|SEQUENCE)\b/i.test(statement)) return true;
  if (/^CREATE UNIQUE INDEX\b/i.test(statement)) {
    const indexedTable = statement.match(/\bON\s+(?:"[^"]+"\.)?("[^"]+"|[a-zA-Z_][\w$]*)/i)?.[1]?.toLowerCase();
    return indexedTable !== undefined && newTables.has(indexedTable);
  }
  if (/^COMMENT ON\b/i.test(statement)) return true;
  if (/^ALTER TYPE\b[\s\S]*\bADD VALUE\b/i.test(statement)) return true;
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
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    fail(`git ${args.join(' ')} failed: ${details}`);
  }
}

function selfTest() {
  const safe = parseStatements(`
    CREATE TABLE "AssetRef" ("id" UUID NOT NULL);
    ALTER TABLE "AssetRef" ADD CONSTRAINT "AssetRef_pkey" PRIMARY KEY ("id");
    ALTER TABLE "User" ADD COLUMN "avatar" TEXT;
    CREATE INDEX "AssetRef_id_idx" ON "AssetRef"("id");
  `);
  const tables = new Set(safe.map(tableCreatedBy).filter(Boolean));
  if (!safe.every((statement) => isAdditiveStatement(statement, tables))) fail('safe fixture rejected');
  const unsafe = [
    'ALTER TABLE "User" DROP COLUMN "name"',
    'DROP INDEX "user_idx"',
    'CREATE UNIQUE INDEX "User_email_key" ON "User"("email")',
    'ALTER TABLE "User" ADD CONSTRAINT "required_fk" FOREIGN KEY ("x") REFERENCES "X"("id")',
    'DELETE FROM "User"',
    'ALTER TABLE "User" ADD COLUMN "required" TEXT NOT NULL',
  ];
  if (unsafe.some((statement) => isAdditiveStatement(statement, tables))) fail('unsafe fixture accepted');
  console.log('[expand-contract-sql-v1] negative controls passed');
}

function fail(message) {
  console.error(`[expand-contract-sql-v1] ${message}`);
  process.exit(1);
}
