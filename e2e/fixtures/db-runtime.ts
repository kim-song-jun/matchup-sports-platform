import { spawnSync } from 'child_process';
import * as path from 'path';
import { TEST_PERSONAS } from './test-users';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const E2E_PERSONA_NICKNAMES = Object.values(TEST_PERSONAS).map((persona) => persona.nickname);

const DOCKER_POSTGRES_ARGS = [
  'compose',
  'exec',
  '-T',
  'postgres',
  'psql',
  '-U',
  'matchup_user',
  '-d',
  'matchup_dev',
  '-v',
  'ON_ERROR_STOP=1',
] as const;

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlStringList(values: string[]): string {
  return values.map((value) => `'${escapeSqlLiteral(value)}'`).join(', ');
}

function runPostgresCommand(sql: string): string {
  const result = spawnSync('docker', [...DOCKER_POSTGRES_ARGS, '-c', sql], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? 'unknown error';
    throw new Error(`docker compose postgres query failed: ${stderr}`);
  }

  return result.stdout?.trim() ?? '';
}

export function softDeleteE2EUsers(): string {
  return runPostgresCommand(`
    UPDATE users
    SET deleted_at = NOW()
    WHERE nickname IN (${toSqlStringList(E2E_PERSONA_NICKNAMES)})
      AND deleted_at IS NULL;
  `);
}

export function reactivateE2EUsers(): string {
  return runPostgresCommand(`
    UPDATE users
    SET deleted_at = NULL
    WHERE nickname IN (${toSqlStringList(E2E_PERSONA_NICKNAMES)})
      AND deleted_at IS NOT NULL;
  `);
}

export function promoteAdminPersona(nickname: string): string {
  return runPostgresCommand(`
    UPDATE users
    SET role = 'admin'
    WHERE nickname = '${escapeSqlLiteral(nickname)}'
      AND deleted_at IS NULL;
  `);
}
