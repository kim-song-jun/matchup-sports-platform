import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { seedCompetitionConfigVersions } from '../../src/tournaments/competition-config/competition-config-backfill';
import { createV1IntegrationApp } from './integration-app';

const ownerId = '14420000-0000-4000-8000-000000000001';

describe('Tournament draft custom periods survive HTTP re-save', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;

  beforeAll(async () => {
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({ data: { id: ownerId, email: 'period-resave@integration.test', onboardingStatus: 'completed' } });
    await prisma.v1AdminUser.create({ data: { userId: ownerId, adminRole: 'owner', status: 'active' } });
    const terms = app.get(ManagedTermsRuntimeService);
    const current = await terms.currentSignupTerms();
    await terms.acceptSignupTerms(ownerId, current.items.filter((item) => item.requirement === 'required').map((item) => item.documentId));
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    await seedCompetitionConfigVersions(prisma);
  });

  afterAll(async () => cleanupApp?.());

  it('keeps the single 30-minute period after identical lineup re-save and an actual lineup change', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/tournaments')
      .set('x-v1-user-id', ownerId)
      .send({ sportId, title: '사용자 지정 시간 초안', teamCount: 8, lineupMaxPlayers: 5, substitutionMode: 'rolling' })
      .expect(201);
    const id: string = created.body.data.id;
    const periods = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${id}/periods`)
      .set('x-v1-user-id', ownerId)
      .send({ expectedVersion: created.body.data.updatedAt, periods: [{ durationMinutes: 30 }] })
      .expect(200);
    expect(periods.body.data.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 30, extraTime: false }]);
    const originalPin = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, select: { competitionConfigVersionId: true } });
    let expectedVersion: string = periods.body.data.expectedVersion;

    for (const lineupMaxPlayers of [5, 5, 6]) {
      const saved = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}`)
        .set('x-v1-user-id', ownerId)
        .send({ expectedVersion, title: `초안 재저장 ${lineupMaxPlayers}`, lineupMaxPlayers, substitutionMode: 'rolling', maxSubstitutions: null })
        .expect(200);
      expectedVersion = saved.body.data.updatedAt;
      const read = await request(app.getHttpServer())
        .get(`/api/v1/admin/tournaments/${id}/periods`)
        .set('x-v1-user-id', ownerId)
        .expect(200);
      expect(read.body.data.periods).toEqual(periods.body.data.periods);
      const persisted = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
      expect(persisted.competitionConfig?.periods).toEqual(periods.body.data.periods);
      expect(persisted.competitionConfig?.lineup).toMatchObject({ maxPlayers: lineupMaxPlayers, substitutions: 'rolling', maxSubstitutions: null });
      if (lineupMaxPlayers === 5) expect(persisted.competitionConfigVersionId).toBe(originalPin.competitionConfigVersionId);
    }
  });
});
