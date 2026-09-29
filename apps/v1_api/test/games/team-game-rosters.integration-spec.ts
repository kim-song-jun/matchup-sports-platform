import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import request = require('supertest');
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { syncCompetitionTeamRosters } from '../../src/games/roster/game-roster-sync';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 178 단계 5 — 팀 B(선수 × 경기 표·일괄), 팀 C(결장 기간), 어드민 참가 신청 펼침, 다가오는 경기 요약.
 *
 * fixture 는 경기 단위 스펙과 같은 모양(A·B·C 세 팀, g1 A-B +1일, g2 A-C +2일)이라, 한 경기·한 팀의 변경이
 * 다른 경기·상대팀에 새지 않는지를 함께 단언한다.
 */
describe('팀 경기 명단 표·일괄·결장 기간 API (Task 178)', () => {
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
    regionId = (await prisma.v1Region.create({ data: { code: `tgr-region-${suiteId}`, name: '팀 명단 표 지역', level: 2 } })).id;
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
    const id = `tgr-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0103178${String(seq).padStart(4, '0')}`,
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
    const team = await prisma.v1Team.create({ data: { ownerUserId: ownerId, sportId, regionId, name: `tgr-${label}-${suiteId}-${seq}` } });
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
      durableCommandId: `tgr-${suiteId}-${teamMatch.id}`,
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
      data: { sportId, regionId, title: `팀 명단 표 대회 ${suiteId}-${seq}`, competitionConfigVersionId: configId, status: 'in_progress' },
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
          title: `팀 명단 표 ${key}`,
          hostTeamId: home.id,
          approvedApplicantTeamId: away.id,
          startAt: new Date(Date.now() + days * DAY),
          competitionConfigVersionId: configId,
          // 다가오는 경기 목록은 상대가 정해진(matched) 경기만 모은다.
          status: 'matched',
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
  const postAs = (path: string, userId: string, body: Record<string, unknown>) =>
    http().post(path).set('x-v1-user-id', userId).send(body);
  const deleteAs = (path: string, userId: string) => http().delete(path).set('x-v1-user-id', userId);
  const matrixPath = (teamId: string) => `/api/v1/teams/${teamId}/game-rosters`;
  const unavailabilityPath = (teamId: string, userId: string) => `/api/v1/teams/${teamId}/members/${userId}/unavailability`;

  async function lineupUserIds(gameId: string, sideId: string): Promise<string[]> {
    const latest = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId, invalidatedAt: null },
      orderBy: { revision: 'desc' },
    });
    const rows = await prisma.v1GameParticipant.findMany({ where: { lineupId: latest.id } });
    return rows.map((row) => row.userId ?? `name:${row.displayNameSnapshot}`).sort();
  }
  const sorted = (ids: readonly string[]) => [...ids].sort();

  type Cell = { status: string; reason: string | null; actorRole: string | null };
  type MatrixBody = {
    viewerRole: string;
    games: { gameId: string; sideId: string; editable: boolean }[];
    players: { userId: string; cells: Cell[] }[];
  };
  const statusesOf = (body: MatrixBody) =>
    Object.fromEntries(body.players.map((player) => [player.userId, player.cells.map((cell) => cell.status)]));
  const sideOf = (f: Awaited<ReturnType<typeof seedTournament>>, key: 'g1' | 'g2', teamId: string) => ({
    gameId: f.games[key].gameId,
    sideId: f.games[key].sideByTeam.get(teamId)!,
  });

  describe('팀 B — 선수 × 경기 표', () => {
    it('팀 owner·manager·플랫폼 어드민만 보고, 경기마다 그 팀 사이드의 칸 상태를 싣는다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      await postAs(`${f.sidePath('g1', f.teamA.id)}/roster-adjustments`, f.teamA.ownerId, { userId: a1, reason: 'INJURY' });
      const supportAdminId = await makeUser('조회어드민');
      await prisma.v1AdminUser.create({ data: { userId: supportAdminId, adminRole: 'support', status: 'active' } });

      const reads = await Promise.all(
        [f.teamA.ownerId, f.teamA.managerId, f.adminId, supportAdminId].map((id) => getAs(matrixPath(f.teamA.id), id)),
      );
      expect(reads.map((res) => res.status)).toEqual([200, 200, 200, 200]);
      expect(
        reads.map((res) => [res.body.data.viewerRole, (res.body.data as MatrixBody).games.every((game) => game.editable)]),
      ).toEqual([
        ['TEAM_MANAGER', true],
        ['TEAM_MANAGER', true],
        ['ADMIN', true],
        ['ADMIN', false],
      ]);
      // 팀 단위 표는 팀원·상대팀·대회 스태프·외부인에게 열지 않는다(스태프는 어드민 참가 신청 경로를 쓴다).
      for (const id of [a1, f.teamB.ownerId, f.directorId, f.outsiderId]) {
        const res = await getAs(matrixPath(f.teamA.id), id);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      expect((await getAs(matrixPath(`missing-${suiteId}`), f.adminId)).status).toBe(404);

      const data = reads[0].body.data as MatrixBody;
      expect(data.games.map((game) => [game.gameId, game.sideId])).toEqual([
        [f.games.g1.gameId, f.games.g1.sideByTeam.get(f.teamA.id)],
        [f.games.g2.gameId, f.games.g2.sideByTeam.get(f.teamA.id)],
      ]);
      expect(statusesOf(data)).toEqual({ [a1]: ['EXCLUDED', 'PARTICIPATING'], [a2]: ['PARTICIPATING', 'PARTICIPATING'] });
      expect(data.players.find((player) => player.userId === a1)!.cells[0]).toMatchObject({
        reason: 'INJURY',
        actorRole: 'TEAM_MANAGER',
      });
      // 상대팀 B 의 표는 B 가 뛰는 g1 한 경기, A 의 빼기와 무관하다.
      const teamB = (await getAs(matrixPath(f.teamB.id), f.teamB.ownerId)).body.data as MatrixBody;
      expect(teamB.games.map((game) => game.gameId)).toEqual([f.games.g1.gameId]);
      expect(statusesOf(teamB)).toEqual({ [f.teamB.members[0]]: ['PARTICIPATING'] });
    });
  });

  describe('팀 B — 일괄 변경', () => {
    it('여러 경기 빼기·되돌리기를 한 번에 쓰고, 경기마다 그 사이드 명단만 바뀐다(멱등 포함)', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const [g1A, g2A, g1B] = [sideOf(f, 'g1', f.teamA.id), sideOf(f, 'g2', f.teamA.id), sideOf(f, 'g1', f.teamB.id)];
      const g1BBefore = await lineupUserIds(g1B.gameId, g1B.sideId);
      const batchPath = `${matrixPath(f.teamA.id)}/batch`;

      const first = await postAs(batchPath, f.teamA.managerId, {
        changes: [
          { gameId: g1A.gameId, userId: a1, op: 'EXCLUDE', reason: 'PERSONAL' },
          { gameId: g2A.gameId, userId: a2, op: 'EXCLUDE' },
        ],
      });
      expect(first.status).toBe(200);
      expect(first.body.data.results.map((row: { gameId: string; alreadyApplied: boolean }) => [row.gameId, row.alreadyApplied])).toEqual([
        [g1A.gameId, false],
        [g2A.gameId, false],
      ]);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual([a2]);
      expect(await lineupUserIds(g2A.gameId, g2A.sideId)).toEqual([a1]);
      expect(await lineupUserIds(g1B.gameId, g1B.sideId)).toEqual(g1BBefore);
      expect(await prisma.v1GameRosterAdjustment.findFirstOrThrow({ where: { ...g1A, userId: a1 } })).toMatchObject({
        reason: 'PERSONAL',
        actorRole: 'TEAM_MANAGER',
        actorUserId: f.teamA.managerId,
      });

      const second = await postAs(batchPath, f.adminId, {
        changes: [
          { gameId: g1A.gameId, userId: a1, op: 'REVOKE' },
          { gameId: g2A.gameId, userId: a2, op: 'EXCLUDE', reason: 'OTHER' },
        ],
      });
      expect(second.status).toBe(200);
      expect(second.body.data.results.map((row: { alreadyApplied: boolean }) => row.alreadyApplied)).toEqual([false, true]);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual(sorted([a1, a2]));
      expect(await lineupUserIds(g2A.gameId, g2A.sideId)).toEqual([a1]);
      expect(await prisma.v1GameRosterAdjustment.findFirstOrThrow({ where: { ...g1A, userId: a1 } })).toMatchObject({
        revokedByUserId: f.adminId,
      });
      // 멱등 EXCLUDE 는 첫 사유를 덮지 않는다.
      expect((await prisma.v1GameRosterAdjustment.findFirstOrThrow({ where: { ...g2A, userId: a2 } })).reason).toBeNull();
    });

    it('시작된 경기가 하나라도 섞이면 아무것도 쓰지 않고 409', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const [g1A, g2A] = [sideOf(f, 'g1', f.teamA.id), sideOf(f, 'g2', f.teamA.id)];
      await prisma.v1Game.update({ where: { id: g2A.gameId }, data: { state: 'LIVE' } });
      const lineupsBefore = await prisma.v1GameLineup.count({ where: g1A });

      const res = await postAs(`${matrixPath(f.teamA.id)}/batch`, f.teamA.ownerId, {
        changes: [
          { gameId: g1A.gameId, userId: a1, op: 'EXCLUDE' },
          { gameId: g2A.gameId, userId: a2, op: 'EXCLUDE' },
        ],
      });
      expect([res.status, res.body.code]).toEqual([409, 'LINEUP_DEADLINE_PASSED']);
      expect(res.body.details.gameIds).toEqual([g2A.gameId]);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: { in: [g1A.gameId, g2A.gameId] } } })).toBe(0);
      expect(await prisma.v1GameLineup.count({ where: g1A })).toBe(lineupsBefore);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual(sorted([a1, a2]));
    });

    it('권한은 경기마다 그 사이드 기준이고, 형식이 틀리면 아무것도 쓰지 않는다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const g1A = sideOf(f, 'g1', f.teamA.id);
      const batchPath = `${matrixPath(f.teamA.id)}/batch`;
      const excludeA2 = { changes: [{ gameId: g1A.gameId, userId: a2, op: 'EXCLUDE' }] };

      for (const id of [a1, f.teamB.ownerId, f.supportId, f.outsiderId]) {
        const res = await postAs(batchPath, id, excludeA2);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      // B 팀장이 자기 팀 경로로 B 가 안 뛰는 경기(g2: A-C)를 넣으면 그 경기에 B 사이드가 없다.
      const foreign = await postAs(`${matrixPath(f.teamB.id)}/batch`, f.teamB.ownerId, {
        changes: [{ gameId: f.games.g2.gameId, userId: a1, op: 'EXCLUDE' }],
      });
      expect([foreign.status, foreign.body.code]).toEqual([404, 'GAME_SIDE_NOT_FOUND']);

      const invalid = [
        { changes: [] },
        { changes: [{ gameId: g1A.gameId, userId: a1, op: 'INCLUDE' }] },
        { changes: [{ gameId: g1A.gameId, userId: a1, op: 'REVOKE', reason: 'INJURY' }] },
        {
          changes: [
            { gameId: g1A.gameId, userId: a1, op: 'EXCLUDE' },
            { gameId: g1A.gameId, userId: a1, op: 'REVOKE' },
          ],
        },
      ];
      for (const body of invalid) {
        expect((await postAs(batchPath, f.teamA.ownerId, body)).status).toBe(400);
      }
      // 기준 명단 밖 선수가 섞여도 전체가 되돌아간다.
      const outside = await postAs(batchPath, f.teamA.ownerId, {
        changes: [
          { gameId: g1A.gameId, userId: a1, op: 'EXCLUDE' },
          { gameId: g1A.gameId, userId: f.teamB.members[0], op: 'EXCLUDE' },
        ],
      });
      expect([outside.status, outside.body.code]).toEqual([422, 'ROSTER_ADJUSTMENT_NOT_IN_ROSTER']);
      expect(await prisma.v1GameRosterAdjustment.count({ where: { gameId: g1A.gameId } })).toBe(0);

      const byDirector = await postAs(batchPath, f.directorId, excludeA2);
      expect(byDirector.status).toBe(200);
      expect(await prisma.v1GameRosterAdjustment.findFirstOrThrow({ where: { ...g1A, userId: a2 } })).toMatchObject({
        actorRole: 'STAFF',
      });
    });
  });

  describe('팀 C — 결장 기간', () => {
    it('기간 안에 시작하는 경기에서만 빠지고, 취소하면 돌아온다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const [g1A, g2A, g1B] = [sideOf(f, 'g1', f.teamA.id), sideOf(f, 'g2', f.teamA.id), sideOf(f, 'g1', f.teamB.id)];
      const g1BBefore = await lineupUserIds(g1B.gameId, g1B.sideId);
      const path = unavailabilityPath(f.teamA.id, a1);
      // g1(+1일)만 덮고 g2(+2일)는 덮지 않는다.
      const period = { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 1.5 * DAY).toISOString(), reason: 'INJURY' };

      const created = await postAs(path, f.teamA.managerId, period);
      expect(created.status).toBe(201);
      expect(created.body.data.unavailability).toMatchObject({
        userId: a1,
        reason: 'INJURY',
        actor: expect.objectContaining({ userId: f.teamA.managerId, role: 'TEAM_MANAGER' }),
      });
      // 화면(조회)은 요청 때 계산하므로 곧바로 빠져 보이고, 저장된 경기 명단은 워커가 처리한 뒤에 바뀐다.
      const roster = await getAs(`${f.sidePath('g1', f.teamA.id)}/roster`, f.teamA.ownerId);
      expect(roster.body.data.unavailable.map((row: { userId: string }) => row.userId)).toEqual([a1]);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual(sorted([a1, a2]));
      await drainOutboxWorker(prisma);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual([a2]);
      expect(await lineupUserIds(g2A.gameId, g2A.sideId)).toEqual(sorted([a1, a2]));
      expect(await lineupUserIds(g1B.gameId, g1B.sideId)).toEqual(g1BBefore);

      // 조회는 팀원이면 된다(본인 포함). 팀 밖은 403.
      for (const id of [a1, a2, f.adminId]) {
        const res = await getAs(path, id);
        expect([res.status, res.body.data.items.length]).toEqual([200, 1]);
      }
      for (const id of [f.teamB.ownerId, f.outsiderId]) {
        expect((await getAs(path, id)).status).toBe(403);
      }

      const unavailabilityId = created.body.data.unavailability.id as string;
      const revoked = await deleteAs(`${path}/${unavailabilityId}`, f.adminId);
      expect([revoked.status, revoked.body.data.alreadyApplied]).toEqual([200, false]);
      await drainOutboxWorker(prisma);
      expect(await lineupUserIds(g1A.gameId, g1A.sideId)).toEqual(sorted([a1, a2]));
      const again = await deleteAs(`${path}/${unavailabilityId}`, f.teamA.ownerId);
      expect([again.status, again.body.data.alreadyApplied]).toEqual([200, true]);
      expect(await prisma.v1TeamMemberUnavailability.findUniqueOrThrow({ where: { id: unavailabilityId } })).toMatchObject({
        revokedByUserId: f.adminId,
      });
      expect((await deleteAs(`${path}/missing-${suiteId}`, f.teamA.ownerId)).status).toBe(404);
    });

    it('등록은 owner·manager·플랫폼 운영자만, 본인 것은 안 되고, 기간이 거꾸로면 400', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const supportAdminId = await makeUser('조회어드민');
      await prisma.v1AdminUser.create({ data: { userId: supportAdminId, adminRole: 'support', status: 'active' } });
      const period = { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3 * DAY).toISOString() };

      for (const id of [a2, f.teamB.ownerId, f.directorId, supportAdminId, f.outsiderId]) {
        const res = await postAs(unavailabilityPath(f.teamA.id, a1), id, period);
        expect([res.status, res.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      }
      const self = await postAs(unavailabilityPath(f.teamA.id, f.teamA.managerId), f.teamA.managerId, period);
      expect([self.status, self.body.code]).toEqual([403, 'PERMISSION_DENIED']);
      const notMember = await postAs(unavailabilityPath(f.teamA.id, f.teamB.members[0]), f.teamA.ownerId, period);
      expect([notMember.status, notMember.body.code]).toEqual([404, 'TEAM_MEMBER_NOT_FOUND']);
      const reversed = await postAs(unavailabilityPath(f.teamA.id, a1), f.teamA.ownerId, {
        startsAt: period.endsAt,
        endsAt: period.startsAt,
      });
      expect([reversed.status, reversed.body.code]).toEqual([400, 'UNAVAILABILITY_INVALID_PERIOD']);
      const badReason = await postAs(unavailabilityPath(f.teamA.id, a1), f.teamA.ownerId, { ...period, reason: 'SLEEPY' });
      expect(badReason.status).toBe(400);
      expect(await prisma.v1TeamMemberUnavailability.count({ where: { teamId: f.teamA.id } })).toBe(0);

      const byAdmin = await postAs(unavailabilityPath(f.teamA.id, a1), f.adminId, period);
      expect(byAdmin.status).toBe(201);
      expect(byAdmin.body.data.unavailability.actor.role).toBe('ADMIN');
      // 기간이 두 경기를 모두 덮는다. 등록은 재계산 이벤트만 남기므로 워커가 처리한 뒤에 바뀐다.
      expect(await lineupUserIds(f.games.g1.gameId, f.games.g1.sideByTeam.get(f.teamA.id)!)).toEqual(sorted([a1, a2]));
      await drainOutboxWorker(prisma);
      expect(await lineupUserIds(f.games.g1.gameId, f.games.g1.sideByTeam.get(f.teamA.id)!)).toEqual([a2]);
      expect(await lineupUserIds(f.games.g2.gameId, f.games.g2.sideByTeam.get(f.teamA.id)!)).toEqual([a2]);
    });
  });

  describe('어드민 — 참가 신청 팀의 경기별 명단', () => {
    it('어드민·그 대회 스태프만 보고, 쓰기 가능 여부가 editable 에 드러난다', async () => {
      const f = await seedTournament();
      const [a1, a2] = f.teamA.members;
      const path = (tournamentId: string, registrationId: string) =>
        `/api/v1/admin/tournaments/${tournamentId}/registrations/${registrationId}/game-rosters`;
      const regA = f.registrations.get(f.teamA.id)!;

      const reads = await Promise.all([f.adminId, f.directorId, f.supportId].map((id) => getAs(path(f.tournament.id, regA), id)));
      expect(reads.map((res) => res.status)).toEqual([200, 200, 200]);
      expect(
        reads.map((res) => [res.body.data.viewerRole, (res.body.data as MatrixBody).games.map((game) => game.editable)]),
      ).toEqual([
        ['ADMIN', [true, true]],
        ['STAFF', [true, true]],
        ['STAFF', [false, false]],
      ]);
      expect(reads[0].body.data.teamId).toBe(f.teamA.id);
      expect(statusesOf(reads[0].body.data)).toEqual({
        [a1]: ['PARTICIPATING', 'PARTICIPATING'],
        [a2]: ['PARTICIPATING', 'PARTICIPATING'],
      });
      // 팀장이라도 대회 운영자가 아니면 어드민 경로는 못 쓴다.
      for (const id of [f.teamA.ownerId, f.outsiderId]) {
        expect((await getAs(path(f.tournament.id, regA), id)).status).toBe(403);
      }
      const other = await getAs(path(f.tournament.id, `missing-${suiteId}`), f.adminId);
      expect([other.status, other.body.code]).toEqual([404, 'REGISTRATION_NOT_FOUND']);
    });
  });

  describe('다가오는 경기 — 명단 요약', () => {
    it('대회 경기에는 rosterSummary 와 사이드를, 친선에는 null 을 싣는다', async () => {
      const f = await seedTournament();
      const [a1] = f.teamA.members;
      await postAs(`${f.sidePath('g1', f.teamA.id)}/roster-adjustments`, f.teamA.ownerId, { userId: a1 });
      const friendly = await createGame({
        teamMatch: {
          sportId,
          regionId,
          title: `친선 ${suiteId}`,
          hostTeamId: f.teamA.id,
          approvedApplicantTeamId: f.teamC.id,
          startAt: new Date(Date.now() + 3 * DAY),
          competitionConfigVersionId: configId,
          status: 'matched',
        },
        homeTeamId: f.teamA.id,
        awayTeamId: f.teamC.id,
        actorUserId: f.adminId,
      });

      const res = await getAs(`/api/v1/teams/${f.teamA.id}/upcoming-games`, f.teamA.members[1]);
      expect(res.status).toBe(200);
      type Item = { gameId: string; competitionKind: string; sideId: string | null; teamMatchId: string | null; rosterSummary: unknown };
      const byGame = new Map((res.body.data.items as Item[]).map((item) => [item.gameId, item]));
      expect(byGame.get(f.games.g1.gameId)).toMatchObject({
        competitionKind: 'TOURNAMENT',
        sideId: f.games.g1.sideByTeam.get(f.teamA.id),
        teamMatchId: f.games.g1.teamMatchId,
        rosterSummary: { participating: 1, excluded: 1, unavailable: 0, suspended: 0 },
      });
      expect(byGame.get(f.games.g2.gameId)?.rosterSummary).toEqual({ participating: 2, excluded: 0, unavailable: 0, suspended: 0 });
      expect(byGame.get(friendly.gameId)).toMatchObject({ competitionKind: 'FRIENDLY', rosterSummary: null });

      // 상대팀 B 의 요약은 A 의 빼기와 무관하다.
      const teamB = await getAs(`/api/v1/teams/${f.teamB.id}/upcoming-games`, f.teamB.ownerId);
      const g1ForB = (teamB.body.data.items as Item[]).find((item) => item.gameId === f.games.g1.gameId);
      expect(g1ForB?.rosterSummary).toEqual({ participating: 1, excluded: 0, unavailable: 0, suspended: 0 });
    });
  });
});
