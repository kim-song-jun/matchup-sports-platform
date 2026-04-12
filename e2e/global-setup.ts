import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { TEST_PERSONAS, WEB_BASE } from './fixtures/test-users';
import { loginViaApi, injectTokens } from './fixtures/auth';
import { healthCheck, createTeamViaApi, createMercenaryPostViaApi, addTeamMemberViaApi } from './fixtures/api-helpers';
import { runE2EPreflight } from './fixtures/preflight';
import { promoteAdminPersona, reactivateE2EUsers } from './fixtures/db-runtime';
import { E2E_AUTH_DIR, E2E_DOCKER_PROJECT_NAME, E2E_SEED_DATA_PATH } from './fixtures/runtime';

const STORAGE_BOOTSTRAP_PATH = process.env.E2E_STORAGE_BOOTSTRAP_PATH ?? '/matches';
const STORAGE_BOOTSTRAP_URL = `${WEB_BASE}${STORAGE_BOOTSTRAP_PATH}`;
const STORAGE_BOOTSTRAP_TIMEOUT = 60_000;

export default async function globalSetup(_config: FullConfig) {
  const allowOffline = process.env.E2E_ALLOW_OFFLINE === '1';
  const requireDockerPostgres = process.env.E2E_REQUIRE_DOCKER_POSTGRES === '1' || Boolean(E2E_DOCKER_PROJECT_NAME);
  const requireAdminPromotion = process.env.E2E_REQUIRE_ADMIN_PROMOTION === '1';

  // Ensure auth storage directory exists
  if (!fs.existsSync(E2E_AUTH_DIR)) {
    fs.mkdirSync(E2E_AUTH_DIR, { recursive: true });
  }

  // 1. Run strict preflight by default.
  await runE2EPreflight({ allowOffline, requireDockerPostgres });

  try {
    reactivateE2EUsers();
    console.log('[global-setup] Reactivated existing E2E users.');
  } catch (err) {
    console.warn(`[global-setup] Pre-run E2E account restore failed (continuing): ${err}`);
  }

  if (!(await healthCheck()) && allowOffline) {
    console.warn('[global-setup] API is offline in allow-offline mode. Skipping persona setup/seed.');
    return;
  }

  // 2. Pre-create all personas in DB and save their storageState files
  const browser = await chromium.launch();
  const tokens: Record<string, { accessToken: string; refreshToken: string; user?: Record<string, unknown> }> = {};
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
        await context.storageState({ path: path.join(E2E_AUTH_DIR, `${key}.json`) });
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
    try {
      promoteAdminPersona(adminPersona.nickname);
      console.log(`[global-setup] Promoted ${adminPersona.nickname} to admin role.`);
    } catch (err) {
      const message = `[global-setup] Admin persona promotion failed. Admin specs require docker compose postgres access: ${err}`;
      if (allowOffline || !requireAdminPromotion) {
        console.warn(`${message} (continuing without hard failure)`);
      } else {
        throw new Error(message);
      }
    }

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
          E2E_SEED_DATA_PATH,
          JSON.stringify({ ownerTeamId: team.id }),
          'utf-8',
        );
        console.log(`[global-setup] Created seed team: ${team.id}`);

        // Add manager/member personas to the shared seed team for suites that
        // still reuse global seed artifacts.
        const managerTokens = tokens['teamManager'];
        const memberTokens = tokens['teamMember'];

        if (managerTokens?.user?.id) {
          try {
            await addTeamMemberViaApi(
              ownerTokens.accessToken,
              team.id,
              managerTokens.user.id as string,
              'manager',
            );
            console.log(`[global-setup] Added teamManager to seed team as manager.`);
          } catch (err) {
            console.warn(`[global-setup] Could not add teamManager to seed team: ${err}`);
          }
        }

        if (memberTokens?.user?.id) {
          try {
            await addTeamMemberViaApi(
              ownerTokens.accessToken,
              team.id,
              memberTokens.user.id as string,
              'member',
            );
            console.log(`[global-setup] Added teamMember to seed team as member.`);
          } catch (err) {
            console.warn(`[global-setup] Could not add teamMember to seed team: ${err}`);
          }
        }

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
            fs.readFileSync(E2E_SEED_DATA_PATH, 'utf-8'),
          );
          fs.writeFileSync(
            E2E_SEED_DATA_PATH,
            JSON.stringify({ ...existing, mercenaryPostId: post.id, mercHostTeamId: mercHostTeam.id }),
            'utf-8',
          );
          console.log(`[global-setup] Created seed mercenary post: ${post.id}`);
        }
      }
    } catch (err) {
      console.warn(`[global-setup] Seed data creation failed (shared seed artifacts unavailable): ${err}`);
    }
  } finally {
    await browser.close();
  }
  console.log('[global-setup] Done.');
}
