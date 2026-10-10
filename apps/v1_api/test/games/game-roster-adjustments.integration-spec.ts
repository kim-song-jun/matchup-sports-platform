import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { syncCompetitionTeamRosters } from '../../src/games/roster/game-roster-sync';
import { completeTeamMatchAtResultBoundary } from '../../src/games/team-match-result-boundary';
import { createLeagueFixture, loadLeagueTeamRosters } from '../../src/league-matches/league-fixture-creation';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../src/team-matches/resolve-team-match-competition-config';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { updateTournamentMatchInTx } from '../../src/tournaments/tournament-match-update';
import { TournamentPlayersService } from '../../src/tournaments/tournament-players.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 179 — 경기 단위 명단 API(GET roster · POST/DELETE roster-adjustments · GET 변경 기록).
 *
 * 인가는 "그 사이드 팀"이 기준이라, 대회 fixture 를 A·B·C 세 팀 · 경기 둘(g1 A-B, g2 A-C)로 두고
 * 상대팀 팀장·다른 경기·다른 사이드가 영향을 받지 않는지를 함께 단언한다.
 */
describe('경기 명단 조정 API (Task 179)', () => {
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
    // 일반 대회 경기는 게임을 만들기 전에 대회 경기 정보가 있어야 한다(게임 생성 감사의 소유 범위 검사).
    details?: Omit<Prisma.V1TournamentMatchDetailsUncheckedCreateInput, 'teamMatchId'>;
    homeTeamId: string;
    awayTeamId: string;
    actorUserId: string;
  }) {
    const teamMatch = await prisma.v1TeamMatch.create({ data: input.teamMatch });
    if (input.details !== undefined) {
      await prisma.v1TournamentMatchDetails.create({ data: { ...input.details, teamMatchId: teamMatch.id } });
    }
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
    const supportAdminId = await makeUser('지원어드민');
    await prisma.v1AdminUser.create({ data: { userId: supportAdminId, adminRole: 'support', status: 'active' } });
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
        details: {
          tournamentId: tournament.id,
          round: 'group',
          fixtureNumber: index + 1,
          homeRegistrationId: registrations.get(home.id)!,
          awayRegistrationId: registrations.get(away.id)!,
        },
        homeTeamId: home.id,
        awayTeamId: away.id,
        actorUserId: adminId,
      });
    }
    for (const team of [teamA, teamB, teamC]) {
      await inTx((client) => syncCompetitionTeamRosters(client, { competitionId: tournament.id, teamId: team.id }));
    }
    const sidePath = (key: 'g1' | 'g2', teamId: string) =>
      `/api/v1/games/${games[key].gameId}/sides/${games[key].sideByTeam.get(teamId)!}`;
    return { adminId, supportAdminId, directorId, supportId, outsiderId, teamA, teamB, teamC, tournament, registrations, games, sidePath };
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

      const readers = [f.teamA.ownerId, f.teamA.managerId, a1, f.adminId, f.supportAdminId, f.directorId, f.supportId];
      const reads = await Promise.all(readers.map((id) => getAs(`${sideA}/roster`, id)));
      expect(reads.map((res) => res.status)).toEqual([200, 200, 200, 200, 200, 200, 200]);
      expect(reads.map((res) => [res.body.data.viewerRole, res.body.data.editable])).toEqual([
        ['TEAM_MANAGER', true],
        ['TEAM_MANAGER', true],
        ['TEAM_MEMBER', false],
        ['ADMIN', true],
        // support 어드민은 팀 표·어드민 표처럼 경기 명단도 읽기로 본다.
        ['ADMIN', false],
        ['STAFF', true],
        ['STAFF', false],
      ]);
      // 등번호 원본 신청 id 는 사이드 팀 owner·manager 에게만 — 등번호 저장 API 의 권한과 같다.
      const registrationA = f.registrations.get(f.teamA.id)!;
      expect(reads.map((res) => res.body.data.jerseyRegistrationId)).toEqual([
        registrationA,
        registrationA,
        null,
        null,
        null,
        null,
        null,
      ]);
      const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: registrationA } });
      expect(
        reads[0].body.data.participants.map((row: { userId: string; participantId: string }) => [row.userId, row.participantId]).sort(),
      ).toEqual(players.map((player) => [player.userId, player.id]).sort());
      const histories = await Promise.all(readers.map((id) => getAs(`${sideA}/roster-adjustments`, id)));
      expect(histories.map((res) => res.status)).toEqual([200, 200, 200, 200, 200, 200, 200]);
      // 상대팀 팀장·팀원·외부인은 A 사이드를 못 본다(사유는 팀 내부 정보다).
      for (const id of [f.teamB.ownerId, f.teamB.members[0], f.outsiderId]) {
        const res = await getAs(`${sideA}/roster`, id);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await getAs(`${sideA}/roster-adjustments`, id)).status).toBe(403);
      }
      // 쓰기 거부: A 팀원, 상대팀 팀장·매니저, support 어드민, 조회 전용 스태프, 외부인.
      for (const id of [a1, f.teamB.ownerId, f.teamB.managerId, f.supportAdminId, f.supportId, f.outsiderId]) {
        const res = await excludeAs(sideA, id, { userId: a2 });
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
        expect((await revokeAs(sideA, id, a2)).status).toBe(403);
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
        // 운영자가 되돌린 것도 역할이 남는다.
        ['REVOKE', a1, 'LATE_OR_EARLY', f.adminId, 'ADMIN'],
      ]);
      // 팀원 쓰기 거부는 되돌리기에도 같다.
      expect((await revokeAs(sideA, a2, a1)).status).toBe(403);
    });

    it('대진 수정으로 사이드 팀이 바뀌면 옛 팀의 빼기·사유는 새 팀에 안 보이고, 옛 팀이 돌아와도 되살아나지 않는다', async () => {
      const f = await seedTournament();
      const [a1] = f.teamA.members;
      const [b1] = f.teamB.members;
      const [c1] = f.teamC.members;
      const awaySide = f.games.g1.sideByTeam.get(f.teamB.id)!;
      const awayPath = `/api/v1/games/${f.games.g1.gameId}/sides/${awaySide}`;
      const g1A = { gameId: f.games.g1.gameId, sideId: f.games.g1.sideByTeam.get(f.teamA.id)! };
      expect((await excludeAs(awayPath, f.teamB.ownerId, { userId: b1, reason: 'INJURY' })).status).toBe(200);
      expect((await excludeAs(f.sidePath('g1', f.teamA.id), f.teamA.ownerId, { userId: a1, reason: 'PERSONAL' })).status).toBe(200);
      const setAway = async (teamId: string) => {
        await inTx((client) =>
          updateTournamentMatchInTx(client, { teamMatchId: f.games.g1.teamMatchId, awayRegistrationId: f.registrations.get(teamId)! }),
        );
        await drainOutboxWorker(prisma);
      };

      await setAway(f.teamC.id);
      // 옛 팀(B)의 활성 조정은 시스템이 닫는다. 바뀌지 않은 홈 사이드(A)의 조정은 그대로다.
      expect(await prisma.v1GameRosterAdjustment.findFirstOrThrow({ where: { sideId: awaySide, userId: b1 } })).toMatchObject({
        teamId: f.teamB.id,
        revokedAt: expect.any(Date),
        revokedByUserId: null,
        revokedByRole: 'SYSTEM',
      });
      expect(await prisma.v1GameRosterAdjustment.count({ where: { ...g1A, userId: a1, revokedAt: null } })).toBe(1);
      // 새 팀(C) 멤버는 옛 팀 선수 이름·사유를 보지 못하고, 옛 팀은 이 사이드를 더는 못 본다.
      const cHistory = await getAs(`${awayPath}/roster-adjustments`, c1);
      expect([cHistory.status, cHistory.body.data.teamId, cHistory.body.data.events]).toEqual([200, f.teamC.id, []]);
      const cView = await getAs(`${awayPath}/roster`, f.teamC.ownerId);
      expect([cView.body.data.teamId, cView.body.data.excluded, cView.body.data.counts.excluded]).toEqual([f.teamC.id, [], 0]);
      expect((await getAs(`${awayPath}/roster-adjustments`, f.teamB.ownerId)).status).toBe(403);
      expect(await lineupUserIds(f.games.g1.gameId, awaySide)).toEqual([c1]);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual([f.teamA.members[1]]);

      // 결과 검토(Serializable 스냅샷) 사이에 끼어들어 C 로 바뀐 뒤에도 남은 B 의 활성 조정을 흉내 낸다.
      // B 가 돌아올 때 이 행도 닫혀야 한다 — 새 팀 것을 남기면 여기서 되살아난다.
      await prisma.v1GameRosterAdjustment.create({
        data: {
          gameId: f.games.g1.gameId,
          sideId: awaySide,
          teamId: f.teamB.id,
          userId: b1,
          action: 'EXCLUDE',
          reason: 'OTHER',
          actorUserId: f.teamB.ownerId,
          actorRole: 'TEAM_MANAGER',
        },
      });

      await setAway(f.teamB.id);
      // B 가 돌아와도 예전 빼기는 되살아나지 않는다 — b1 이 다시 출전하고, 기록에는 시스템 되돌리기가 보인다.
      expect(await lineupUserIds(f.games.g1.gameId, awaySide)).toEqual([b1]);
      const bHistory = await getAs(`${awayPath}/roster-adjustments`, f.teamB.ownerId);
      expect(
        bHistory.body.data.events.map((event: { type: string; userId: string; reason: string | null; actor: { userId: string | null; role: string | null } }) => [
          event.type,
          event.userId,
          event.reason,
          event.actor.userId,
          event.actor.role,
        ]),
      ).toEqual([
        ['EXCLUDE', b1, 'INJURY', f.teamB.ownerId, 'TEAM_MANAGER'],
        ['REVOKE', b1, 'INJURY', null, 'SYSTEM'],
        ['EXCLUDE', b1, 'OTHER', f.teamB.ownerId, 'TEAM_MANAGER'],
        ['REVOKE', b1, 'OTHER', null, 'SYSTEM'],
      ]);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { sideId: awaySide, revokedAt: null } })).toBe(0);
      expect((await getAs(`${awayPath}/roster`, f.teamB.ownerId)).body.data.excluded).toEqual([]);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { ...g1A, userId: a1, revokedAt: null } })).toBe(1);
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

    // alpha 재현(2026-10-01): LIVE 경기 화면이 시작 뒤 참가 명단에 넣은 선수를 출전으로 보여 줬다.
    // 동기화는 시작 뒤 멈추므로 기록 명단에는 없다 — 화면도 기록 명단을 보여야 한다.
    it('시작된 경기는 시작 뒤 참가 명단에 넣은 선수를 출전으로 보이지 않고, 시작 전 경기는 보인다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      await prisma.v1Game.update({ where: { id: f.games.g1.gameId }, data: { state: 'LIVE' } });
      const a3 = await makeUser('a3');
      await prisma.v1TeamMembership.create({ data: { teamId: f.teamA.id, userId: a3, role: 'member', status: 'active' } });
      await app.get(TournamentPlayersService).addPlayer(
        { id: f.teamA.ownerId, email: `${f.teamA.ownerId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' },
        f.tournament.id,
        f.registrations.get(f.teamA.id)!,
        { userId: a3 } as never,
      );
      await drainOutboxWorker(prisma);

      const live = (await getAs(`${f.sidePath('g1', f.teamA.id)}/roster`, f.teamA.ownerId)).body.data;
      expect(live.participants.map((row: { userId: string }) => row.userId).sort()).toEqual([a1, a2].sort());
      expect(live.base.map((row: { userId: string }) => row.userId)).not.toContain(a3);
      expect(live.counts.participating).toBe(2);

      const scheduled = (await getAs(`${f.sidePath('g2', f.teamA.id)}/roster`, f.teamA.ownerId)).body.data;
      expect(scheduled.participants.map((row: { userId: string }) => row.userId)).toContain(a3);
    });

    it('폐기한 라인업 쓰기 라우트(경기·대회 운영 어댑터)는 HTTP 로도 인가 뒤 409 이고 명단을 바꾸지 않는다', async () => {
      const f = await seedTournament();
      const g1 = f.games.g1;
      const sideId = g1.sideByTeam.get(f.teamA.id)!;
      const lineup = await prisma.v1GameLineup.findFirstOrThrow({ where: { gameId: g1.gameId, sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
      const opsBase = `/api/v1/tournament-ops/tournaments/${f.tournament.id}/fixtures/${g1.teamMatchId}/lineup`;
      const routes = [
        (userId: string) => http().put(`/api/v1/games/${g1.gameId}/lineups/${sideId}`).set('x-v1-user-id', userId).send({}),
        (userId: string) => http().post(`/api/v1/games/${g1.gameId}/lineups/${lineup.id}/submit`).set('x-v1-user-id', userId).send({}),
        (userId: string) => http().put(`${opsBase}/${sideId}`).set('x-v1-user-id', userId).send({}),
        (userId: string) => http().post(`${opsBase}/${lineup.id}/submit`).set('x-v1-user-id', userId).send({}),
      ];
      const lineupCount = await prisma.v1GameLineup.count({ where: { gameId: g1.gameId } });

      for (const call of routes) {
        const res = await call(f.adminId);
        expect([res.status, res.body.code]).toEqual([409, 'ROSTER_MANAGED_BY_ADJUSTMENTS']);
        // 인가는 그대로 탄다 — 권한 없는 사람은 409 로 경기 존재·형태를 알 수 없다.
        expect((await call(f.outsiderId)).status).toBe(403);
      }
      expect((await routes[0](f.teamA.ownerId)).body.code).toBe('ROSTER_MANAGED_BY_ADJUSTMENTS');
      expect(await prisma.v1GameLineup.count({ where: { gameId: g1.gameId } })).toBe(lineupCount);
    });

    it('팀·경기 경로(GET /teams/:teamId/games/:gameId/roster)는 사이드 경로와 같은 권한·본문에 상대 팀 이름을 더한다', async () => {
      const f = await seedTournament();
      const [a1] = f.teamA.members;
      const teamPath = (teamId: string, key: 'g1' | 'g2') => `/api/v1/teams/${teamId}/games/${f.games[key].gameId}/roster`;
      const teams = await prisma.v1Team.findMany({
        where: { id: { in: [f.teamA.id, f.teamB.id, f.teamC.id] } },
        select: { id: true, name: true },
      });
      const nameOf = new Map(teams.map((row) => [row.id, row.name]));
      expect((await excludeAs(f.sidePath('g1', f.teamA.id), f.teamA.ownerId, { userId: a1, reason: 'INJURY' })).status).toBe(200);

      for (const id of [f.teamA.ownerId, f.teamA.managerId, a1, f.adminId, f.supportAdminId, f.directorId, f.supportId]) {
        const [bySide, byTeam] = await Promise.all([getAs(`${f.sidePath('g1', f.teamA.id)}/roster`, id), getAs(teamPath(f.teamA.id, 'g1'), id)]);
        expect([bySide.status, byTeam.status]).toEqual([200, 200]);
        const { opponentName, ...rest } = byTeam.body.data;
        expect(rest).toEqual(bySide.body.data);
        expect(opponentName).toBe(nameOf.get(f.teamB.id));
      }
      // 경로의 팀이 아니라 그 사이드 팀 멤버십으로 판정한다 — 상대팀 팀장·다른 팀·외부인은 A 명단을 못 본다.
      for (const id of [f.teamB.ownerId, f.teamB.members[0], f.teamC.ownerId, f.outsiderId]) {
        const res = await getAs(teamPath(f.teamA.id, 'g1'), id);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }

      // 두 팀 대조: 같은 경기라도 경로의 팀 사이드를 읽고, 빼기·사유는 그 팀 것만 보인다.
      const byB = (await getAs(teamPath(f.teamB.id, 'g1'), f.teamB.ownerId)).body.data;
      expect([byB.sideId, byB.teamId, byB.opponentName]).toEqual([f.games.g1.sideByTeam.get(f.teamB.id), f.teamB.id, nameOf.get(f.teamA.id)]);
      expect([byB.participants.map((row: { userId: string }) => row.userId), byB.excluded]).toEqual([f.teamB.members, []]);
      const byA = (await getAs(teamPath(f.teamA.id, 'g1'), f.teamA.ownerId)).body.data;
      expect(byA.excluded.map((row: { userId: string; reason: string }) => [row.userId, row.reason])).toEqual([[a1, 'INJURY']]);
      const g2 = (await getAs(teamPath(f.teamA.id, 'g2'), f.teamA.ownerId)).body.data;
      expect([g2.sideId, g2.opponentName, g2.excluded]).toEqual([f.games.g2.sideByTeam.get(f.teamA.id), nameOf.get(f.teamC.id), []]);

      const notSide = await getAs(teamPath(f.teamC.id, 'g1'), f.teamC.ownerId);
      expect([notSide.status, notSide.body.code]).toEqual([404, 'GAME_ROSTER_NOT_AVAILABLE']);
      const missing = await getAs(`/api/v1/teams/${f.teamA.id}/games/missing-${suiteId}/roster`, f.teamA.ownerId);
      expect([missing.status, missing.body.code]).toEqual([404, 'GAME_NOT_FOUND']);
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
          // 친선 팀매치 필수 필드(v1_team_matches_friendly_required_ck).
          createdByUserId: f.teamA.ownerId,
          placeName: '친선 구장',
          startAt: new Date(Date.now() + DAY),
          competitionConfigVersionId: configId,
        },
        homeTeamId: f.teamA.id,
        awayTeamId: f.teamB.id,
        actorUserId: f.adminId,
      });
      const path = `/api/v1/games/${friendly.gameId}/sides/${friendly.sideByTeam.get(f.teamA.id)!}`;
      for (const res of [
        await getAs(`${path}/roster`, f.teamA.ownerId),
        await getAs(`/api/v1/teams/${f.teamA.id}/games/${friendly.gameId}/roster`, f.teamA.ownerId),
        await excludeAs(path, f.teamA.ownerId, { userId: f.teamA.members[0] }),
      ]) {
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
        place: { name: '테스트 구장', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null },
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
      const byTeam = await getAs(`/api/v1/teams/${f.teamA.id}/games/${f.game.id}/roster`, m2);
      expect([byTeam.status, byTeam.body.data.sideId, byTeam.body.data.competitionKind, byTeam.body.data.viewerRole]).toEqual([
        200,
        f.sideA.id,
        'LEAGUE',
        'TEAM_MEMBER',
      ]);
    });

    // F88: 명단 조정으로 빠진 선수(rev1 → rev2)는 결과가 확정돼도 후기 의무가 없다. 같은 사이드에서 명단에
    // 남은 선수(대조군)는 그대로 쓴다. 결과 경계(콘솔 end·결과 제출이 부르는 같은 함수)로 경기를 완료 처리한다.
    it('명단에서 뺀 선수는 결과 확정 뒤 후기 pending 에 경기가 없고 상세가 403 NOT_ACTUAL_PARTICIPANT 이다', async () => {
      const f = await seedLeague();
      const [benched, played] = f.teamA.members;
      expect((await excludeAs(f.path(f.sideA.id), f.teamA.ownerId, { userId: benched })).status).toBe(200);
      const teamMatchId = f.game.teamMatchId!;
      await inTx((client) => completeTeamMatchAtResultBoundary(client, teamMatchId, null, 'F88 integration'));

      const pendingIds = async (userId: string) => {
        const res = await getAs('/api/v1/reviews?tab=pending', userId);
        expect(res.status).toBe(200);
        return res.body.data.items.map((item: { sourceId: string }) => item.sourceId);
      };
      const sourcePath = `/api/v1/reviews/sources/team_match/${teamMatchId}`;

      expect(await pendingIds(benched)).not.toContain(teamMatchId);
      const benchedSource = await getAs(sourcePath, benched);
      expect([benchedSource.status, benchedSource.body.code]).toEqual([403, 'NOT_ACTUAL_PARTICIPANT']);

      expect(await pendingIds(played)).toContain(teamMatchId);
      const playedSource = await getAs(sourcePath, played);
      expect(playedSource.status).toBe(200);
      expect(playedSource.body.data.targets.length).toBeGreaterThan(0);
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
