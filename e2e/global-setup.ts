import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_PERSONAS } from './fixtures/test-users';
import { loginViaApi, injectTokens } from './fixtures/auth';
import { healthCheck, createTeamViaApi, createMercenaryPostViaApi } from './fixtures/api-helpers';
import { runE2EPreflight } from './fixtures/preflight';
import { promoteAdminPersona, reactivateE2EUsers } from './fixtures/db-runtime';

const AUTH_DIR = path.join(__dirname, '.auth');
const STORAGE_BOOTSTRAP_URL = 'http://localhost:3003/matches';
const STORAGE_BOOTSTRAP_TIMEOUT = 120_000;

export default async function globalSetup(_config: FullConfig) {
  const allowOffline = process.env.E2E_ALLOW_OFFLINE === '1';

  // Ensure auth storage directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  try {
    reactivateE2EUsers();
    console.log('[global-setup] Reactivated existing E2E users.');
  } catch (err) {
    console.warn(`[global-setup] Pre-run E2E account restore failed (continuing): ${err}`);
  }

  // 1. Run strict preflight by default.
  await runE2EPreflight({ allowOffline });

  if (!(await healthCheck()) && allowOffline) {
    console.warn('[global-setup] API is offline in allow-offline mode. Skipping persona setup/seed.');
    return;
  }

  // 2. Pre-create all personas in DB and save their storageState files
  const browser = await chromium.launch();
  const tokens: Record<string, { accessToken: string; refreshToken: string }> = {};
  try {
    const failedPersonas: string[] = [];

    for (const [key, persona] of Object.entries(TEST_PERSONAS)) {
      try {
        console.log(`[global-setup] Logging in as ${persona.nickname}...`);
        const t = await loginViaApi(persona.nickname);
        tokens[key] = t;

        // Save storageState for this persona
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(STORAGE_BOOTSTRAP_URL, {
          waitUntil: 'domcontentloaded',
          timeout: STORAGE_BOOTSTRAP_TIMEOUT,
        });
        await injectTokens(page, t);
        await context.storageState({ path: path.join(AUTH_DIR, `${key}.json`) });
        await context.close();
      } catch (err) {
        failedPersonas.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (failedPersonas.length > 0) {
      throw new Error(`Persona bootstrap failed for ${failedPersonas.join(', ')}`);
    }

    // 2b. Promote admin persona through the running postgres container.
    const adminPersona = TEST_PERSONAS.admin;
    promoteAdminPersona(adminPersona.nickname);
    console.log(`[global-setup] Promoted ${adminPersona.nickname} to admin role.`);

    // 3. Seed shared test data — best-effort (skip if API unavailable)
    try {
      const ownerTokens = tokens['teamOwner'];
      const mercHostTokens = tokens['mercenaryHost'];

      if (ownerTokens) {
        // Create a team for teamOwner that teamManager/member scenarios can reuse
        const team = await createTeamViaApi(ownerTokens.accessToken, {
          name: 'E2E테스트팀',
          sportType: 'futsal',
          city: '서울',
          description: 'E2E 자동화 테스트용 팀',
          isRecruiting: true,
        });
        // Persist team ID so tests can read it (simple JSON file)
        fs.writeFileSync(
          path.join(AUTH_DIR, 'seed-data.json'),
          JSON.stringify({ ownerTeamId: team.id }),
          'utf-8',
        );
        console.log(`[global-setup] Created seed team: ${team.id}`);

        // Create a mercenary post for mercenaryHost (reuse already-obtained token)
        if (mercHostTokens) {
          const mercHostTeam = await createTeamViaApi(mercHostTokens.accessToken, {
            name: '용병호스트E2E팀',
            sportType: 'soccer',
            city: '서울',
          });
          const post = await createMercenaryPostViaApi(mercHostTokens.accessToken, {
            teamId: mercHostTeam.id,
            sportType: 'soccer',
            matchDate: '2026-12-01',
            venue: '테스트풋살장',
            position: 'ALL',
            count: 2,
            fee: 0,
          });
          const existing = JSON.parse(
            fs.readFileSync(path.join(AUTH_DIR, 'seed-data.json'), 'utf-8'),
          );
          fs.writeFileSync(
            path.join(AUTH_DIR, 'seed-data.json'),
            JSON.stringify({ ...existing, mercenaryPostId: post.id, mercHostTeamId: mercHostTeam.id }),
            'utf-8',
          );
          console.log(`[global-setup] Created seed mercenary post: ${post.id}`);
        }
      }
    } catch (err) {
      console.warn(`[global-setup] Seed data creation failed (tests may use fallback mock data): ${err}`);
    }
  } finally {
    await browser.close();
  }
  console.log('[global-setup] Done.');
}
