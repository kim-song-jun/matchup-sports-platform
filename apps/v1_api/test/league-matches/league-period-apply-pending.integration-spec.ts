import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

// 리그 경기는 대진을 만들 때 그때의 설정 버전에 고정된다. 피리어드 설정을 나중에 바꾸면
// 이미 만든 경기가 옛 설정(전반·후반)으로 남아 "1피리어드로 바꿨는데 전반으로 기록된다"는 제보가 났다.
// 이 스펙은 시작 전 경기는 새 피리어드를 따르고, 시작한 경기는 그대로 남는지를 실제 DB 로 잰다.
const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `lpa-owner-${suiteId}`;

describe('리그 피리어드 설정이 시작 전 경기에 반영된다', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let teamIds: string[];

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: { id: ownerUserId, email: `${ownerUserId}@integration.test`, onboardingStatus: 'completed', phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'), accountStatus: 'active' },
    });
    const terms = app.get(ManagedTermsRuntimeService);
    const signupTerms = await terms.currentSignupTerms();
    await terms.acceptSignupTerms(ownerUserId, signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId));
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `lpa-region-${suiteId}`, name: 'LPA 테스트 지역', level: 2 } })).id;
    const teams = await Promise.all(['a', 'b', 'c', 'd'].map((suffix) =>
      prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `lpa-team-${suffix}-${suiteId}` } })));
    teamIds = teams.map((team) => team.id);
  });

  afterAll(async () => cleanup?.());

  const server = () => app.getHttpServer();
  const futureDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + 7 * 86_400_000));

  async function leagueWithFixtures(title: string) {
    const created = await request(server()).post('/api/v1/admin/league-matches').set('x-v1-user-id', ownerUserId)
      .send({ title, sportId, regionId, startsOn: '2026-08-31T00:00:00.000Z', endsOn: '2027-12-01T00:00:00.000Z', teamIds });
    expect(created.status).toBe(201);
    const leagueId: string = created.body.data.leagueId;
    const fixtures = await request(server()).post(`/api/v1/admin/league-matches/${leagueId}/fixtures`).set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 3, schedule: { dates: [futureDate], time: '22:00' }, timing: { gameDurationMinutes: 40, breakMinutes: 5, gamesPerDay: 6 } });
    expect(fixtures.status).toBe(201);
    return { leagueId, teamMatchIds: fixtures.body.data.teamMatchIds as string[] };
  }

  async function savePeriods(leagueId: string, minutes: number[]) {
    const current = await request(server()).get(`/api/v1/admin/tournaments/${leagueId}/periods`).set('x-v1-user-id', ownerUserId).expect(200);
    const saved = await request(server()).patch(`/api/v1/admin/tournaments/${leagueId}/periods`).set('x-v1-user-id', ownerUserId)
      .send({ expectedVersion: current.body.data.expectedVersion, periods: minutes.map((durationMinutes) => ({ durationMinutes })) });
    expect(saved.status).toBe(200);
    return saved.body.data as { changed: boolean; fixturesRepointed: number; competitionConfigVersionId: string };
  }

  const gameOf = (teamMatchId: string) => prisma.v1Game.findUniqueOrThrow({
    where: { teamMatchId },
    select: { id: true, competitionConfigVersionId: true, periods: { select: { number: true, state: true }, orderBy: { number: 'asc' } }, teamMatch: { select: { competitionConfigVersionId: true } } },
  });

  it('1피리어드 15분으로 바꾸면 시작 전 경기는 단일 피리어드가 되고 시작한 경기는 전반·후반 그대로다', async () => {
    const { leagueId, teamMatchIds } = await leagueWithFixtures('피리어드 반영 리그');
    const [startedId, ...pendingIds] = teamMatchIds;
    const started = await gameOf(startedId);
    const oldVersionId = started.competitionConfigVersionId;
    expect(started.periods).toHaveLength(2);
    // 첫 경기는 전반이 이미 시작된 상태로 만든다.
    await prisma.v1GamePeriod.updateMany({ where: { gameId: started.id, number: 1 }, data: { state: 'LIVE', startedAt: new Date() } });
    // 리그 경기는 만들 때 참가팀 라인업이 함께 생긴다 — 라인업이 있어도 시작 전이면 새 피리어드를 따라야 한다.
    expect(await prisma.v1GameLineup.count({ where: { game: { teamMatchId: { in: pendingIds } } } })).toBeGreaterThan(0);

    const saved = await savePeriods(leagueId, [15]);

    expect(saved.changed).toBe(true);
    expect(saved.fixturesRepointed).toBe(pendingIds.length);
    const newVersion = await prisma.v1CompetitionConfigVersion.findUniqueOrThrow({ where: { id: saved.competitionConfigVersionId } });
    expect(newVersion.periods).toEqual([{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 15, extraTime: false }]);
    for (const id of pendingIds) {
      const game = await gameOf(id);
      expect(game.competitionConfigVersionId).toBe(newVersion.id);
      expect(game.teamMatch?.competitionConfigVersionId).toBe(newVersion.id);
      expect(game.periods).toEqual([{ number: 1, state: 'SCHEDULED' }]);
    }
    const startedAfter = await gameOf(startedId);
    expect(startedAfter.competitionConfigVersionId).toBe(oldVersionId);
    expect(startedAfter.teamMatch?.competitionConfigVersionId).toBe(oldVersionId);
    expect(startedAfter.periods).toHaveLength(2);
  });

  it('예전에 설정만 바꿔 옛 버전에 남은 경기는 같은 값을 다시 저장하면 따라온다', async () => {
    const { leagueId, teamMatchIds } = await leagueWithFixtures('예전 경기 재저장 리그');
    const oldVersionId = (await gameOf(teamMatchIds[0])).competitionConfigVersionId;
    const first = await savePeriods(leagueId, [15]);
    // 이 수정 전처럼 대회 설정만 바뀌고 경기는 옛 버전·전반/후반에 남은 상태를 되돌려 만든다.
    for (const id of teamMatchIds) {
      const game = await gameOf(id);
      await prisma.v1TeamMatch.update({ where: { id }, data: { competitionConfigVersionId: oldVersionId } });
      await prisma.v1Game.update({ where: { id: game.id }, data: { competitionConfigVersionId: oldVersionId } });
      await prisma.v1GamePeriod.create({ data: { gameId: game.id, number: 2 } });
    }

    const resaved = await savePeriods(leagueId, [15]);

    expect(resaved.changed).toBe(false);
    expect(resaved.fixturesRepointed).toBe(teamMatchIds.length);
    for (const id of teamMatchIds) {
      const game = await gameOf(id);
      expect(game.competitionConfigVersionId).toBe(first.competitionConfigVersionId);
      expect(game.periods).toEqual([{ number: 1, state: 'SCHEDULED' }]);
    }
    // 이미 맞춰진 뒤 또 저장하면 옮길 경기가 없다.
    expect((await savePeriods(leagueId, [15])).fixturesRepointed).toBe(0);
  });
});
