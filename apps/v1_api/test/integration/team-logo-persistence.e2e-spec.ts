import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createV1IntegrationApp } from './integration-app';

const userId = 'integration-team-logo-user';
const sportId = 'integration-team-logo-sport';
const regionId = 'integration-team-logo-region';
const teamId = 'integration-team-logo-team';
const presetLogoUrl = '/images/team-logos/team-logo-06.jpg';

describe('Team logo persistence integration contract', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
  });

  afterEach(cleanupFixtures);
  afterAll(async () => cleanupApp?.());

  async function cleanupFixtures() {
    if (!prisma) return;
    await prisma.v1Team.deleteMany({ where: { id: teamId } });
    await prisma.v1Region.deleteMany({ where: { id: regionId } });
    await prisma.v1Sport.deleteMany({ where: { id: sportId } });
    await prisma.v1User.deleteMany({ where: { id: userId } });
  }

  it('writes and reads a bundled preset URL through v1_team_profiles.logo_url', async () => {
    await cleanupFixtures();
    await prisma.v1User.create({
      data: {
        id: userId,
        email: 'team-logo-persistence@integration.test',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({
      data: { id: sportId, code: 'integration-team-logo', name: 'Integration Team Logo' },
    });
    await prisma.v1Region.create({
      data: { id: regionId, code: 'integration-team-logo-region', name: 'Integration Region', level: 1 },
    });

    await prisma.v1Team.create({
      data: {
        id: teamId,
        ownerUserId: userId,
        sportId,
        regionId,
        name: 'Preset Logo Persistence Team',
        profile: { create: { logoUrl: presetLogoUrl } },
      },
    });

    const stored = await prisma.v1Team.findUnique({
      where: { id: teamId },
      select: { profile: { select: { logoUrl: true } } },
    });

    expect(stored?.profile?.logoUrl).toBe(presetLogoUrl);
  });
});
