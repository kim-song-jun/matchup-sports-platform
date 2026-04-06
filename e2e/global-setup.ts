import { chromium, FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { TEST_PERSONAS, PersonaKey } from './fixtures/test-users';
import { loginViaApi, injectTokens } from './fixtures/auth';
import { healthCheck, createTeamViaApi, createMercenaryPostViaApi } from './fixtures/api-helpers';

const AUTH_DIR = path.join(__dirname, '.auth');

async function waitForApi(maxAttempts = 20, intervalMs = 2000): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await healthCheck()) return;
    console.log(`[global-setup] API not ready, attempt ${i + 1}/${maxAttempts}...`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.warn('[global-setup] API health check timed out — tests may fail if API is offline');
}

export default async function globalSetup(_config: FullConfig) {
  // Ensure auth storage directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  // 1. Wait for API to be healthy
  await waitForApi();

  // 2. Pre-create all personas in DB and save their storageState files
  const browser = await chromium.launch();
  const tokens: Record<string, { accessToken: string; refreshToken: string }> = {};

  for (const [key, persona] of Object.entries(TEST_PERSONAS)) {
    try {
      console.log(`[global-setup] Logging in as ${persona.nickname}...`);
      const t = await loginViaApi(persona.nickname);
      tokens[key] = t;

      // Save storageState for this persona
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('http://localhost:3003');
      await injectTokens(page, t);
      await context.storageState({ path: path.join(AUTH_DIR, `${key}.json`) });
      await context.close();
    } catch (err) {
      console.warn(`[global-setup] Failed to set up persona "${key}": ${err}`);
    }
  }

  // 2b. Promote admin persona to role='admin' via Prisma
  try {
    const adminPersona = TEST_PERSONAS['admin'];
    const prisma = new PrismaClient();
    await prisma.user.update({
      where: { nickname: adminPersona.nickname },
      data: { role: 'admin' },
    });
    await prisma.$disconnect();
    console.log(`[global-setup] Promoted ${adminPersona.nickname} to admin role.`);
  } catch (err) {
    console.warn(`[global-setup] Admin role promotion failed (admin tests may fail): ${err}`);
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

  await browser.close();
  console.log('[global-setup] Done.');
}
