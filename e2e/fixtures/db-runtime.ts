import { spawnSync } from 'child_process';
import * as path from 'path';
import { TEST_PERSONAS } from './test-users';
import {
  E2E_DOCKER_COMPOSE_FILE,
  E2E_DOCKER_POSTGRES_DB,
  E2E_DOCKER_POSTGRES_SERVICE,
  E2E_DOCKER_PROJECT_NAME,
  E2E_DOCKER_POSTGRES_USER,
} from './runtime';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const E2E_PERSONA_NICKNAMES = Object.values(TEST_PERSONAS).map((persona) => persona.nickname);

function dockerComposeArgs(): string[] {
  const args = ['compose', '-f', E2E_DOCKER_COMPOSE_FILE];
  if (E2E_DOCKER_PROJECT_NAME) {
    args.push('-p', E2E_DOCKER_PROJECT_NAME);
  }
  return args;
}

function dockerPostgresArgs(sql: string): string[] {
  return [
    ...dockerComposeArgs(),
    'exec',
    '-T',
    E2E_DOCKER_POSTGRES_SERVICE,
    'psql',
    '-U',
    E2E_DOCKER_POSTGRES_USER,
    '-d',
    E2E_DOCKER_POSTGRES_DB,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ];
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlStringList(values: string[]): string {
  return values.map((value) => `'${escapeSqlLiteral(value)}'`).join(', ');
}

function runPostgresCommand(sql: string): string {
  const result = spawnSync('docker', dockerPostgresArgs(sql), {
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

export function checkDockerPostgresReady(): { ok: boolean; detail?: string } {
  const result = spawnSync('docker', dockerPostgresArgs('SELECT 1;'), {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 30_000,
  });

  if (result.status !== 0) {
    return {
      ok: false,
      detail: result.stderr?.trim() ?? 'docker compose postgres query failed',
    };
  }

  return { ok: true };
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
