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
    // 대진 생성기가 teamA/teamB 중 누구를 홈으로 배정하는지는 계약이 아니다 — 실제 배정을
    // 읽어 기대 순위를 도출한다(홈 3:1 승리 → 홈=승점 3/1위, 원정=승점 0/2위).
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    const homeTeamId = teamMatch.hostTeamId;
    const awayTeamId = teamMatch.approvedApplicantTeamId!;
    expect([homeTeamId, awayTeamId].sort()).toEqual([teamA.id, teamB.id].sort());
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
        homeTeamId,
        awayTeamId,
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
    expect(confirmedRes.body.data.standings[0]).toMatchObject({ teamId: homeTeamId, points: 3, position: 1 });
    expect(confirmedRes.body.data.standings[1]).toMatchObject({ teamId: awayTeamId, points: 0, position: 2 });
  });

  it('취소된 대진은 공식 결과 fact가 있어도 순위·pendingFixtures 어디에도 반영되지 않는다 (R8)', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `pub-cancel-team-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId, sportId, regionId, name: `pub-cancel-team-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', ownerUserId)
      .send({
        title: '취소 반영 테스트 리그',
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

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    const homeTeamId = teamMatch.hostTeamId;
    const awayTeamId = teamMatch.approvedApplicantTeamId!;
    const officialAt = new Date('2026-08-12T12:00:00.000Z');
    const score = { home: 5, away: 0 };
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score,
        eventsHash: `t4-cancel-hash-${suiteId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T4_SERIES_CANCEL_TEST',
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
        homeTeamId,
        awayTeamId,
        homeScore: score.home,
        awayScore: score.away,
        score,
        eventsHash: `t4-cancel-hash-${suiteId}`,
        officialAt,
      },
    });

    // 공식 결과가 이미 존재하는 상태에서 어드민이 사후에 취소한다(오심·오입력 정정 시나리오).
    await prisma.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'cancelled', cancelledAt: new Date() } });

    const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
    expect(res.status).toBe(200);
    // 두 팀 모두 played=0 -- 취소된 경기는 순위 계산에 전혀 반영되지 않는다(R8 이전에는
    // fact가 있으므로 confirmed로 남아 played=1이 됐을 것이다).
    expect(res.body.data.standings.every((row: { played: number }) => row.played === 0)).toBe(true);
    // "예정 경기"로도 남지 않는다.
    expect(res.body.data.pendingFixtures).toEqual([]);
  });
});

const detailOwnerUserId = `t4-league-detail-owner-${suiteId}`;

describe('GET /league-matches/:leagueId (detail, R1)', () => {
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
        id: detailOwnerUserId,
        email: `${detailOwnerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      detailOwnerUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: detailOwnerUserId, adminRole: 'owner' } });
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'futsal' },
      update: {},
      create: { code: 'futsal', name: '풋살' },
    });
    sportId = sport.id;
    const region = await prisma.v1Region.create({
      data: { code: `t4-league-detail-region-${suiteId}`, name: 'T4 리그 상세 테스트 지역', level: 2 },
    });
    regionId = region.id;
  });

  afterAll(async () => cleanup?.());

  it('fixtures[]는 확정된 대진에 homeScore/awayScore를 채우고, 미확정 대진은 null로 내려준다', async () => {
    const teamA = await prisma.v1Team.create({ data: { ownerUserId: detailOwnerUserId, sportId, regionId, name: `detail-team-a-${suiteId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId: detailOwnerUserId, sportId, regionId, name: `detail-team-b-${suiteId}` } });

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', detailOwnerUserId)
      .send({
        title: '상세 스코어 리그',
        sportId,
        regionId,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        teamIds: [teamA.id, teamB.id],
      });
    const leagueId = createRes.body.data.leagueId;
    const fixturesRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures`)
      .set('x-v1-user-id', detailOwnerUserId)
      .send({ weeksCount: 2 });
    const [fixture1Id, fixture2Id] = fixturesRes.body.data.teamMatchIds;

    // fixture1만 공식 결과를 확정한다. fixture2는 미확정 상태로 남긴다.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: fixture1Id } });
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixture1Id } });
    const homeTeamId = teamMatch.hostTeamId;
    const awayTeamId = teamMatch.approvedApplicantTeamId!;
    const officialAt = new Date('2026-08-10T12:00:00.000Z');
    const score = { home: 4, away: 2 };
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'OFFICIAL',
        score,
        eventsHash: `t4-detail-hash-${suiteId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'T4_LEAGUE_DETAIL_TEST',
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
        homeTeamId,
        awayTeamId,
        homeScore: score.home,
        awayScore: score.away,
        score,
        eventsHash: `t4-detail-hash-${suiteId}`,
        officialAt,
      },
    });

    const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`);
    expect(res.status).toBe(200);
    const fixtures: Array<{ teamMatchId: string; homeScore: number | null; awayScore: number | null }> = res.body.data.fixtures;
    const fixture1 = fixtures.find((f) => f.teamMatchId === fixture1Id);
    const fixture2 = fixtures.find((f) => f.teamMatchId === fixture2Id);
    expect(fixture1).toMatchObject({ homeScore: score.home, awayScore: score.away });
    expect(fixture2).toMatchObject({ homeScore: null, awayScore: null });
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

    // 골 순위는 골이 1개 이상인 선수만 — 어시스트만 있는 assister는 여기 나오면 안 된다.
    expect(res.body.data.goals).toEqual([
      { userId: scorerUserId, nickname: 'T4골잡이', goals: 2, assists: 1 },
    ]);
    expect(res.body.data.assists).toEqual([
      { userId: assisterUserId, nickname: 'T4도우미', goals: 0, assists: 3 },
      { userId: scorerUserId, nickname: 'T4골잡이', goals: 2, assists: 1 },
    ]);
    // `guestParticipantId`는 골 5·어시스트 5를 기록했지만 identity link가 없어
    // 두 순위 어디에도 나오면 안 된다 — 위 toEqual이 "정확히 이 행들만" 을
    // 강제하므로 게스트 혼입 시 여기서 실패한다.
  });
});

