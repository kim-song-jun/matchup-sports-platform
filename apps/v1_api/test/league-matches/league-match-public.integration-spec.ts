import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { createV1IntegrationApp } from '../integration/integration-app';

const suiteId = randomUUID().slice(0, 8);
const ownerUserId = `t4-league-public-owner-${suiteId}`;

describe('GET /league-matches/:leagueId/standings', () => {
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
      data: { code: `t4-league-pub-region-${suiteId}`, name: 'T4 공개 순위 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  it('공식 결과가 없으면 순위는 비고 pendingFixtures에 잡히며, 공식 결과가 확정되면 순위표에 반영된다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `pub-team-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `pub-team-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '순위표 테스트 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', ownerUserId)
      .send({ weeksCount: 1 });
    const teamMatchId = fixturesRes.body.data.teamMatchIds[0];

    // 1단계: 아직 공식 결과 없음 — 순위표는 비고 pendingFixtures에 1건.
    // calculateLeagueStandings(Task 2)는 미확정 팀도 played=0 행으로 항상 채워 반환하도록
    // 설계·검증돼 있다(series-standings.spec.ts: "미확정 경기는 played=0으로 남아 순위 계산에서
    // 자연히 밀린다") — 그래서 여기서 기대값은 빈 배열이 아니라 두 팀 모두 played=0인 행이다.
    const pendingRes = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
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

    const confirmedRes = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
    expect(confirmedRes.status).toBe(200);
    expect(confirmedRes.body.data.pendingFixtures).toEqual([]);
    expect(confirmedRes.body.data.standings[0]).toMatchObject({ teamId: teamA.id, points: 3, position: 1 });
    expect(confirmedRes.body.data.standings[1]).toMatchObject({ teamId: teamB.id, points: 0, position: 2 });
  });
});

const recordsOwnerUserId = `t4-league-records-owner-${suiteId}`;

