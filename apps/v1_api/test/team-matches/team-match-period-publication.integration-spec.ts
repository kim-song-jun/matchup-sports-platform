import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { seedCompetitionConfigVersions } from '../../src/tournaments/competition-config/competition-config-backfill';
import { canonicalize, competitionConfigContentHash, validateCompetitionConfig } from '../../src/tournaments/competition-config/competition-config';
import { findTournamentOnSurfaceOrThrow, LEAGUE_KINDS } from '../../src/tournaments/tournament-surface-lookup';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID();
const ownerId = randomUUID();

describe('MD-QA #141 shared period publication through HTTP and PostgreSQL', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let teamIds: string[];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({ data: {
      id: ownerId, email: `mdqa141-${suiteId}@integration.test`, phone: '01099991411',
      onboardingStatus: 'completed', accountStatus: 'active', phoneVerifiedAt: new Date(),
      profile: { create: { realName: '규칙 테스트', nickname: `rules-${suiteId}`, displayName: '규칙 테스트', gender: 'male' } },
    } });
    await prisma.v1AdminUser.create({ data: { userId: ownerId, adminRole: 'owner', status: 'active' } });
    const terms = app.get(ManagedTermsRuntimeService);
    const signupTerms = await terms.currentSignupTerms();
    await terms.acceptSignupTerms(ownerId, signupTerms.items.filter(item => item.requirement === 'required').map(item => item.documentId));
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `mdqa141-${suiteId}`, name: '규칙 통합 시군구', level: 2 } })).id;
    await seedCompetitionConfigVersions(prisma);
    teamIds = [];
    for (let index = 0; index < 4; index += 1) {
      const team = await prisma.v1Team.create({ data: {
        ownerUserId: ownerId, sportId, regionId, name: `규칙 팀 ${index} ${suiteId}`,
        memberships: { create: { userId: ownerId, role: 'owner', status: 'active' } },
      } });
      teamIds.push(team.id);
    }
  });

  afterAll(async () => cleanup?.());

  const server = () => app.getHttpServer();
  const matchBody = (title: string) => ({
    hostTeamId: teamIds[0], sportId, regionId, title,
    startsAt: '2099-01-10T12:00:00.000Z', manualPlaceName: '규칙 통합 경기장',
  });
  const createMatch = async (title: string, minutes?: number) => {
    const response = await request(server()).post('/api/v1/team-matches').set('x-v1-user-id', ownerId)
      .send({ ...matchBody(title), ...(minutes === undefined ? {} : { periods: [{ durationMinutes: minutes }] }) }).expect(201);
    const id: string = response.body.data.teamMatchId;
    return prisma.v1TeamMatch.findUniqueOrThrow({ where: { id }, include: { game: { include: { periods: true } }, competitionConfig: true } });
  };
  const gameOf = (teamMatchId: string) => prisma.v1Game.findUniqueOrThrow({
    where: { teamMatchId }, include: { teamMatch: true, periods: { orderBy: { number: 'asc' } }, lineups: { orderBy: { id: 'asc' } }, participants: { orderBy: { id: 'asc' } } },
  });
  const globalVersions = () => prisma.v1CompetitionConfigVersion.findMany({
    where: { sportCode: 'futsal', name: 'futsal-v1' }, orderBy: { version: 'asc' }, select: { id: true, version: true, contentHash: true },
  });
  async function leagueWithFixtures(title: string) {
    const created = await request(server()).post('/api/v1/admin/league-matches').set('x-v1-user-id', ownerId)
      .send({ title, sportId, regionId, startsOn: '2099-01-01T00:00:00.000Z', endsOn: '2099-12-31T00:00:00.000Z', teamIds }).expect(201);
    const leagueId: string = created.body.data.leagueId;
    const fixtures = await request(server()).post(`/api/v1/admin/league-matches/${leagueId}/fixtures`).set('x-v1-user-id', ownerId)
      .send({ weeksCount: 1, schedule: { dates: ['2099-01-08'], time: '22:00' }, timing: { gameDurationMinutes: 40, breakMinutes: 5, gamesPerDay: 6 } }).expect(201);
    const ids: string[] = fixtures.body.data.teamMatchIds;
    return { leagueId, ids };
  }
  async function savePeriods(leagueId: string, minutes: number): Promise<{ changed: boolean; fixturesRepointed: number; competitionConfigVersionId: string }> {
    const current = await request(server()).get(`/api/v1/admin/tournaments/${leagueId}/periods`).set('x-v1-user-id', ownerId).expect(200);
    const saved = await request(server()).patch(`/api/v1/admin/tournaments/${leagueId}/periods`).set('x-v1-user-id', ownerId)
      .send({ expectedVersion: current.body.data.expectedVersion, periods: [{ durationMinutes: minutes }] }).expect(200);
    return saved.body.data;
  }

  async function waitForPublicationInserts(tx: Prisma.TransactionClient, holderPid: number) {
    const deadline = Date.now() + 2000;
    let waiting: Array<{ pid: number; query: string }> = [];
    do {
      // pg_stat_activity caches its snapshot inside a transaction; refresh before observing new waiters.
      await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
      waiting = await tx.$queryRaw<Array<{ pid: number; query: string }>>`
        SELECT locks.pid, activity.query FROM pg_locks locks JOIN pg_stat_activity activity ON activity.pid = locks.pid
        WHERE locks.locktype = 'relation' AND locks.relation = 'public.v1_competition_config_versions'::regclass
          AND locks.mode = 'RowExclusiveLock' AND NOT locks.granted AND activity.datname = current_database()
          AND ${holderPid}::int = ANY(pg_blocking_pids(locks.pid))`;
      if (new Set(waiting.map(row => row.pid)).size === 2 && waiting.every(row => /\bINSERT\s+INTO\b/i.test(row.query))) return waiting;
      await new Promise(resolve => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    throw new Error(`Two config INSERT sessions did not reach the PostgreSQL barrier within 2 s; observed ${waiting.length}. The app pool must allow at least two writer connections.`);
  }

  it.each([{ order: 'host first', minutes: 47 }, { order: 'tournament first', minutes: 49 }])(
    'reuses the same immutable content in both writer orders and preserves pending/history behavior ($order)', async ({ order, minutes }) => {
      const { leagueId, ids } = await leagueWithFixtures(`규칙 ${order} ${suiteId}`);
      const [startedId, ...pendingIds] = ids;
      if (!startedId || pendingIds.length === 0) throw new Error('The actual league must create started and pending test fixtures');
      const started = await gameOf(startedId);
      const originalConfig = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: started.competitionConfigVersionId } });
      await prisma.v1GamePeriod.updateMany({ where: { gameId: started.id, number: 1 }, data: { state: 'LIVE', startedAt: new Date() } });
      const pendingBefore = await Promise.all(pendingIds.map(gameOf));
      expect(pendingBefore.every(game => game.lineups.length > 0)).toBe(true);
      const beforeGlobals = await globalVersions();
      let saved: Awaited<ReturnType<typeof savePeriods>>;
      let ordinary: Awaited<ReturnType<typeof createMatch>>;
      if (order === 'host first') {
        ordinary = await createMatch(`일반 ${order} ${suiteId}`, minutes);
        expect(await globalVersions()).toEqual(beforeGlobals);
        saved = await savePeriods(leagueId, minutes);
      } else {
        saved = await savePeriods(leagueId, minutes);
        const options = await request(server()).get(`/api/v1/teams/${teamIds[0]}/team-match-rule-options`).set('x-v1-user-id', ownerId).expect(200);
        expect(options.body.data.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: minutes, extraTime: false }]);
        expect(options.body.data.twoPeriodDefaults).toEqual(originalConfig.periods);
        const afterAdminGlobals = await globalVersions();
        ordinary = await createMatch(`일반 ${order} ${suiteId}`, minutes);
        expect(await globalVersions()).toEqual(afterAdminGlobals);
      }
      expect(ordinary.competitionConfigVersionId).toBe(saved.competitionConfigVersionId);
      expect(ordinary.game?.competitionConfigVersionId).toBe(saved.competitionConfigVersionId);
      expect(saved.fixturesRepointed).toBe(pendingIds.length);
      const shared = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: saved.competitionConfigVersionId } });
      expect(shared.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: minutes, extraTime: false }]);
      for (const field of ['events', 'lineup', 'result', 'tieBreak', 'visibility'] as const) expect(shared[field]).toEqual(originalConfig[field]);
      for (const before of pendingBefore) {
        if (before.teamMatchId === null) throw new Error('A generated league Game must keep its canonical TeamMatch');
        const after = await gameOf(before.teamMatchId);
        expect(after.competitionConfigVersionId).toBe(shared.id);
        expect(after.teamMatch?.competitionConfigVersionId).toBe(shared.id);
        expect(after.periods.map(period => [period.number, period.state])).toEqual([[1, 'SCHEDULED']]);
        expect(after.lineups).toEqual(before.lineups);
      }
      const startedAfter = await gameOf(startedId);
      expect(startedAfter.competitionConfigVersionId).toBe(started.competitionConfigVersionId);
      expect(startedAfter.teamMatch?.competitionConfigVersionId).toBe(started.competitionConfigVersionId);
      expect(startedAfter.periods).toHaveLength(2);
      expect(await savePeriods(leagueId, minutes)).toMatchObject({ changed: false, fixturesRepointed: 0, competitionConfigVersionId: shared.id });
    },
  );

  it('stores the int4 boundary in the real config trigger and rejects overflow as HTTP400 before create writes', async () => {
    const accepted = await createMatch(`int4 max ${suiteId}`, 2147483647);
    expect(accepted.competitionConfig?.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 2147483647, extraTime: false }]);
    const counts = async () => Promise.all([
      prisma.v1CompetitionConfigVersion.count(), prisma.v1TeamMatch.count(), prisma.v1Game.count(),
      prisma.v1GamePeriod.count(), prisma.v1GameLineup.count(), prisma.v1IdempotencyRecord.count(),
    ]);
    const before = await counts();
    const rejected = await request(server()).post('/api/v1/team-matches').set('x-v1-user-id', ownerId)
      .send({ ...matchBody(`int4 overflow ${suiteId}`), periods: [{ durationMinutes: 2147483648 }] }).expect(400);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');
    expect(await counts()).toEqual(before);
  });

  it('rejects HTTP edit overflow without changing real pins, periods, DRAFT rosters, or config rows', async () => {
    const ordinary = await createMatch(`edit overflow ${suiteId}`);
    const edit = await request(server()).get(`/api/v1/team-matches/${ordinary.id}/edit`).set('x-v1-user-id', ownerId).expect(200);
    const before = await gameOf(ordinary.id);
    const configsBefore = await prisma.v1CompetitionConfigVersion.count();
    const rejected = await request(server()).patch(`/api/v1/team-matches/${ordinary.id}`).set('x-v1-user-id', ownerId)
      .send({ ...matchBody(ordinary.title), version: edit.body.data.version, periods: [{ durationMinutes: 2147483648 }] }).expect(400);
    expect(rejected.body.code).toBe('VALIDATION_ERROR');
    expect(await gameOf(ordinary.id)).toEqual(before);
    expect(await prisma.v1CompetitionConfigVersion.count()).toBe(configsBefore);
  });

  it('persists a successful ordinary rule PATCH, retains initial DRAFT identities, and protects no-op and stale edits', async () => {
    const ordinary = await createMatch(`successful PATCH ${suiteId}`, 53);
    const before = await gameOf(ordinary.id);
    expect(before.periods).toHaveLength(1); expect(before.lineups).toHaveLength(2);
    expect(before.lineups.every(lineup => lineup.state === 'DRAFT' && lineup.revision === 1)).toBe(true);
    expect(before.participants.length).toBeGreaterThan(0);
    const oldConfig = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: before.competitionConfigVersionId } });
    const edit = await request(server()).get(`/api/v1/team-matches/${ordinary.id}/edit`).set('x-v1-user-id', ownerId).expect(200);
    const updateBody = { ...matchBody(ordinary.title), periods: [{ durationMinutes: 31 }, { durationMinutes: 29 }] };
    await request(server()).patch(`/api/v1/team-matches/${ordinary.id}`).set('x-v1-user-id', ownerId)
      .send({ ...updateBody, version: edit.body.data.version }).expect(200);
    const after = await gameOf(ordinary.id);
    expect(after.competitionConfigVersionId).not.toBe(before.competitionConfigVersionId);
    expect(after.teamMatch?.competitionConfigVersionId).toBe(after.competitionConfigVersionId);
    expect(after.version).toBe(before.version + 1);
    expect(after.periods.map(period => [period.number, period.state, period.startedAt, period.endedAt, period.pausedAt, period.pausedTotalMs]))
      .toEqual([[1, 'SCHEDULED', null, null, null, 0], [2, 'SCHEDULED', null, null, null, 0]]);
    expect(after.periods.every(period => before.periods.every(previous => previous.id !== period.id))).toBe(true);
    expect(after.lineups).toEqual(before.lineups);
    expect(after.participants).toEqual(before.participants);
    const stored = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: after.competitionConfigVersionId } });
    expect(stored.periods).toMatchObject([{ code: 'FIRST_HALF', durationMinutes: 31 }, { code: 'SECOND_HALF', durationMinutes: 29 }]);
    for (const field of ['events', 'lineup', 'result', 'tieBreak', 'visibility'] as const) expect(stored[field]).toEqual(oldConfig[field]);
    expect(await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: oldConfig.id } })).toEqual(oldConfig);
    const currentEdit = await request(server()).get(`/api/v1/team-matches/${ordinary.id}/edit`).set('x-v1-user-id', ownerId).expect(200);
    const configCount = await prisma.v1CompetitionConfigVersion.count();
    await request(server()).patch(`/api/v1/team-matches/${ordinary.id}`).set('x-v1-user-id', ownerId)
      .send({ ...updateBody, version: currentEdit.body.data.version }).expect(200);
    expect(await gameOf(ordinary.id)).toMatchObject({ competitionConfigVersionId: after.competitionConfigVersionId, teamMatch: { competitionConfigVersionId: after.competitionConfigVersionId }, version: after.version, periods: after.periods, lineups: after.lineups, participants: after.participants });
    const beforeStale = await gameOf(ordinary.id);
    const stale = await request(server()).patch(`/api/v1/team-matches/${ordinary.id}`).set('x-v1-user-id', ownerId)
      .send({ ...updateBody, version: edit.body.data.version }).expect(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(await gameOf(ordinary.id)).toEqual(beforeStale);
    expect(await prisma.v1CompetitionConfigVersion.count()).toBe(configCount);
  });

  it('overlaps the actual host and tournament config INSERTs behind a PostgreSQL barrier and converges on one shared row', async () => {
    const minutes = 57; const { leagueId } = await leagueWithFixtures(`concurrent writers ${suiteId}`);
    const hostOptions = await request(server()).get(`/api/v1/teams/${teamIds[0]}/team-match-rule-options`).set('x-v1-user-id', ownerId).expect(200);
    const adminOptions = await request(server()).get(`/api/v1/admin/tournaments/${leagueId}/periods`).set('x-v1-user-id', ownerId).expect(200);
    const hostSource = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: hostOptions.body.data.competitionConfigVersionId } });
    const adminSource = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: adminOptions.body.data.competitionConfigVersionId } });
    const nonPeriods = (row: typeof hostSource) => ({ events: row.events, lineup: row.lineup, result: row.result, tieBreak: row.tieBreak, visibility: row.visibility });
    expect(canonicalize(nonPeriods(hostSource))).toBe(canonicalize(nonPeriods(adminSource)));
    const contentHash = competitionConfigContentHash(validateCompetitionConfig({
      ...nonPeriods(hostSource), periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: minutes, extraTime: false }],
    }, { preserveMissingCatalogKeys: true }));
    expect(await prisma.v1CompetitionConfigVersion.findUnique({ where: { contentHash } })).toBeNull();
    const configCount = await prisma.v1CompetitionConfigVersion.count(); const gateClient = new PrismaClient();
    const inFlight: Promise<unknown>[] = [];
    try {
      const { completion, waiting } = await gateClient.$transaction(async tx => {
        await tx.$executeRaw`LOCK TABLE public.v1_competition_config_versions IN SHARE MODE`;
        const [holder] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        if (!holder) throw new Error('The PostgreSQL barrier must expose its holding backend');
        const host = request(server()).post('/api/v1/team-matches').set('x-v1-user-id', ownerId)
          .send({ ...matchBody(`concurrent ordinary ${suiteId}`), periods: [{ durationMinutes: minutes }] }).timeout({ response: 12000, deadline: 15000 }).then(response => response);
        const admin = request(server()).patch(`/api/v1/admin/tournaments/${leagueId}/periods`).set('x-v1-user-id', ownerId)
          .send({ expectedVersion: adminOptions.body.data.expectedVersion, periods: [{ durationMinutes: minutes }] }).timeout({ response: 12000, deadline: 15000 }).then(response => response);
        inFlight.push(host, admin);
        const completion = Promise.allSettled([host, admin]);
        const waiting = await waitForPublicationInserts(tx, holder.pid);
        return { completion, waiting };
      }, { maxWait: 2000, timeout: 4000 });
      // Returning from the gate transaction commits/releases SHARE only after both real INSERTs were observed waiting.
      expect(new Set(waiting.map(row => row.pid)).size).toBe(2);
      expect(waiting.filter(row => /\bON\s+CONFLICT\b/i.test(row.query))).toHaveLength(1);
      const [host, admin] = await completion;
      if (!host || !admin || host.status !== 'fulfilled' || admin.status !== 'fulfilled') throw new AggregateError([host, admin], 'Concurrent publication HTTP calls did not both complete');
      expect({ status: host.value.status, body: host.value.body }).toMatchObject({ status: 201 });
      expect({ status: admin.value.status, body: admin.value.body }).toMatchObject({ status: 200 });
      const rows = await prisma.v1CompetitionConfigVersion.findMany({ where: { contentHash } });
      expect(rows).toHaveLength(1);
      const shared = rows[0];
      if (!shared) throw new Error('Both writers must converge on one persisted config');
      const persisted = await gameOf(host.value.body.data.teamMatchId);
      expect(persisted.competitionConfigVersionId).toBe(shared.id);
      expect(persisted.teamMatch?.competitionConfigVersionId).toBe(shared.id);
      expect(admin.value.body.data.competitionConfigVersionId).toBe(shared.id);
      expect((await findTournamentOnSurfaceOrThrow(prisma, LEAGUE_KINDS, { where: { id: leagueId }, select: { competitionConfigVersionId: true } })).competitionConfigVersionId).toBe(shared.id);
      expect(persisted.periods.map(period => [period.number, period.state])).toEqual([[1, 'SCHEDULED']]);
      expect(shared.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: minutes, extraTime: false }]);
      expect(await prisma.v1CompetitionConfigVersion.count()).toBe(configCount + 1);
    } finally {
      await Promise.allSettled(inFlight);
      await gateClient.$disconnect();
    }
  }, 20000);
});
