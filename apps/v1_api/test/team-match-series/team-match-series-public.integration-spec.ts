import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t4-series-public-owner-${suiteId}`;

describe('GET /team-match-series/:seriesId/standings', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: {
        id: ownerUserId,
        email: `${ownerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      ownerUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: ownerUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t4-series-pub-region-${suiteId}`, name: 'T4 공개 순위 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  it('공식 결과가 없으면 순위는 비고 pendingFixtures에 잡히며, 공식 결과가 확정되면 순위표에 반영된다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `pub-team-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `pub-team-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/team-match-series')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '순위표 테스트 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const seriesId = createRes.body.data.seriesId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/team-match-series/${seriesId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    const teamMatchId = fixturesRes.body.data.teamMatchIds[0];

    // 1단계: 아직 공식 결과 없음 — 순위표는 비고 pendingFixtures에 1건.
    // calculateSeriesStandings(Task 2)는 미확정 팀도 played=0 행으로 항상 채워 반환하도록
    // 설계·검증돼 있다(series-standings.spec.ts: "미확정 경기는 played=0으로 남아 순위 계산에서
    // 자연히 밀린다") — 그래서 여기서 기대값은 빈 배열이 아니라 두 팀 모두 played=0인 행이다.
    const pendingRes = await request(app.getHttpServer()).get(`/api/v1/team-match-series/${seriesId}/standings`);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.standings).toHaveLength(2);
    expect(pendingRes.body.data.standings.every((row: { played: number }) => row.played === 0)).toBe(true);
    expect(pendingRes.body.data.pendingFixtures).toHaveLength(1);

    // 2단계: 공식 결과를 직접 확정 상태로 합성한다(v1_guard_game_official_fact_insert 트리거가
    // revision.state='OFFICIAL' + score/eventsHash/officialAt 정확 일치를 강제하므로 그대로 맞춘다).
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const homeTeam = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    const officialAt = new Date('2026-08-10T12:00:00.000Z');
    const score = { home: 3, away: 1 };
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score,
        eventsHash: `t4-standings-hash-${suiteId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T4_SERIES_STANDINGS_TEST',
        submittedAt: officialAt,
        officialAt,
      },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });
    await prisma.v1GameOfficialFact.create({
      data: {
        revisionId: revision.id,
        gameId: game.id,
        revision: 1,
        sourceType: 'TEAM_MATCH',
        homeTeamId: homeTeam.hostTeamId,
        awayTeamId: homeTeam.approvedApplicantTeamId!,
        homeScore: score.home,
        awayScore: score.away,
        score,
        eventsHash: `t4-standings-hash-${suiteId}`,
        officialAt,
      },
    });

    const confirmedRes = await request(app.getHttpServer()).get(`/api/v1/team-match-series/${seriesId}/standings`);
    expect(confirmedRes.status).toBe(200);
    expect(confirmedRes.body.data.pendingFixtures).toEqual([]);
    expect(confirmedRes.body.data.standings[0]).toMatchObject({ teamId: teamA.id, points: 3, position: 1 });
    expect(confirmedRes.body.data.standings[1]).toMatchObject({ teamId: teamB.id, points: 0, position: 2 });
  });
});
