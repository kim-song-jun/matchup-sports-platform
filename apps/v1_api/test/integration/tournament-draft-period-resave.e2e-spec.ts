import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { seedCompetitionConfigVersions } from '../../src/tournaments/competition-config/competition-config-backfill';
import { FUTSAL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config.presets';
import { createV1IntegrationApp } from './integration-app';

const ownerId = '14420000-0000-4000-8000-000000000001';

describe('Tournament draft custom periods survive HTTP re-save', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let footballSportId: string;

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
    footballSportId = (await prisma.v1Sport.upsert({ where: { code: 'football' }, update: {}, create: { code: 'football', name: '축구' } })).id;
    await seedCompetitionConfigVersions(prisma);
  });

  afterAll(async () => cleanupApp?.());

  it('retries the full wizard payload including sportId and preserves saved custom periods with CAS', async () => {
    const payload = {
      sportId, title: '마법사 전체 폼 재시도 초안', format: 'knockout', genderCategory: 'male',
      scheduledAt: '2026-11-15T00:00:00.000Z', scheduledEndAt: null,
      registrationDeadlineAt: '2026-11-12T14:59:00.000Z', rosterDeadlineAt: null,
      coverImageUrl: null, teamCount: 8, minPlayers: 6, maxPlayers: 10,
      lineupMaxPlayers: 6, substitutionMode: 'limited', maxSubstitutions: 5, entryFee: 0,
      prizeBreakdown: '1위 / 2위 / 3위',
      promoHomeEnabled: false, promoHomeTitle: '', promoHomeSubtitle: '', promoHomeImageUrl: '',
      promoHomeBadgeText: '', promoHomeDateText: '', promoHomeTeamsText: '',
      promoHomeLocationText: '', promoHomePrizeText: '', promoHomePriority: 0,
      promoListEnabled: false, promoListTitle: '', promoListSubtitle: '', promoListImageUrl: '',
      promoListBadgeText: '', promoListDateText: '', promoListTeamsText: '',
      promoListLocationText: '', promoListPrizeText: '', promoListPriority: 0,
    };
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/tournaments').set('x-v1-user-id', ownerId).send(payload).expect(201);
    const id: string = created.body.data.id;
    const retry = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId)
      .send({ ...payload, expectedVersion: created.body.data.updatedAt }).expect(200);
    expect(retry.body.data).toMatchObject({ id, sportId, title: payload.title });
    expect(retry.body.data.updatedAt).not.toBe(created.body.data.updatedAt);
    const periods = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId)
      .send({ expectedVersion: retry.body.data.updatedAt, periods: [{ durationMinutes: 35 }] }).expect(200);
    const saved = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId)
      .send({ ...payload, expectedVersion: periods.body.data.expectedVersion }).expect(200);
    expect(saved.body.data.updatedAt).not.toBe(periods.body.data.expectedVersion);
    const read = await request(app.getHttpServer())
      .get(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId).expect(200);
    expect(read.body.data.periods).toEqual(periods.body.data.periods);
    const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
    expect(row.sportId).toBe(sportId);
    expect(row.updatedAt.toISOString()).toBe(saved.body.data.updatedAt);
    expect(row.competitionConfig?.periods).toEqual(periods.body.data.periods);
    expect(await prisma.v1Tournament.count({ where: { title: payload.title } })).toBe(1);
    const stale = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId)
      .send({ ...payload, expectedVersion: periods.body.data.expectedVersion }).expect(409);
    expect(stale.body.code).toBe('TOURNAMENT_VERSION_CONFLICT');
  });

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
        .send({ expectedVersion, lineupMaxPlayers, substitutionMode: 'rolling', maxSubstitutions: null })
        .expect(200);
      expect(saved.body.data.updatedAt).not.toBe(expectedVersion);
      expectedVersion = saved.body.data.updatedAt;
      const read = await request(app.getHttpServer())
        .get(`/api/v1/admin/tournaments/${id}/periods`)
        .set('x-v1-user-id', ownerId)
        .expect(200);
      expect(read.body.data.periods).toEqual(periods.body.data.periods);
      const persisted = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
      expect(persisted.updatedAt.toISOString()).toBe(expectedVersion);
      expect(persisted.competitionConfig?.periods).toEqual(periods.body.data.periods);
      expect(persisted.competitionConfig?.lineup).toMatchObject({ maxPlayers: lineupMaxPlayers, substitutions: 'rolling', maxSubstitutions: null });
      if (lineupMaxPlayers === 5) expect(persisted.competitionConfigVersionId).toBe(originalPin.competitionConfigVersionId);
    }
  });

  it.each([true, false])('re-saves and changes a separately named pinned config without resetting its family (catalog=%s)', async (hasCatalog) => {
    const { positions, formations, ...lineup } = FUTSAL_V1_CONFIG.lineup;
    const config = {
      ...FUTSAL_V1_CONFIG,
      periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: hasCatalog ? 31 : 32, extraTime: false }],
      lineup: { ...lineup, maxPlayers: 5, ...(hasCatalog ? { positions, formations } : {}) },
    };
    const name = `회귀 전용 풋살 ${hasCatalog ? 'catalog' : 'v1-missing-catalog'}`;
    const registered = await request(app.getHttpServer())
      .post('/api/v1/admin/competition-configs').set('x-v1-user-id', ownerId)
      .send({ sportCode: 'futsal', name, config }).expect(201);
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/tournaments').set('x-v1-user-id', ownerId)
      .send({ sportId, title: '이름 지정 설정 회귀 초안', teamCount: 8 }).expect(201);
    const id: string = created.body.data.id;
    const pinned = await request(app.getHttpServer())
      .patch(`/api/v1/admin/tournaments/${id}/competition-config`).set('x-v1-user-id', ownerId)
      .send({ competitionConfigVersionId: registered.body.data.id, expectedVersion: created.body.data.updatedAt }).expect(200);
    let expectedVersion: string = pinned.body.data.expectedVersion;
    for (const mode of ['rolling', 'rolling', 'limited'] as const) {
      const saved = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId)
        .send({ expectedVersion, lineupMaxPlayers: 5, substitutionMode: mode, ...(mode === 'limited' ? { maxSubstitutions: 5 } : {}) }).expect(200);
      expect(saved.body.data.updatedAt).not.toBe(expectedVersion);
      expectedVersion = saved.body.data.updatedAt;
      const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
      expect(row.updatedAt.toISOString()).toBe(expectedVersion);
      expect(row.competitionConfig).toMatchObject({ name, periods: config.periods, lineup: { maxPlayers: 5, substitutions: mode, maxSubstitutions: mode === 'limited' ? 5 : null } });
      if (mode === 'rolling') expect(row.competitionConfigVersionId).toBe(registered.body.data.id);
      if (!hasCatalog) {
        expect(row.competitionConfig?.lineup).not.toHaveProperty('positions');
        expect(row.competitionConfig?.lineup).not.toHaveProperty('formations');
      }
      const periodsRead = await request(app.getHttpServer())
        .get(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId).expect(200);
      expect(periodsRead.body.data.periods).toEqual(config.periods);
    }
    if (!hasCatalog) {
      const periodChange = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId)
        .send({ expectedVersion, periods: [{ durationMinutes: 35 }] }).expect(200);
      const saved = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId)
        .send({ expectedVersion: periodChange.body.data.expectedVersion, lineupMaxPlayers: 5, substitutionMode: 'limited', maxSubstitutions: 5 }).expect(200);
      expect(saved.body.data.updatedAt).not.toBe(periodChange.body.data.expectedVersion);
      const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
      expect(row.updatedAt.toISOString()).toBe(saved.body.data.updatedAt);
      expect(row.competitionConfig).toMatchObject({ name, periods: periodChange.body.data.periods });
      expect(row.competitionConfig?.lineup).not.toHaveProperty('positions');
      expect(row.competitionConfig?.lineup).not.toHaveProperty('formations');
      const stale = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId)
        .send({ expectedVersion: periodChange.body.data.expectedVersion, lineupMaxPlayers: 5, substitutionMode: 'limited', maxSubstitutions: 5 }).expect(409);
      expect(stale.body.code).toBe('TOURNAMENT_VERSION_CONFLICT');
    }
  });

  describe('sport change re-pins the competition config in the same CAS write', () => {
    const patch = (id: string, body: Record<string, unknown>) =>
      request(app.getHttpServer()).patch(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId).send(body);
    const createFutsal = async (title: string) => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/tournaments').set('x-v1-user-id', ownerId).send({ sportId, title, teamCount: 8 }).expect(201);
      return { id: created.body.data.id as string, updatedAt: created.body.data.updatedAt as string };
    };
    const readPeriods = async (id: string) =>
      (await request(app.getHttpServer()).get(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId).expect(200)).body.data.periods;

    it('moves a fixture-less futsal draft to football with the football default config (custom futsal periods reset)', async () => {
      const { id, updatedAt } = await createFutsal('종목 변경 핀 재연결 초안');
      const customized = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId)
        .send({ expectedVersion: updatedAt, periods: [{ durationMinutes: 35 }] }).expect(200);

      const changed = await patch(id, { expectedVersion: customized.body.data.expectedVersion, sportId: footballSportId }).expect(200);

      const row = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, include: { competitionConfig: true } });
      expect(row.sportId).toBe(footballSportId);
      expect(row.competitionConfig?.sportCode).toBe('football');
      expect(changed.body.data).toMatchObject({ sportId: footballSportId, competitionConfigVersionId: row.competitionConfigVersionId });
      expect((await readPeriods(id)).map((period: { durationMinutes: number }) => period.durationMinutes)).toEqual([45, 45]);
      const detail = await request(app.getHttpServer()).get(`/api/v1/admin/tournaments/${id}`).set('x-v1-user-id', ownerId).expect(200);
      expect(detail.body.data.competitionConfigVersionId).toBe(row.competitionConfigVersionId);
      const audit = await prisma.v1AdminActionLog.findFirstOrThrow({ where: { targetId: id, action: 'tournament.update' }, orderBy: { createdAt: 'desc' } });
      expect(audit.afterJson).toMatchObject({ sportId: footballSportId, competitionConfigVersionId: row.competitionConfigVersionId });
    });

    it('rejects a sport change with 409 TOURNAMENT_SPORT_LOCKED once a fixture exists and changes nothing', async () => {
      const { id, updatedAt } = await createFutsal('종목 변경 대진 잠금 초안');
      const before = await prisma.v1Tournament.findUniqueOrThrow({ where: { id } });
      const match = await prisma.v1TeamMatch.create({
        data: { tournamentId: id, sportId, platformManaged: true, title: '종목 변경 잠금 경기' },
      });
      await prisma.v1TournamentMatchDetails.create({ data: { teamMatchId: match.id, tournamentId: id, round: 'final', fixtureNumber: 1 } });

      const res = await patch(id, { expectedVersion: updatedAt, sportId: footballSportId }).expect(409);

      expect(res.body.code).toBe('TOURNAMENT_SPORT_LOCKED');
      const after = await prisma.v1Tournament.findUniqueOrThrow({ where: { id } });
      expect(after.sportId).toBe(sportId);
      expect(after.competitionConfigVersionId).toBe(before.competitionConfigVersionId);
      expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    });

    it('resending the same sportId keeps the pin and any customized periods', async () => {
      const { id, updatedAt } = await createFutsal('종목 변경 동일 종목 초안');
      const customized = await request(app.getHttpServer())
        .patch(`/api/v1/admin/tournaments/${id}/periods`).set('x-v1-user-id', ownerId)
        .send({ expectedVersion: updatedAt, periods: [{ durationMinutes: 35 }] }).expect(200);
      const pinned = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, select: { competitionConfigVersionId: true } });

      await patch(id, { expectedVersion: customized.body.data.expectedVersion, sportId }).expect(200);

      const after = await prisma.v1Tournament.findUniqueOrThrow({ where: { id }, select: { competitionConfigVersionId: true } });
      expect(after.competitionConfigVersionId).toBe(pinned.competitionConfigVersionId);
      expect(await readPeriods(id)).toEqual(customized.body.data.periods);
    });

    it('a stale expectedVersion on a sport change is a 409 conflict and leaves sport and pin unchanged', async () => {
      const { id, updatedAt } = await createFutsal('종목 변경 CAS 충돌 초안');
      const before = await prisma.v1Tournament.findUniqueOrThrow({ where: { id } });
      await patch(id, { expectedVersion: updatedAt, title: '종목 변경 CAS 충돌 초안 2' }).expect(200);

      const res = await patch(id, { expectedVersion: updatedAt, sportId: footballSportId }).expect(409);

      expect(res.body.code).toBe('TOURNAMENT_VERSION_CONFLICT');
      const after = await prisma.v1Tournament.findUniqueOrThrow({ where: { id } });
      expect(after.sportId).toBe(sportId);
      expect(after.competitionConfigVersionId).toBe(before.competitionConfigVersionId);
    });
  });
});
