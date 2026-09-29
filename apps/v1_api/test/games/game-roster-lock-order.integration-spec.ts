import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { syncCompetitionTeamRosters } from '../../src/games/roster/game-roster-sync';
import { createLeagueFixture, loadLeagueTeamRosters } from '../../src/league-matches/league-fixture-creation';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../src/team-matches/resolve-team-match-competition-config';
import { removeUserFromActiveRosters } from '../../src/tournaments/roster-cleanup';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 178 — 경기 명단 쓰기의 잠금 순서(대회 행 KEY SHARE → 빈 리그 명단 채우기 → 경기). 두 트랜잭션을 실제로
 * 겹쳐, 먼저 잠근 쪽의 pid 를 다른 쪽이 기다리는지(`pg_blocking_pids`)를 장벽으로 쓴다.
 */
describe('경기 명단 쓰기 잠금 순서 (Task 178)', () => {
  const suiteId = randomUUID().slice(0, 8);
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let configId: string;
  let adminUserId: string;
  let seq = 0;
  const DAY = 86_400_000;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    sportId = (await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } })).id;
    regionId = (await prisma.v1Region.create({ data: { code: `glo-region-${suiteId}`, name: '잠금 순서 지역', level: 2 } })).id;
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 preset is required');
    configId = config.id;
    adminUserId = await makeUser('운영자');
  });

  afterAll(async () => cleanup?.());

  async function makeUser(label: string): Promise<string> {
    seq += 1;
    const id = `glo-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phone: `0104176${String(seq).padStart(4, '0')}`,
        phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        profile: { create: { nickname: `${label}-${seq}`, realName: `${label}${seq}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    return id;
  }

  async function makeTeam(label: string, memberLabels: readonly string[]) {
    const ownerId = await makeUser(`${label}장`);
    const team = await prisma.v1Team.create({ data: { ownerUserId: ownerId, sportId, regionId, name: `glo-${label}-${suiteId}-${seq}` } });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerId, role: 'owner', status: 'active' } });
    const members: string[] = [];
    for (const memberLabel of memberLabels) {
      const userId = await makeUser(memberLabel);
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId, role: 'member', status: 'active' } });
      members.push(userId);
    }
    return { id: team.id, ownerId, members };
  }

  async function rosterOf(gameId: string, sideId: string): Promise<string[]> {
    const latest = await prisma.v1GameLineup.findFirstOrThrow({ where: { gameId, sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
    const rows = await prisma.v1GameParticipant.findMany({ where: { lineupId: latest.id } });
    return rows.map((row) => row.userId ?? `name:${row.displayNameSnapshot}`).sort();
  }
  const sorted = (ids: readonly string[]) => [...ids].sort();

  /** `lock` 을 잡은 채 멈춘 트랜잭션. `release()` 뒤 `after` 를 돌고 커밋한다. */
  async function hold(lock: (tx: Prisma.TransactionClient) => Promise<unknown>, after?: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let ready!: (pid: number) => void;
    const holding = new Promise<number>((resolve) => (ready = resolve));
    const done = prisma.$transaction(
      async (tx) => {
        const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        await lock(tx);
        ready(pid);
        await released;
        await after?.(tx);
      },
      { timeout: 30_000 },
    );
    const pid = await Promise.race([
      holding,
      done.then(() => {
        throw new Error('holder ended before its lock barrier');
      }),
    ]);
    return { pid, release, done };
  }

  async function waitUntilBlockedBy(pid: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const [row] = await prisma.$queryRaw<Array<{ waiting: number }>>`
        SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
      if (row.waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`no transaction waited on backend ${pid}`);
  }

  /** 대회 하나, A팀(참가 명단 a1·a2) 대 B팀 시작 전 경기 하나. */
  async function seedTournamentGame() {
    const teamA = await makeTeam('A', ['a1', 'a2']);
    const teamB = await makeTeam('B', ['b1']);
    const tournament = await prisma.v1Tournament.create({
      data: { sportId, regionId, title: `잠금 순서 대회 ${suiteId}-${seq}`, competitionConfigVersionId: configId, status: 'in_progress' },
    });
    const registrations: string[] = [];
    for (const team of [teamA, teamB]) {
      const registration = await prisma.v1TournamentRegistration.create({
        data: { tournamentId: tournament.id, teamId: team.id, appliedByUserId: team.ownerId, status: 'confirmed' },
      });
      registrations.push(registration.id);
      for (const userId of team.members) {
        await prisma.v1TournamentPlayer.create({ data: { registrationId: registration.id, userId, realName: '명단 선수' } });
      }
    }
    const teamMatch = await prisma.v1TeamMatch.create({
      data: {
        tournamentId: tournament.id,
        sportId,
        regionId,
        title: '잠금 순서 경기',
        hostTeamId: teamA.id,
        approvedApplicantTeamId: teamB.id,
        startAt: new Date(Date.now() + DAY),
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId: teamMatch.id,
        tournamentId: tournament.id,
        round: 'group',
        fixtureNumber: 1,
        homeRegistrationId: registrations[0],
        awayRegistrationId: registrations[1],
      },
    });
    const creation: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: teamA.id, displayNameSnapshot: '홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: teamB.id, displayNameSnapshot: '원정' },
      ],
      participants: [],
    };
    const context: GameCommandContext = {
      actor: { actorType: 'USER', actorUserId: teamA.ownerId, role: 'team_owner' },
      expectedVersion: 0,
      durableCommandId: `glo-${suiteId}-${teamMatch.id}`,
      payloadHash: canonicalGameCommandPayloadHash(creation),
    };
    await prisma.$transaction((tx) => app.get(GamesService).createFromSourceInTransaction(tx, creation, context));
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id } });
    return { tournament, teamA, gameId: game.id };
  }

  /** 리그 하나와 대진 하나. A팀 확정 신청은 명단 행이 한 번도 없는 상태로 되돌린다(자동 채움 대상). */
  async function seedLeagueWithEmptyRegistration() {
    const teamA = await makeTeam('LA', ['m1', 'm2']);
    const teamB = await makeTeam('LB', ['n1']);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `잠금 순서 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [teamA.id, teamB.id],
      appliedByUserId: teamA.ownerId,
    });
    const config = await resolveTeamMatchCompetitionConfig(prisma, sportId);
    const teamMatchId = await prisma.$transaction(async (tx) => {
      const teams = await loadLeagueTeamRosters(tx, league.id, [teamA.id, teamB.id]);
      return createLeagueFixture(tx, app.get(GamesService), {
        leagueId: league.id,
        adminUserId,
        sportId,
        regionId,
        competitionConfigId: config!.id,
        title: '잠금 순서 리그 대진',
        placeName: '테스트 구장',
        startAt: new Date(Date.now() + 7 * DAY),
        endAt: null,
        home: teams.get(teamA.id)!,
        away: teams.get(teamB.id)!,
      });
    });
    const registration = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: teamA.id } },
    });
    await prisma.v1TournamentPlayer.deleteMany({ where: { registrationId: registration.id } });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const side = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: game.id, teamId: teamA.id } });
    return { league, teamA, registrationId: registration.id, gameId: game.id, sideId: side.id };
  }

  it('대회 행을 먼저 쥔 트랜잭션(설정 변경·순위 재계산)이 있으면 명단 쓰기는 경기를 잡기 전에 기다린다 — 둘 다 끝난다', async () => {
    const f = await seedTournamentGame();
    const holder = await hold(
      (tx) => tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${f.tournament.id} FOR UPDATE`,
      async (tx) => {
        // 대회 → 경기 순으로 잡는다. 명단 쓰기가 경기를 먼저 쥐었다면 여기서 서로를 기다린다(40P01).
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${f.gameId} FOR UPDATE`;
      },
    );
    const writer = prisma.$transaction(
      (tx) => syncCompetitionTeamRosters(tx, { competitionId: f.tournament.id, teamId: f.teamA.id }),
      { timeout: 30_000 },
    );
    try {
      await waitUntilBlockedBy(holder.pid);
    } finally {
      holder.release();
    }
    await expect(holder.done).resolves.toBeUndefined();
    await expect(writer).resolves.toBe(1);
  });

  it('빈 리그 명단을 채우는 쓰기는 진행 중인 추방이 끝나기를 기다리고, 추방된 사람을 참가 명단·경기 명단에 넣지 않는다', async () => {
    const f = await seedLeagueWithEmptyRegistration();
    const [m1, m2] = f.teamA.members;
    const remover = await hold(
      (tx) =>
        tx.v1TeamMembership.update({
          where: { teamId_userId: { teamId: f.teamA.id, userId: m1 } },
          data: { status: 'removed' },
        }),
      (tx) => removeUserFromActiveRosters(tx, m1, { teamId: f.teamA.id }),
    );
    const writer = prisma.$transaction(
      (tx) => syncCompetitionTeamRosters(tx, { competitionId: f.league.id, teamId: f.teamA.id }),
      { timeout: 30_000 },
    );
    try {
      await waitUntilBlockedBy(remover.pid);
    } finally {
      remover.release();
    }
    await remover.done;
    await writer;

    const players = await prisma.v1TournamentPlayer.findMany({ where: { registrationId: f.registrationId, removedAt: null } });
    expect(players.map((row) => row.userId).sort()).toEqual(sorted([f.teamA.ownerId, m2]));
    expect(await rosterOf(f.gameId, f.sideId)).toEqual(sorted([f.teamA.ownerId, m2]));
  });
});