const listOwnerUserId = `t5-league-list-owner-${suiteId}`;

describe('GET /league-matches (list, R5)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    await prisma.v1User.create({
      data: {
        id: listOwnerUserId,
        email: `${listOwnerUserId}@integration.test`,
        onboardingStatus: 'completed',
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        accountStatus: 'active',
      },
    });
    const termsService = app.get(ManagedTermsRuntimeService);
    const signupTerms = await termsService.currentSignupTerms();
    await termsService.acceptSignupTerms(
      listOwnerUserId,
      signupTerms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId),
    );
    await prisma.v1AdminUser.create({ data: { userId: listOwnerUserId, adminRole: 'owner' } });
  });

  afterAll(async () => cleanup?.());

  // 각 테스트가 자기 전용 종목/지역/팀을 만든다 -- 같은 describe 안 다른 테스트가 만든
  // 리그와 뒤섞이면 필터·페이지네이션 단언이 "정확히 이 리그들만"을 보장할 수 없다.
  /**
   * `sportCode` 기본값이 `futsal` 인 이유: 대진 생성이 종목의 활성 경기 설정을 요구한다
   * (`resolveTeamMatchCompetitionConfig` — 코드가 futsal/soccer/football 일 때만 `<code>-v1`
   * 설정을 찾는다). 스코프별로 새 종목을 만들면 **409 COMPETITION_CONFIG_REQUIRED** 로 막힌다.
   *
   * **다만 종목이 서로 달라야 하는 테스트가 있다** — 종목 필터는 "다른 종목의 리그가 빠지는가"
   * 를 보므로 두 시나리오가 같은 종목이면 통과할 수가 없다. 그런 테스트는 `sportCode` 를 넘겨
   * 종목을 가르되, **대진을 만들지 않으므로** 설정이 없어도 된다.
   */
  async function createLeagueScenario(opts: {
    title: string;
    startsOn: string;
    endsOn: string;
    sportCode?: string;
  }) {
    const scopeId = randomUUID().slice(0, 8);
    const sportCode = opts.sportCode ?? 'futsal';
    const sport = await prisma.v1Sport.upsert({
      where: { code: sportCode },
      update: {},
      create: { code: sportCode, name: sportCode === 'futsal' ? '풋살' : `T5 종목 ${scopeId}` },
    });
    const region = await prisma.v1Region.create({ data: { code: `t5-list-region-${scopeId}`, name: `T5 목록 지역 ${scopeId}`, level: 2 } });
    const teamA = await prisma.v1Team.create({ data: { ownerUserId: listOwnerUserId, sportId: sport.id, regionId: region.id, name: `t5-list-team-a-${scopeId}` } });
    const teamB = await prisma.v1Team.create({ data: { ownerUserId: listOwnerUserId, sportId: sport.id, regionId: region.id, name: `t5-list-team-b-${scopeId}` } });
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/league-matches')
      .set('x-v1-user-id', listOwnerUserId)
      .send({ title: opts.title, sportId: sport.id, regionId: region.id, startsOn: opts.startsOn, endsOn: opts.endsOn, teamIds: [teamA.id, teamB.id] });
    expect(createRes.status).toBe(201);
    return { leagueId: createRes.body.data.leagueId as string, sportId: sport.id, regionId: region.id, teamAId: teamA.id, teamBId: teamB.id };
  }

  it('인증 헤더 없이도(비인증) 목록을 조회할 수 있다', async () => {
    // .set('x-v1-user-id', ...) 를 의도적으로 붙이지 않는다 -- OptionalV1AuthGuard가
    // 익명 접근을 허용하는지가 이 테스트의 계약이다.
    const res = await request(app.getHttpServer()).get('/api/v1/league-matches');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('sportId/regionId 필터가 다른 종목·지역의 리그를 제외한다', async () => {
    // **A 도 고유 종목이어야 한다.** 아래 단언은 `toEqual([A])` — 완전 일치라 A 의 종목으로
    // 걸렀을 때 **하나만** 와야 한다. 기본값 futsal 을 쓰면 이 스위트의 다른 테스트가 만든
    // futsal 리그가 전부 섞인다(CI 실측: 1개 기대에 5개 반환).
    const scenarioA = await createLeagueScenario({
      title: `T5 필터 A ${suiteId}`,
      startsOn: '2026-09-01T00:00:00.000Z',
      endsOn: '2026-09-30T00:00:00.000Z',
      sportCode: `t5-filter-a-${suiteId}`,
    });
    // B 는 **종목이 달라야 한다** — 아래 첫 단언이 "A 의 종목으로 거르면 B 가 빠진다" 다.
    // 이 시나리오는 대진을 만들지 않으므로 경기 설정이 없는 종목이어도 된다.
    const scenarioB = await createLeagueScenario({
      title: `T5 필터 B ${suiteId}`,
      startsOn: '2026-09-02T00:00:00.000Z',
      endsOn: '2026-09-30T00:00:00.000Z',
      sportCode: `t5-filter-b-${suiteId}`,
    });

    const bySport = await request(app.getHttpServer()).get(`/api/v1/league-matches?sportId=${scenarioA.sportId}`);
    expect(bySport.status).toBe(200);
    const sportFilteredIds = bySport.body.data.items.map((item: { leagueId: string }) => item.leagueId);
    expect(sportFilteredIds).toEqual([scenarioA.leagueId]);

    const byRegion = await request(app.getHttpServer()).get(`/api/v1/league-matches?regionId=${scenarioB.regionId}`);
    expect(byRegion.status).toBe(200);
    const regionFilteredIds = byRegion.body.data.items.map((item: { leagueId: string }) => item.leagueId);
    expect(regionFilteredIds).toEqual([scenarioB.leagueId]);

    // 응답 item 모양 -- 화면이 쓰는 필드가 실제로 담겨 있는지(제목·종목명·지역명·기간·상태·참가팀 수).
    expect(bySport.body.data.items[0]).toMatchObject({
      leagueId: scenarioA.leagueId,
      title: `T5 필터 A ${suiteId}`,
      state: 'draft',
      sport: { sportId: scenarioA.sportId },
      region: { regionId: scenarioA.regionId },
      teamCount: 2,
    });
  });

  // **이 테스트는 종목을 격리할 수 없다** — 대진을 만들어야 하고(아래 weeksCount), 대진 생성은
  // 경기 설정이 있는 종목(futsal)을 요구한다. 그래서 격리를 `regionId` 로 한다 — 지역은
  // 시나리오마다 새로 만들어지므로 이 테스트의 리그만 걸린다. 이 테스트의 계약은 **상태**
  // 필터이지 종목 필터가 아니므로 무엇으로 좁히든 계약은 그대로다.
  it('state 필터가 draft/active를 구분한다 -- 대진 생성 전은 draft, 생성 후는 active', async () => {
    const scenario = await createLeagueScenario({ title: `T5 상태 ${suiteId}`, startsOn: '2026-09-05T00:00:00.000Z', endsOn: '2026-09-30T00:00:00.000Z' });

    const draftBefore = await request(app.getHttpServer()).get(`/api/v1/league-matches?regionId=${scenario.regionId}&state=draft`);
    expect(draftBefore.body.data.items.map((item: { leagueId: string }) => item.leagueId)).toEqual([scenario.leagueId]);
    const activeBefore = await request(app.getHttpServer()).get(`/api/v1/league-matches?regionId=${scenario.regionId}&state=active`);
    expect(activeBefore.body.data.items).toEqual([]);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${scenario.leagueId}/fixtures`)
      .set('x-v1-user-id', listOwnerUserId)
      .send({ weeksCount: 1 })
      .expect(201);

    const activeAfter = await request(app.getHttpServer()).get(`/api/v1/league-matches?regionId=${scenario.regionId}&state=active`);
    expect(activeAfter.body.data.items.map((item: { leagueId: string }) => item.leagueId)).toEqual([scenario.leagueId]);
    const draftAfter = await request(app.getHttpServer()).get(`/api/v1/league-matches?regionId=${scenario.regionId}&state=draft`);
    expect(draftAfter.body.data.items).toEqual([]);
  });

  it('cursor 페이지네이션이 중복·누락 없이 다음 페이지로 이어지고, 마지막 페이지는 hasNext=false다', async () => {
    const scopeId = randomUUID().slice(0, 8);
    // **고유 종목이어야 한다** — 이 테스트는 목록을 페이지로 훑으며 `toEqual` 로 완전 일치를
    // 단언한다. 공유 futsal 을 쓰면 이 스위트의 다른 테스트가 만든 리그가 페이지에 섞인다
    // (CI 실측: 기대와 전혀 다른 두 리그가 첫 페이지에 왔다). 대진을 만들지 않으므로
    // 경기 설정이 없는 종목이어도 된다.
    const sport = await prisma.v1Sport.upsert({
      where: { code: `t5-list-page-sport-${scopeId}` },
      update: {},
      create: { code: `t5-list-page-sport-${scopeId}`, name: `T5 페이지 종목 ${scopeId}` },
    });
    const region = await prisma.v1Region.create({ data: { code: `t5-list-page-region-${scopeId}`, name: `T5 페이지 지역 ${scopeId}`, level: 2 } });
    // 서비스 기본 정렬은 createdAt desc(최근 개설순)다 -- 순차로(await) 3개를 만들면
    // 마지막에 만든 리그가 가장 먼저 나와야 한다. leagueIds는 "만든 순서"(day 1→2→3)이므로
    // 기대 목록 순서는 그 역순([2, 1, 0])이다.
    const leagueIds: string[] = [];
    for (const day of [1, 2, 3]) {
      const teamA = await prisma.v1Team.create({ data: { ownerUserId: listOwnerUserId, sportId: sport.id, regionId: region.id, name: `t5-page-team-a-${scopeId}-${day}` } });
      const teamB = await prisma.v1Team.create({ data: { ownerUserId: listOwnerUserId, sportId: sport.id, regionId: region.id, name: `t5-page-team-b-${scopeId}-${day}` } });
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/admin/league-matches')
        .set('x-v1-user-id', listOwnerUserId)
        .send({
          title: `T5 페이지 ${day} ${scopeId}`,
          sportId: sport.id,
          regionId: region.id,
          startsOn: `2026-11-0${day}T00:00:00.000Z`,
          endsOn: '2026-11-30T00:00:00.000Z',
          teamIds: [teamA.id, teamB.id],
        });
      leagueIds.push(createRes.body.data.leagueId);
    }

    const page1 = await request(app.getHttpServer()).get(`/api/v1/league-matches?sportId=${sport.id}&limit=2`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.items.map((item: { leagueId: string }) => item.leagueId)).toEqual([leagueIds[2], leagueIds[1]]);
    expect(page1.body.data.pageInfo.hasNext).toBe(true);
    // 커서는 3e7240133 에서 `<state>:<id>` 복합 포맷이 됐다 — 공개 목록 정렬을 "내 리그"와
    // 같은 상태 우선으로 통일하면서 "어느 상태 그룹의 어디까지 왔는가"를 한 커서로 복원해야
    // 하기 때문이다. 이 픽스처의 리그는 대진 생성 전이라 전부 draft 다.
    expect(page1.body.data.pageInfo.nextCursor).toBe(`draft:${leagueIds[1]}`);

    const page2 = await request(app.getHttpServer()).get(
      `/api/v1/league-matches?sportId=${sport.id}&limit=2&cursor=${page1.body.data.pageInfo.nextCursor}`,
    );
    expect(page2.status).toBe(200);
    expect(page2.body.data.items.map((item: { leagueId: string }) => item.leagueId)).toEqual([leagueIds[0]]);
    expect(page2.body.data.pageInfo.hasNext).toBe(false);
    expect(page2.body.data.pageInfo.nextCursor).toBeNull();
  });
});