describe('GET /league-matches/:leagueId/player-records', () => {
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
        id: recordsOwnerUserId,
        email: `${recordsOwnerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      recordsOwnerUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: recordsOwnerUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t4-league-records-region-${suiteId}`, name: 'T4 개인기록 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  it('공식 결과에 반영된 어시스트가 도움 순위에 실제로 집계되고, 동의 없는 참가자는 제외된다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId: recordsOwnerUserId, sportId, regionId, name: `pub-team-c-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId: recordsOwnerUserId, sportId, regionId, name: `pub-team-d-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', recordsOwnerUserId)
      .send({
        title: '개인기록 테스트 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', recordsOwnerUserId)
      .send({ weeksCount: 1 });
    const teamMatchId = fixturesRes.body.data.teamMatchIds[0];

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const homeSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: game.id, sideKey: 'HOME' } });

    // 득점왕 유저: 골 2, 어시스트 1.
    const scorerUserId = `t4-league-records-scorer-${suiteId}`;
    // 도움왕 유저: 골 0, 어시스트 3 -- 골 순위엔 안 뜨지만 도움 순위엔 1위로 떠야 한다.
    const assisterUserId = `t4-league-records-assister-${suiteId}`;
    // 동의 철회/미연동 게스트: 골 5, 어시스트 5를 넣어도 두 순위 어디에도 나오면 안 된다.
    await prisma.v1User.createMany({
      data: [scorerUserId, assisterUserId].map((id) => ({
        id,
        email: `${id}@integration.test`,
        onboardingStatus: 'completed',
        accountStatus: 'active',
      })),
    });
    await prisma.v1UserProfile.createMany({
      data: [
        { userId: scorerUserId, nickname: 'T4골잡이' },
        { userId: assisterUserId, nickname: 'T4도우미' },
      ],
    });

    const scorerParticipantId = randomUUID();
    const assisterParticipantId = randomUUID();
    const guestParticipantId = randomUUID();
    const officialAt = new Date('2026-08-11T12:00:00.000Z');
    const consentEffectiveAt = new Date('2026-08-01T00:00:00.000Z');

    await prisma.v1ParticipantIdentityLinkCurrent.createMany({
      data: [
        { participantId: scorerParticipantId, linkId: `link-scorer-${suiteId}`, userId: scorerUserId, version: 1, effectiveFrom: consentEffectiveAt },
        { participantId: assisterParticipantId, linkId: `link-assister-${suiteId}`, userId: assisterUserId, version: 1, effectiveFrom: consentEffectiveAt },
      ],
    });
    await prisma.v1ParticipantConsentSnapshot.createMany({
      data: [
        {
          participantId: scorerParticipantId,
          linkId: `link-scorer-${suiteId}`,
          consentVersion: 1,
          state: 'GRANTED',
          effectiveAt: consentEffectiveAt,
          policyHash: 't4-records-policy-hash',
          actorUserId: scorerUserId,
        },
        {
          participantId: assisterParticipantId,
          linkId: `link-assister-${suiteId}`,
          consentVersion: 1,
          state: 'GRANTED',
          effectiveAt: consentEffectiveAt,
          policyHash: 't4-records-policy-hash',
          actorUserId: assisterUserId,
        },
      ],
    });
    // `guestParticipantId`는 identity link/consent 레코드가 아예 없다 -- 동의 미연동 상태.
    // Task 24 규칙 재정의(2026-08-13): 공개 동의가 사용자 단위 `V1UserRecordConsent`로
    // 옮겨갔다 -- 이게 없으면 위 participant 단위 스냅샷이 GRANTED여도 순위에서 빠진다.
    await prisma.v1UserRecordConsent.createMany({
      data: [
        { userId: scorerUserId, state: 'GRANTED', policyHash: 't4-records-policy-hash' },
        { userId: assisterUserId, state: 'GRANTED', policyHash: 't4-records-policy-hash' },
      ],
    });

    // v1_guard_result_participant_mutation 트리거가 참가자 행 insert 시점의
    // 리비전 상태를 DRAFT로 강제하므로, 먼저 DRAFT로 만들고 참가자를 넣은 뒤
    // OFFICIAL로 전환한다(참가자 행 자체는 건드리지 않는 업데이트라 안전).
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'DRAFT',
        score: { home: 5, away: 2 },
        eventsHash: `t4-records-hash-${suiteId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T4_SERIES_RECORDS_TEST',
      },
    });
    await prisma.v1GameResultParticipant.createMany({
      data: [
        {
          resultRevisionId: revision.id,
          participantId: scorerParticipantId,
          sideId: homeSide.id,
          started: true,
          goals: 2,
          assists: 1,
          cards: { yellow: 0, red: 0 },
        },
        {
          resultRevisionId: revision.id,
          participantId: assisterParticipantId,
          sideId: homeSide.id,
          started: true,
          goals: 0,
          assists: 3,
          cards: { yellow: 0, red: 0 },
        },
        {
          resultRevisionId: revision.id,
          participantId: guestParticipantId,
          sideId: homeSide.id,
          started: true,
          goals: 5,
          assists: 5,
          cards: { yellow: 0, red: 0 },
        },
      ],
    });
    await prisma.v1GameResultRevision.update({
      where: { id: revision.id },
      data: { state: 'OFFICIAL', submittedAt: officialAt, officialAt },
    });
    await prisma.v1Game.update({ where: { id: game.id }, data: { currentOfficialRevisionId: revision.id } });

    const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/player-records`);
    expect(res.status).toBe(200);

    expect(res.body.data.goals).toEqual([
      { userId: scorerUserId, nickname: 'T4골잡이', goals: 2, assists: 1 },
      { userId: assisterUserId, nickname: 'T4도우미', goals: 0, assists: 3 },
    ]);
    expect(res.body.data.assists).toEqual([
      { userId: assisterUserId, nickname: 'T4도우미', goals: 0, assists: 3 },
      { userId: scorerUserId, nickname: 'T4골잡이', goals: 2, assists: 1 },
    ]);
    // `guestParticipantId`는 골 5·어시스트 5를 기록했지만 identity link가 없어
    // 두 순위 모두 정확히 2행(scorer, assister)이어야 한다 — 위 toEqual이 이미
    // "정확히 이 두 행만" 을 강제하므로 게스트 혼입 시 여기서 실패한다.
  });
});
