import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { syncCompetitionTeamRosters } from '../../src/games/roster/game-roster-sync';
import { createLeagueFixture, loadLeagueTeamRosters } from '../../src/league-matches/league-fixture-creation';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../src/team-matches/resolve-team-match-competition-config';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { TournamentPlayersService } from '../../src/tournaments/tournament-players.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 178 — 경기 단위 명단 API(GET roster · POST/DELETE roster-adjustments · GET 변경 기록).
 *
 * 인가는 "그 사이드 팀"이 기준이라, 대회 fixture 를 A·B·C 세 팀 · 경기 둘(g1 A-B, g2 A-C)로 두고
 * 상대팀 팀장·다른 경기·다른 사이드가 영향을 받지 않는지를 함께 단언한다.
 */
describe('경기 명단 조정 API (Task 178)', () => {
  const suiteId = randomUUID().slice(0, 8);
  const DAY = 86_400_000;
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let configId: string;
  let requiredTermIds: string[];
  let seq = 0;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    regionId = (await prisma.v1Region.create({ data: { code: `gra-region-${suiteId}`, name: '명단 조정 지역', level: 2 } })).id;
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 preset is required');
    configId = config.id;
    const terms = await app.get(ManagedTermsRuntimeService).currentSignupTerms();
    requiredTermIds = terms.items.filter((item) => item.requirement === 'required').map((item) => item.documentId);
  });

  afterAll(async () => cleanup?.());

  const inTx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

  /** HTTP 쓰기는 휴대폰 인증·약관 동의 게이트를 지나야 한다(V1AuthGuard). */
  async function makeUser(label: string): Promise<string> {
    seq += 1;
    const id = `gra-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0103177${String(seq).padStart(4, '0')}`,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: `${label}-${seq}`, realName: `${label}${seq}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    await app.get(ManagedTermsRuntimeService).acceptSignupTerms(id, requiredTermIds);
    return id;
  }

  async function makeTeam(label: string, memberLabels: readonly string[]) {
    const ownerId = await makeUser(`${label}장`);
    const managerId = await makeUser(`${label}매니저`);
    const team = await prisma.v1Team.create({ data: { ownerUserId: ownerId, sportId, regionId, name: `gra-${label}-${suiteId}-${seq}` } });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: team.id, userId: ownerId, role: 'owner', status: 'active' },
        { teamId: team.id, userId: managerId, role: 'manager', status: 'active' },
      ],
    });
    const members: string[] = [];
    for (const memberLabel of memberLabels) {
      const userId = await makeUser(memberLabel);
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId, role: 'member', status: 'active' } });
      members.push(userId);
    }
    return { id: team.id, ownerId, managerId, members };
  }

  async function createGame(input: {
    teamMatch: Prisma.V1TeamMatchUncheckedCreateInput;
    homeTeamId: string;
    awayTeamId: string;
    actorUserId: string;
  }) {
    const teamMatch = await prisma.v1TeamMatch.create({ data: input.teamMatch });
    const creation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: input.homeTeamId, displayNameSnapshot: '홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: input.awayTeamId, displayNameSnapshot: '원정' },
      ],
      participants: [],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: input.actorUserId, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `gra-${suiteId}-${teamMatch.id}`,
      payloadHash: canonicalGameCommandPayloadHash(creation),
    };
    await inTx((client) => app.get(GamesService).createFromSourceInTransaction(client, creation, context));
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id }, include: { sides: true } });
    return { gameId: game.id, teamMatchId: teamMatch.id, sideByTeam: new Map(game.sides.map((row) => [row.teamId!, row.id])) };
  }

  // ── 대회: A·B·C, g1(A-B, +1일) · g2(A-C, +2일). 운영자 · 대회 스태프(총괄/조회 전용) · 외부인 ──
  async function seedTournament() {
    const adminId = await makeUser('운영자');
    await prisma.v1AdminUser.create({ data: { userId: adminId, adminRole: 'ops', status: 'active' } });
    const directorId = await makeUser('총괄');
    const supportId = await makeUser('조회스태프');
    const outsiderId = await makeUser('외부인');
    const teamA = await makeTeam('A', ['a1', 'a2']);
    const teamB = await makeTeam('B', ['b1']);
    const teamC = await makeTeam('C', ['c1']);
    const tournament = await prisma.v1Tournament.create({
      data: { sportId, regionId, title: `명단 조정 대회 ${suiteId}-${seq}`, competitionConfigVersionId: configId, status: 'in_progress' },
    });
    await prisma.v1TournamentStaffAssignment.createMany({
      data: [
        { tournamentId: tournament.id, userId: directorId, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: adminId },
        { tournamentId: tournament.id, userId: supportId, role: 'SUPPORT_READONLY', grantedByUserId: adminId },
      ],
    });
    const registrations = new Map<string, string>();
    for (const team of [teamA, teamB, teamC]) {
      const registration = await prisma.v1TournamentRegistration.create({
        data: { tournamentId: tournament.id, teamId: team.id, appliedByUserId: team.ownerId, status: 'confirmed' },
      });
      registrations.set(team.id, registration.id);
      for (const userId of team.members) {
        await prisma.v1TournamentPlayer.create({ data: { registrationId: registration.id, userId, realName: '명단 선수' } });
      }
    }
    const games: Record<'g1' | 'g2', Awaited<ReturnType<typeof createGame>>> = {} as never;
    for (const [index, [key, home, away, days]] of ([
      ['g1', teamA, teamB, 1],
      ['g2', teamA, teamC, 2],
    ] as const).entries()) {
      games[key] = await createGame({
        teamMatch: {
          tournamentId: tournament.id,
          sportId,
          regionId,
          title: `명단 조정 ${key}`,
          hostTeamId: home.id,
          approvedApplicantTeamId: away.id,
          startAt: new Date(Date.now() + days * DAY),
          competitionConfigVersionId: configId,
        },
        homeTeamId: home.id,
        awayTeamId: away.id,
        actorUserId: adminId,
      });
      await prisma.v1TournamentMatchDetails.create({
        data: {
          teamMatchId: games[key].teamMatchId,
          tournamentId: tournament.id,
          round: 'group',
          fixtureNumber: index + 1,
          homeRegistrationId: registrations.get(home.id)!,
          awayRegistrationId: registrations.get(away.id)!,
        },
      });
    }
    for (const team of [teamA, teamB, teamC]) {
      await inTx((client) => syncCompetitionTeamRosters(client, { competitionId: tournament.id, teamId: team.id }));
    }
    const sidePath = (key: 'g1' | 'g2', teamId: string) =>
      `/api/v1/games/${games[key].gameId}/sides/${games[key].sideByTeam.get(teamId)!}`;
    return { adminId, directorId, supportId, outsiderId, teamA, teamB, teamC, tournament, registrations, games, sidePath };
  }

  const http = () => request(app.getHttpServer());
  const getAs = (path: string, userId: string) => http().get(path).set('x-v1-user-id', userId);
  const excludeAs = (path: string, userId: string, body: Record<string, unknown>) =>
    http().post(`${path}/roster-adjustments`).set('x-v1-user-id', userId).send(body);
  const revokeAs = (path: string, userId: string, targetUserId: string) =>
    http().delete(`${path}/roster-adjustments/${targetUserId}`).set('x-v1-user-id', userId);

  async function lineupUserIds(gameId: string, sideId: string): Promise<string[]> {
    const latest = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId, invalidatedAt: null },
      orderBy: { revision: 'desc' },
    });
    const rows = await prisma.v1GameParticipant.findMany({ where: { lineupId: latest.id } });
    return rows.map((row) => row.userId ?? `name:${row.displayNameSnapshot}`).sort();
  }
  const sorted = (ids: readonly string[]) => [...ids].sort();

  describe('대회 경기', () => {
    it('권한: 사이드 팀 멤버·운영자만 읽고, 사이드 팀 owner·manager·쓰기 가능한 운영자만 쓴다', async () => {
      const f = await seedTournament();
      const sideA = f.sidePath('g1', f.teamA.id);
      const [a1, a2] = f.teamA.members;

      const reads = await Promise.all(
        [f.teamA.ownerId, f.teamA.managerId, a1, f.adminId, f.directorId, f.supportId].map((id) => getAs(`${sideA}/roster`, id)),
      );
      expect(reads.map((res) => res.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(reads.map((res) => [res.body.data.viewerRole, res.body.data.editable])).toEqual([
        ['TEAM_MANAGER', true],
        ['TEAM_MANAGER', true],
        ['TEAM_MEMBER', false],
        ['ADMIN', true],
        ['STAFF', true],
        ['STAFF', false],
      ]);
      // 상대팀 팀장·팀원·외부인은 A 사이드를 못 본다(사유는 팀 내부 정보다).
      for (const id of [f.teamB.ownerId, f.teamB.members[0], f.outsiderId]) {
        const res = await getAs(`${sideA}/roster`, id);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await getAs(`${sideA}/roster-adjustments`, id)).status).toBe(403);
      }
      // 쓰기 거부: A 팀원, 상대팀 팀장·매니저, 조회 전용 스태프, 외부인.
      for (const id of [a1, f.teamB.ownerId, f.teamB.managerId, f.supportId, f.outsiderId]) {
        const res = await excludeAs(sideA, id, { userId: a2 });
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: f.games.g1.gameId } })).toBe(0);

      // 상대팀 팀장도 자기 사이드(B)는 쓴다 — 경기 인가를 그대로 쓰면 이 팀장이 A 사이드까지 통과했다.
      const sideB = f.sidePath('g1', f.teamB.id);
      expect((await excludeAs(sideB, f.teamB.ownerId, { userId: f.teamB.members[0] })).status).toBe(200);

      const byManager = await excludeAs(sideA, f.teamA.managerId, { userId: a1 });
      const byAdmin = await excludeAs(sideA, f.adminId, { userId: a2 });
      const byDirector = await excludeAs(f.sidePath('g2', f.teamA.id), f.directorId, { userId: a1 });
      expect([byManager.status, byAdmin.status, byDirector.status]).toEqual([200, 200, 200]);
      expect([byManager, byAdmin, byDirector].map((res) => res.body.data.adjustment.actorRole)).toEqual([
        'TEAM_MANAGER',
        'ADMIN',
        'STAFF',
      ]);
    });

    it('빼기는 그 경기의 그 사이드 명단에만 반영되고, 같은 요청을 다시 보내면 멱등이다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const g1A = { gameId: f.games.g1.gameId, sideId: f.games.g1.sideByTeam.get(f.teamA.id)! };
      const g1B = { gameId: f.games.g1.gameId, sideId: f.games.g1.sideByTeam.get(f.teamB.id)! };
      const g2A = { gameId: f.games.g2.gameId, sideId: f.games.g2.sideByTeam.get(f.teamA.id)! };
      const [g1BBefore, g2ABefore] = await Promise.all([lineupUserIds(g1B.gameId, g1B.sideId), lineupUserIds(g2A.gameId, g2A.sideId)]);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual(sorted([a1, a2]));

      const first = await excludeAs(f.sidePath('g1', f.teamA.id), f.teamA.ownerId, { userId: a1, reason: 'INJURY' });
      expect(first.status).toBe(200);
      expect(first.body.data.alreadyApplied).toBe(false);
      expect(first.body.data.roster.participants.map((row: { userId: string }) => row.userId)).toEqual([a2]);
      expect(first.body.data.roster.excluded).toEqual([
        expect.objectContaining({ userId: a1, reason: 'INJURY', actor: expect.objectContaining({ userId: f.teamA.ownerId, role: 'TEAM_MANAGER' }) }),
      ]);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual([a2]);
      const latest = await prisma.v1GameLineup.findFirstOrThrow({ where: { ...g1A, invalidatedAt: null }, orderBy: { revision: 'desc' } });
      expect(latest.state).toBe('SUBMITTED');
      // 다른 경기의 같은 팀 · 같은 경기의 상대팀은 그대로다.
      expect(await lineupUserIds(g2A.gameId, g2A.sideId)).toEqual(g2ABefore);
      expect(await lineupUserIds(g1B.gameId, g1B.sideId)).toEqual(g1BBefore);

      const lineupCountBefore = await prisma.v1GameLineup.count({ where: g1A });
      const again = await excludeAs(f.sidePath('g1', f.teamA.id), f.teamA.managerId, { userId: a1, reason: 'OTHER' });
      expect([again.status, again.body.data.alreadyApplied]).toEqual([200, true]);
      expect(again.body.data.adjustment.id).toBe(first.body.data.adjustment.id);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { ...g1A, userId: a1, revokedAt: null } })).toBe(1);
      // 멱등 재요청은 새 리비전을 만들지 않고 첫 사유를 바꾸지 않는다.
      expect(await prisma.v1GameLineup.count({ where: g1A })).toBe(lineupCountBefore);
      expect(again.body.data.adjustment.reason).toBe('INJURY');
    });

    it('기준 명단 밖 선수는 422, 요청 형식이 틀리면 400', async () => {
      const f = await seedTournament();
      const sideA = f.sidePath('g1', f.teamA.id);
      for (const userId of [f.teamB.members[0], f.outsiderId, f.teamA.ownerId]) {
        const res = await excludeAs(sideA, f.teamA.ownerId, { userId });
        expect([res.status, res.body.code]).toEqual([422, 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER']);
      }
      const badReason = await excludeAs(sideA, f.teamA.ownerId, { userId: f.teamA.members[0], reason: 'SLEEPY' });
      const extraField = await excludeAs(sideA, f.teamA.ownerId, { userId: f.teamA.members[0], action: 'INCLUDE' });
      expect([badReason.status, extraField.status]).toEqual([400, 400]);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: f.games.g1.gameId } })).toBe(0);
    });

    it('되돌리면 다시 출전하고(멱등), 변경 기록은 빼기·되돌리기를 시간순으로 남긴다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const sideA = f.sidePath('g1', f.teamA.id);
      const g1A = { gameId: f.games.g1.gameId, sideId: f.games.g1.sideByTeam.get(f.teamA.id)! };
      await excludeAs(sideA, f.teamA.ownerId, { userId: a1, reason: 'LATE_OR_EARLY' });

      const revoked = await revokeAs(sideA, f.adminId, a1);
      expect([revoked.status, revoked.body.data.alreadyApplied]).toEqual([200, false]);
      expect(revoked.body.data.roster.participants.map((row: { userId: string }) => row.userId).sort()).toEqual(sorted([a1, a2]));
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual(sorted([a1, a2]));
      const again = await revokeAs(sideA, f.teamA.ownerId, a1);
      expect([again.status, again.body.data.alreadyApplied]).toEqual([200, true]);
      // 되돌린 행도 지우지 않는다.
      expect(await prisma.v1GameRosterAdjustment.count({ where: { ...g1A, userId: a1 } })).toBe(1);

      const history = await getAs(`${sideA}/roster-adjustments`, f.teamA.members[1]);
      expect(history.status).toBe(200);
      expect(
        history.body.data.events.map((event: { type: string; userId: string; reason: string | null; actor: { userId: string; role: string | null } }) => [
          event.type,
          event.userId,
          event.reason,
          event.actor.userId,
          event.actor.role,
        ]),
      ).toEqual([
        ['EXCLUDE', a1, 'LATE_OR_EARLY', f.teamA.ownerId, 'TEAM_MANAGER'],
        ['REVOKE', a1, 'LATE_OR_EARLY', f.adminId, null],
      ]);
      // 팀원 쓰기 거부는 되돌리기에도 같다.
      expect((await revokeAs(sideA, a2, a1)).status).toBe(403);
    });

    it('경기가 시작되면 빼기·되돌리기가 409 LINEUP_DEADLINE_PASSED 이고 화면은 읽기 전용이다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const sideA = f.sidePath('g1', f.teamA.id);
      await excludeAs(sideA, f.teamA.ownerId, { userId: a2 });
      await prisma.v1Game.update({ where: { id: f.games.g1.gameId }, data: { state: 'LIVE' } });

      for (const res of [await excludeAs(sideA, f.teamA.ownerId, { userId: a1 }), await revokeAs(sideA, f.adminId, a2)]) {
        expect([res.status, res.body.code]).toEqual([409, 'LINEUP_DEADLINE_PASSED']);
      }
      const view = await getAs(`${sideA}/roster`, f.teamA.ownerId);
      expect([view.status, view.body.data.editable, view.body.data.gameState]).toEqual([200, false, 'LIVE']);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: f.games.g1.gameId, revokedAt: null } })).toBe(1);
      // 시작 전인 다른 경기는 그대로 쓸 수 있다.
      expect((await excludeAs(f.sidePath('g2', f.teamA.id), f.teamA.ownerId, { userId: a1 })).status).toBe(200);
    });

    it('참가 명단에 새로 추가된 선수는 대진 뒤 추가로 표시되고, 기존 선수는 아니다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      await excludeAs(f.sidePath('g1', f.teamA.id), f.teamA.ownerId, { userId: a1 });
      const a3 = await makeUser('a3');
      await prisma.v1TeamMembership.create({ data: { teamId: f.teamA.id, userId: a3, role: 'member', status: 'active' } });
      await app.get(TournamentPlayersService).addPlayer(
        { id: f.teamA.ownerId, email: `${f.teamA.ownerId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' },
        f.tournament.id,
        f.registrations.get(f.teamA.id)!,
        { userId: a3 } as never,
      );

      const view = await getAs(`${f.sidePath('g1', f.teamA.id)}/roster`, f.teamA.ownerId);
      expect(
        view.body.data.participants.map((row: { userId: string; joinedAfterFixtureCreated: boolean }) => [
          row.userId,
          row.joinedAfterFixtureCreated,
        ]),
      ).toEqual(expect.arrayContaining([[a2, false], [a3, true]]));
      expect(view.body.data.excluded.map((row: { userId: string }) => row.userId)).toEqual([a1]);
      expect(view.body.data.counts).toEqual({ base: 3, participating: 2, excluded: 1, unavailable: 0, suspended: 0 });
    });

    it('친선 경기는 이 API 대상이 아니다(404 GAME_ROSTER_NOT_AVAILABLE)', async () => {
      const f = await seedTournament();
      const friendly = await createGame({
        teamMatch: {
          sportId,
          regionId,
          title: '친선',
          hostTeamId: f.teamA.id,
          approvedApplicantTeamId: f.teamB.id,
          startAt: new Date(Date.now() + DAY),
          competitionConfigVersionId: configId,
        },
        homeTeamId: f.teamA.id,
        awayTeamId: f.teamB.id,
        actorUserId: f.adminId,
      });
      const path = `/api/v1/games/${friendly.gameId}/sides/${friendly.sideByTeam.get(f.teamA.id)!}`;
      for (const res of [await getAs(`${path}/roster`, f.teamA.ownerId), await excludeAs(path, f.teamA.ownerId, { userId: f.teamA.members[0] })]) {
        expect([res.status, res.body.code]).toEqual([404, 'GAME_ROSTER_NOT_AVAILABLE']);
      }
    });
  });

  // ── 리그: A·B, L1(+7일) ────────────────────────────────────────────────────────────
  async function seedLeague() {
    const adminId = await makeUser('리그운영자');
    await prisma.v1AdminUser.create({ data: { userId: adminId, adminRole: 'ops', status: 'active' } });
    const teamA = await makeTeam('LA', ['m1', 'm2']);
    const teamB = await makeTeam('LB', ['n1']);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `명단 조정 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [teamA.id, teamB.id],
      appliedByUserId: teamA.ownerId,
    });
    const config = await resolveTeamMatchCompetitionConfig(prisma, sportId);
    const teamMatchId = await inTx(async (client) => {
      const teams = await loadLeagueTeamRosters(client, league.id, [teamA.id, teamB.id]);
      return createLeagueFixture(client, app.get(GamesService), {
        leagueId: league.id,
        adminUserId: adminId,
        sportId,
        regionId,
        competitionConfigId: config!.id,
        title: '명단 조정 L1',
        placeName: '테스트 구장',
        startAt: new Date(Date.now() + 7 * DAY),
        endAt: null,
        home: teams.get(teamA.id)!,
        away: teams.get(teamB.id)!,
      });
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { sides: true } });
    const sideA = game.sides.find((row) => row.teamId === teamA.id)!;
    const sideB = game.sides.find((row) => row.teamId === teamB.id)!;
    return { teamA, teamB, league, game, sideA, sideB, path: (sideId: string) => `/api/v1/games/${game.id}/sides/${sideId}` };
  }

  describe('리그 경기', () => {
    it('대회와 같은 규칙으로 빼고, 상대팀 팀장은 우리 사이드를 못 쓴다', async () => {
      const f = await seedLeague();
      const [m1, m2] = f.teamA.members;
      const pathA = f.path(f.sideA.id);
      expect((await excludeAs(pathA, f.teamB.ownerId, { userId: m1 })).status).toBe(403);

      const res = await excludeAs(pathA, f.teamA.managerId, { userId: m1, reason: 'PERSONAL' });
      expect([res.status, res.body.data.roster.competitionKind, res.body.data.roster.legacyLineupPending]).toEqual([200, 'LEAGUE', false]);
      expect(await lineupUserIds(f.game.id, f.sideA.id)).toEqual(sorted([f.teamA.ownerId, f.teamA.managerId, m2]));
      expect(await lineupUserIds(f.game.id, f.sideB.id)).toEqual(
        sorted([f.teamB.ownerId, f.teamB.managerId, ...f.teamB.members]),
      );
    });

    it('이관 전 팀장 저장본이 최신인 사이드는 조정은 기록되지만 경기 명단은 그대로이고, 화면에 이관 대기가 보인다', async () => {
      const f = await seedLeague();
      const [m1] = f.teamA.members;
      const generated = await prisma.v1GameLineup.findFirstOrThrow({
        where: { gameId: f.game.id, sideId: f.sideA.id, invalidatedAt: null },
        orderBy: { revision: 'desc' },
      });
      const teamSaved = await prisma.v1GameLineup.create({
        data: {
          gameId: f.game.id,
          sideId: f.sideA.id,
          revision: generated.revision + 1,
          supersedesId: generated.id,
          state: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });

      const res = await excludeAs(f.path(f.sideA.id), f.teamA.ownerId, { userId: m1 });
      expect(res.status).toBe(200);
      expect(res.body.data.roster.legacyLineupPending).toBe(true);
      expect(res.body.data.roster.excluded.map((row: { userId: string }) => row.userId)).toEqual([m1]);
      const latest = await prisma.v1GameLineup.findFirstOrThrow({
        where: { gameId: f.game.id, sideId: f.sideA.id, invalidatedAt: null },
        orderBy: { revision: 'desc' },
      });
      expect(latest.id).toBe(teamSaved.id);
      // 상대 사이드는 팀장 저장본이 없으니 대기 상태가 아니다.
      const other = await getAs(`${f.path(f.sideB.id)}/roster`, f.teamB.ownerId);
      expect(other.body.data.legacyLineupPending).toBe(false);
    });
  });
});
