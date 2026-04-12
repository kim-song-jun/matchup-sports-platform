import * as path from 'path';

function sanitizeRunId(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[-_]+$/, '')
    .replace(/-{2,}/g, '-');

  return normalized || fallback;
}

const sharedAuthDir = path.join(__dirname, '..', '.auth');

export const E2E_RUN_ID = sanitizeRunId(process.env.E2E_RUN_ID ?? 'shared', 'shared');
export const E2E_AUTH_DIR = path.resolve(process.env.E2E_AUTH_DIR ?? sharedAuthDir);
export const E2E_SEED_DATA_PATH = path.join(E2E_AUTH_DIR, 'seed-data.json');
export const E2E_DOCKER_COMPOSE_FILE = path.resolve(
  process.env.E2E_DOCKER_COMPOSE_FILE ?? path.join(__dirname, '..', '..', 'docker-compose.yml'),
);
export const E2E_DOCKER_PROJECT_NAME = process.env.E2E_DOCKER_PROJECT_NAME;
export const E2E_DOCKER_POSTGRES_SERVICE = process.env.E2E_DOCKER_POSTGRES_SERVICE ?? 'postgres';
export const E2E_DOCKER_POSTGRES_DB = process.env.E2E_DOCKER_POSTGRES_DB ?? 'matchup_dev';
export const E2E_DOCKER_POSTGRES_USER = process.env.E2E_DOCKER_POSTGRES_USER ?? 'matchup_user';

export function authStatePath(personaKey: string): string {
  return path.join(E2E_AUTH_DIR, `${personaKey}.json`);
}
