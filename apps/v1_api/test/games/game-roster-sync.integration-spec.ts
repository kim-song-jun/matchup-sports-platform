import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { type Prisma, V1GameEventType, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { selectLineupParticipantsWithDraftFallback } from '../../src/games/core/latest-lineup-participants';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import {
  syncCompetitionTeamRosters,
  syncGameSideRoster,
  syncRostersAfterResultChange,
  syncTeamRostersWithinPeriod,
} from '../../src/games/roster/game-roster-sync';
import { GameRosterService } from '../../src/games/roster/game-roster.service';
import { GameResultBracketProjectionService } from '../../src/game-operations/game-result-bracket-projection.service';
import type { OfficialRevisionRow } from '../../src/game-operations/game-result-official-projection.types';
import { enqueueRosterResync, teamMembersTargets } from '../../src/games/roster/roster-resync-events';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { createLeagueFixture, loadLeagueTeamRosters } from '../../src/league-matches/league-fixture-creation';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { resolveTeamMatchCompetitionConfig } from '../../src/team-matches/resolve-team-match-competition-config';
import { updateTournamentMatchInTx } from '../../src/tournaments/tournament-match-update';
import { TournamentPlayersService } from '../../src/tournaments/tournament-players.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';

/**
 * Task 178 — 대회·리그 경기 명단 = 기준 명단 − 출전정지 − 결장 기간 − 활성 EXCLUDE.
 *
 * 좁히는 변경이라 fixture 는 팀 셋·경기 넷(대회), 경기 둘·팀 둘(리그)로 두고, 빠져야 할 사람과
 * **남아야 할 사람**(다른 경기·다른 팀·정지가 끝난 뒤)을 같이 단언한다.
 */
describe('경기 명단 계산 동기화 (Task 178)', () => {
  const suiteId = randomUUID().slice(0, 8);
  const adminUserId = `grs-admin-${suiteId}`;
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let prisma: PrismaService;
  let sportId: string;
  let regionId: string;
  let configId: string;
  let seq = 0;
  const DAY = 86_400_000;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    prisma = app.get(PrismaService);
    const sport = await prisma.v1Sport.upsert({ where: { code: 'futsal' }, update: {}, create: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    const region = await prisma.v1Region.create({ data: { code: `grs-region-${suiteId}`, name: '명단 계산 지역', level: 2 } });
    regionId = region.id;
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 preset is required');
    configId = config.id;
    await prisma.v1User.create({
      data: { id: adminUserId, email: `${adminUserId}@integration.test`, accountStatus: 'active', onboardingStatus: 'completed' },
    });
    await prisma.v1AdminUser.create({ data: { userId: adminUserId, adminRole: 'owner', status: 'active' } });
  });

  afterAll(async () => cleanup?.());

  const authUser = (id: string): V1AuthUser => ({
    id,
    email: `${id}@integration.test`,
    accountStatus: 'active',
    onboardingStatus: 'completed',
  });

  /** eligible=false 면 휴대폰이 없어 리그 자동 채움 대상이 아니다(폴백 팀원). */
  async function makeUser(label: string, eligible = true): Promise<string> {
    seq += 1;
    const id = `grs-u-${suiteId}-${seq}`;
    await prisma.v1User.create({
      data: {
        id,
        email: `${id}@integration.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        ...(eligible ? { phone: `0103176${String(seq).padStart(4, '0')}`, phoneVerifiedAt: new Date('2026-08-01T00:00:00.000Z') } : {}),
        profile: { create: { nickname: `${label}-${seq}`, realName: `${label}${seq}`, birthDate: '1995-01-01', gender: 'male' } },
      },
    });
    return id;
  }

  async function makeTeam(label: string, memberLabels: readonly string[], eligible = true) {
    const ownerId = await makeUser(`${label}장`, eligible);
    const team = await prisma.v1Team.create({ data: { ownerUserId: ownerId, sportId, regionId, name: `grs-${label}-${suiteId}-${seq}` } });
    await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId: ownerId, role: 'owner', status: 'active' } });
    const members: string[] = [];
    for (const memberLabel of memberLabels) {
      const userId = await makeUser(memberLabel, eligible);
      await prisma.v1TeamMembership.create({ data: { teamId: team.id, userId, role: 'member', status: 'active' } });
      members.push(userId);
    }
    return { id: team.id, ownerId, members };
  }

  const latestLineup = (gameId: string, sideId: string) =>
    prisma.v1GameLineup.findFirstOrThrow({ where: { gameId, sideId, invalidatedAt: null }, orderBy: { revision: 'desc' } });
  async function rosterOf(gameId: string, sideId: string): Promise<string[]> {
    const latest = await latestLineup(gameId, sideId);
    const rows = await prisma.v1GameParticipant.findMany({ where: { lineupId: latest.id } });
    return rows.map((row) => row.userId ?? `name:${row.displayNameSnapshot}`).sort();
  }
  const sorted = (ids: readonly string[]) => [...ids].sort();
  const inTx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

  // ── 대회: A·B·C 세 팀, 경기 g1(A-B, 지난 경기) → g2(B-C) → g3(A-C) → g4(A-B) ──────────────
  async function seedTournament(input: { redCardRule: boolean; redCardOnA1: boolean }) {
    const teamA = await makeTeam('A', ['a1', 'a2']);
    const teamB = await makeTeam('B', ['b1', 'b2']);
    const teamC = await makeTeam('C', ['c1']);
    const tournament = await prisma.v1Tournament.create({
      data: {
        sportId,
        regionId,
        title: `명단 계산 대회 ${suiteId}-${seq}`,
        competitionConfigVersionId: configId,
        redCardSuspensionMatches: input.redCardRule ? 1 : null,
        status: 'in_progress',
      },
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
    const schedule = [
      { key: 'g1', home: teamA, away: teamB, startAt: new Date(Date.now() - 3 * DAY) },
      { key: 'g2', home: teamB, away: teamC, startAt: new Date(Date.now() + 1 * DAY) },
      { key: 'g3', home: teamA, away: teamC, startAt: new Date(Date.now() + 2 * DAY) },
      { key: 'g4', home: teamA, away: teamB, startAt: new Date(Date.now() + 3 * DAY) },
    ] as const;
    const games: Record<string, { gameId: string; teamMatchId: string; startAt: Date; sideByTeam: Map<string, string> }> = {};
    for (const [index, row] of schedule.entries()) {
      const teamMatch = await prisma.v1TeamMatch.create({
        data: {
          tournamentId: tournament.id,
          sportId,
          regionId,
          title: `명단 계산 ${row.key}`,
          hostTeamId: row.home.id,
          approvedApplicantTeamId: row.away.id,
          startAt: row.startAt,
          competitionConfigVersionId: configId,
        },
      });
      await prisma.v1TournamentMatchDetails.create({
        data: {
          teamMatchId: teamMatch.id,
          tournamentId: tournament.id,
          round: 'group',
          fixtureNumber: index + 1,
          homeRegistrationId: registrations.get(row.home.id)!,
          awayRegistrationId: registrations.get(row.away.id)!,
        },
      });
      const creation: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: teamMatch.id,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: row.home.id, displayNameSnapshot: '홈' },
          { sideKey: V1GameSideKey.AWAY, teamId: row.away.id, displayNameSnapshot: '원정' },
        ],
        participants: [],
      };
      const context: GameCommandContext = {
        actor: { actorType: 'USER', actorUserId: row.home.ownerId, role: 'team_owner' },
        expectedVersion: 0,
        durableCommandId: `grs-${suiteId}-${teamMatch.id}`,
        payloadHash: canonicalGameCommandPayloadHash(creation),
      };
      await inTx((client) => app.get(GamesService).createFromSourceInTransaction(client, creation, context));
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: teamMatch.id }, include: { sides: true } });
      games[row.key] = {
        gameId: game.id,
        teamMatchId: teamMatch.id,
        startAt: row.startAt,
        sideByTeam: new Map(game.sides.map((side) => [side.teamId!, side.id])),
      };
    }
    const f = { tournament, teamA, teamB, teamC, registrations, games };
    if (input.redCardOnA1) await seedRedCard(f.games.g1.gameId, f.games.g1.sideByTeam.get(teamA.id)!, teamA.members[0]);
    // 지난 경기는 끝난 경기다 — 대회 경기는 시작 명령 전까지 SCHEDULED 라, 그대로 두면 시각이 지나도 재계산 대상이다.
    await prisma.v1Game.update({ where: { id: f.games.g1.gameId }, data: { state: 'ENDED' } });
    return f;
  }

  /** 지난 경기에 "레드카드 1장" 제출본을 심는다(결과 참가자는 DRAFT 에서만 넣을 수 있다). */
  async function seedRedCard(gameId: string, sideId: string, userId: string) {
    const lineup = await latestLineup(gameId, sideId);
    const participant = await prisma.v1GameParticipant.create({
      data: { gameId, sideId, lineupId: lineup.id, userId, displayNameSnapshot: '퇴장 선수', started: true },
    });
    const revisionCount = await prisma.v1GameResultRevision.count({ where: { gameId } });
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId,
        revision: revisionCount + 1,
        state: 'DRAFT',
        score: { home: 0, away: 1 },
        eventsHash: `grs-${gameId}-${revisionCount + 1}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'GAME_ROSTER_SYNC_TEST_SEED',
      },
    });
    await prisma.v1GameResultParticipant.create({
      data: { resultRevisionId: revision.id, participantId: participant.id, sideId, started: true, cards: { yellow: 0, red: 1 } },
    });
    await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'SUBMITTED', submittedAt: new Date() } });
    return revision.id;
  }

  const side = (f: Awaited<ReturnType<typeof seedTournament>>, key: string, teamId: string) => ({
    gameId: f.games[key].gameId,
    sideId: f.games[key].sideByTeam.get(teamId)!,
  });
  const syncTeam = (competitionId: string, teamId: string) =>
    inTx((client) => syncCompetitionTeamRosters(client, { competitionId, teamId }));
  /** 조정 API 밖의 트리거는 재계산 이벤트만 남긴다 — 워커가 처리한 뒤에 명단이 바뀐다. */
  const drainWorker = () => drainOutboxWorker(prisma);
  async function exclude(target: { gameId: string; sideId: string }, userId: string, actorUserId: string) {
    const { teamId } = await prisma.v1GameSide.findUniqueOrThrow({ where: { id: target.sideId }, select: { teamId: true } });
    return prisma.v1GameRosterAdjustment.create({
      data: { ...target, teamId: teamId!, userId, action: 'EXCLUDE', reason: 'injury', actorUserId, actorRole: 'TEAM_MANAGER' },
    });
  }

  describe('대회', () => {
    it('S1: 레드카드 선수는 팀의 다음 경기(g3)에서 빠지고, 사이에 낀 다른 팀 경기(g2)가 정지를 소진하지 않는다 — g4 에는 복귀', async () => {
      const f = await seedTournament({ redCardRule: true, redCardOnA1: true });
      const [a1, a2] = f.teamA.members;

      expect(await syncTeam(f.tournament.id, f.teamA.id)).toBe(2);

      const g3 = side(f, 'g3', f.teamA.id);
      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a2]));
      expect((await latestLineup(g3.gameId, g3.sideId)).state).toBe('SUBMITTED');
      const g4 = side(f, 'g4', f.teamA.id);
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1, a2]));
      // B 의 경기(g2)는 A 의 동기화가 건드리지 않는다.
      const g2 = side(f, 'g2', f.teamB.id);
      expect((await latestLineup(g2.gameId, g2.sideId)).revision).toBe(1);
    });

    // 수정마다 자기 경기를 먼저 잡고 팀 경기를 잡던 때는 g2 수정(g2 보유 → g3 대기)과 g3 수정(g3 보유 → g2 대기)이
    // 서로를 기다렸다. 두 트랜잭션이 실제로 겹칠 때만 드러나므로 여러 번 돌린다.
    it('같은 팀(C)이 걸린 두 대진을 동시에 고쳐도 교착(40P01) 없이 둘 다 끝난다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      for (let round = 0; round < 5; round += 1) {
        const results = await Promise.allSettled(
          (['g2', 'g3'] as const).map((key, index) =>
            prisma.$transaction((client) =>
              updateTournamentMatchInTx(client, {
                teamMatchId: f.games[key].teamMatchId,
                scheduledAt: new Date(Date.now() + (4 + round * 2 + index) * DAY),
              }),
            ),
          ),
        );
        expect(results.map((result) => (result.status === 'rejected' ? String(result.reason) : 'ok'))).toEqual(['ok', 'ok']);
      }
    });

    it('같은 팀 재계산 이벤트가 쌓여도 워커가 한 번에 닫고 명단은 한 번만 새로 쓴다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      const before = await latestLineup(g4.gameId, g4.sideId);
      await exclude(g4, a2, f.teamA.ownerId);
      const target = { scope: 'competitionTeam', competitionId: f.tournament.id, teamId: f.teamA.id } as const;
      for (let index = 0; index < 3; index += 1) await inTx((client) => enqueueRosterResync(client, [target]));

      await drainWorker();

      const events = await prisma.v1OutboxEvent.findMany({ where: { type: 'COMPETITION_ROSTER_RESYNC', aggregateId: f.teamA.id } });
      expect(events.map((event) => event.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
      // 워커가 집은(claim) 것은 하나뿐이다 — 나머지 둘은 그 처리 안에서 닫혀 한 번도 시도되지 않았다.
      expect(events.map((event) => event.attempts).sort()).toEqual([0, 0, 1]);
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1]));
      expect((await latestLineup(g4.gameId, g4.sideId)).revision).toBe(before.revision + 1);
    });

    it('이벤트를 남긴 뒤 처리 전에 시작한 경기는 워커가 건너뛴다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const g3 = side(f, 'g3', f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      const liveBefore = await latestLineup(g3.gameId, g3.sideId);
      await exclude(g3, a2, f.teamA.ownerId);
      await exclude(g4, a2, f.teamA.ownerId);
      await inTx((client) =>
        enqueueRosterResync(client, [{ scope: 'competitionTeam', competitionId: f.tournament.id, teamId: f.teamA.id }]),
      );
      await prisma.v1Game.update({ where: { id: g3.gameId }, data: { state: 'LIVE' } });

      await drainWorker();

      expect((await latestLineup(g3.gameId, g3.sideId)).id).toBe(liveBefore.id);
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1]));
    });

    it('대조군: 규정이 없는 대회는 같은 레드카드에도 다음 경기에 그대로 출전한다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: true });

      await syncTeam(f.tournament.id, f.teamA.id);

      const g3 = side(f, 'g3', f.teamA.id);
      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted(f.teamA.members));
    });

    it('앞 경기 결과가 제출되면(syncRostersAfterResultChange) 이미 맞춰 둔 다음 경기에서 정지 선수를 뺀다', async () => {
      const f = await seedTournament({ redCardRule: true, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      await syncTeam(f.tournament.id, f.teamB.id);
      const g3 = side(f, 'g3', f.teamA.id);
      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a1, a2]));
      const g4B = side(f, 'g4', f.teamB.id);
      const g4BBefore = await latestLineup(g4B.gameId, g4B.sideId);

      await seedRedCard(f.games.g1.gameId, f.games.g1.sideByTeam.get(f.teamA.id)!, a1);
      await inTx((client) => syncRostersAfterResultChange(client, f.games.g1.gameId));

      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a2]));
      // 카드가 없는 B 팀 명단은 그대로다.
      expect((await latestLineup(g4B.gameId, g4B.sideId)).id).toBe(g4BBefore.id);
    });

    it('조정은 그 경기·그 사이드에만 걸리고, 되돌리면 다시 들어온다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      await syncTeam(f.tournament.id, f.teamB.id);
      const g3 = side(f, 'g3', f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      const g4B = side(f, 'g4', f.teamB.id);
      const [g3Before, g4BBefore] = [await latestLineup(g3.gameId, g3.sideId), await latestLineup(g4B.gameId, g4B.sideId)];

      const adjustment = await exclude(g4, a2, f.teamA.ownerId);
      expect(await inTx((client) => syncGameSideRoster(client, g4))).toBe(true);

      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1]));
      expect((await latestLineup(g3.gameId, g3.sideId)).id).toBe(g3Before.id);
      expect((await latestLineup(g4B.gameId, g4B.sideId)).id).toBe(g4BBefore.id);
      const audit = await prisma.v1OperationAudit.findFirstOrThrow({
        where: { requestId: `${g4.gameId}:${(await latestLineup(g4.gameId, g4.sideId)).id}` },
      });
      expect(audit.after).toEqual(expect.objectContaining({ participantCount: 1, excludedCount: 1 }));

      await prisma.v1GameRosterAdjustment.update({ where: { id: adjustment.id }, data: { revokedAt: new Date() } });
      expect(await inTx((client) => syncGameSideRoster(client, g4))).toBe(true);
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1, a2]));
      // 같은 계산이면 새 리비전을 만들지 않는다.
      expect(await inTx((client) => syncGameSideRoster(client, g4))).toBe(false);
    });

    it('조정한 경기에 참가 명단이 늘면 새 선수는 출전하고 조정은 유지된다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const g3 = side(f, 'g3', f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      await exclude(g4, a2, f.teamA.ownerId);
      await inTx((client) => syncGameSideRoster(client, g4));
      const a3 = await makeUser('a3');
      await prisma.v1TeamMembership.create({ data: { teamId: f.teamA.id, userId: a3, role: 'member', status: 'active' } });

      await app.get(TournamentPlayersService).addPlayer(
        authUser(f.teamA.ownerId),
        f.tournament.id,
        f.registrations.get(f.teamA.id)!,
        { userId: a3 } as never,
      );
      // 참가 명단 쓰기 트랜잭션은 경기를 잠그지 않는다 — 워커가 처리하기 전에는 그대로다.
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1]));
      await drainWorker();

      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1, a3]));
      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a1, a2, a3]));
    });

    it('결장 기간은 시작 시각이 기간 안인 경기에만 걸린다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const startsAt = new Date(f.games.g3.startAt.getTime() - 3_600_000);
      const endsAt = new Date(f.games.g3.startAt.getTime() + 3_600_000);
      await prisma.v1TeamMemberUnavailability.create({
        data: { teamId: f.teamA.id, userId: a1, startsAt, endsAt, reason: 'travel', actorUserId: f.teamA.ownerId, actorRole: 'TEAM_MANAGER' },
      });

      await inTx((client) => syncTeamRostersWithinPeriod(client, { teamId: f.teamA.id, startsAt, endsAt }));

      const g3 = side(f, 'g3', f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a2]));
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1, a2]));
    });

    it('골이 붙은 참가자 행을 지우지 않고, 새 제출본이 공식 결과 셀렉터에 잡힌다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      const scored = await prisma.v1GameParticipant.findFirstOrThrow({
        where: { lineupId: (await latestLineup(g4.gameId, g4.sideId)).id, userId: a2 },
      });
      const goal = await prisma.v1GameEvent.create({
        data: {
          gameId: g4.gameId,
          sequence: 1,
          clientEventId: `grs-goal-${suiteId}`,
          payloadHash: 'a'.repeat(64),
          type: V1GameEventType.GOAL,
          sideId: g4.sideId,
          participantId: scored.id,
          period: 1,
          clockMs: 1_000,
          occurredAt: new Date(),
          actorUserId: f.teamA.ownerId,
          payload: { source: 'game-roster-sync-spec' },
        },
      });

      await exclude(g4, a2, f.teamA.ownerId);
      await inTx((client) => syncGameSideRoster(client, g4));

      expect(await prisma.v1GameParticipant.count({ where: { id: scored.id } })).toBe(1);
      expect((await prisma.v1GameEvent.findUniqueOrThrow({ where: { id: goal.id } })).participantId).toBe(scored.id);
      // 결과 경로는 "제출본이 있으면 제출본 중 최신"을 읽는다. 앞선 동기화 리비전도 제출본이라,
      // 새 리비전이 DRAFT 였다면 a2 가 공식 결과에 남았을 것이다.
      const lineups = await prisma.v1GameLineup.findMany({ where: { gameId: g4.gameId } });
      const participants = await prisma.v1GameParticipant.findMany({ where: { gameId: g4.gameId } });
      const chosen = selectLineupParticipantsWithDraftFallback(participants, lineups).filter((row) => row.sideId === g4.sideId);
      expect(chosen.map((row) => row.userId)).toEqual([a1]);
    });

    it('규정 없는 녹아웃에서도 승자가 진출한 사이드는 승자 참가 명단의 제출본으로 채워진다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const source = f.games.g1;
      await prisma.v1TeamMatch.update({ where: { id: source.teamMatchId }, data: { status: 'completed' } });
      await prisma.v1Game.update({ where: { id: source.gameId }, data: { state: 'ENDED' } });
      const target = await prisma.v1TeamMatch.create({
        data: {
          tournamentId: f.tournament.id,
          sportId,
          regionId,
          title: '명단 계산 4강',
          status: 'matched',
          startAt: new Date(Date.now() + 5 * DAY),
          competitionConfigVersionId: configId,
        },
      });
      await prisma.v1TournamentMatchDetails.create({
        data: { teamMatchId: target.id, tournamentId: f.tournament.id, round: 'semi', fixtureNumber: 10 },
      });
      const creation: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: target.id,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: null, displayNameSnapshot: 'TBD' },
          { sideKey: V1GameSideKey.AWAY, teamId: null, displayNameSnapshot: 'TBD' },
        ],
        participants: [],
      };
      await inTx((client) =>
        app.get(GamesService).createFromSourceInTransaction(client, creation, {
          actor: { actorType: 'USER', actorUserId: adminUserId, role: 'platform_ops' },
          expectedVersion: 0,
          durableCommandId: `grs-${suiteId}-${target.id}`,
          payloadHash: canonicalGameCommandPayloadHash(creation),
        }),
      );
      await prisma.v1TournamentMatchAdvancementEdge.create({
        data: {
          tournamentId: f.tournament.id,
          sourceTeamMatchId: source.teamMatchId,
          sourceOutcome: 'WINNER',
          targetTeamMatchId: target.id,
          targetSide: 'HOME',
        },
      });
      const targetGame = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: target.id }, include: { sides: true } });
      const home = targetGame.sides.find((row) => row.sideKey === V1GameSideKey.HOME)!;
      const away = targetGame.sides.find((row) => row.sideKey === V1GameSideKey.AWAY)!;
      const revision = {
        revisionId: 'grs-advance',
        gameId: source.gameId,
        revision: 1,
        sourceType: 'TEAM_MATCH',
        teamMatchId: source.teamMatchId,
        tournamentTeamMatchId: source.teamMatchId,
        teamMatchTournamentId: f.tournament.id,
        tournamentId: f.tournament.id,
        leagueId: null,
      } as OfficialRevisionRow;

      await inTx((client) => new GameResultBracketProjectionService().project(client, revision, { home: 2, away: 1 }));
      await drainWorker();

      const latest = await latestLineup(targetGame.id, home.id);
      expect(latest.state).toBe('SUBMITTED');
      expect(await rosterOf(targetGame.id, home.id)).toEqual(sorted(f.teamA.members));
      // 배정되지 않은 사이드는 계산할 팀이 없다.
      expect((await latestLineup(targetGame.id, away.id)).revision).toBe(1);
    });

    // 대회 경기는 시작 명령으로만 SCHEDULED 를 벗어난다 — 킥오프 시각이 지나도 시작 전인 지연 경기다.
    it('앞 경기 결과로 바뀐 정지가 킥오프 시각이 지난 시작 전 경기(지연)에도 걸리고, 그 뒤 경기에는 복귀한다', async () => {
      const f = await seedTournament({ redCardRule: true, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await prisma.v1TeamMatch.update({ where: { id: f.games.g3.teamMatchId }, data: { startAt: new Date(Date.now() - 60_000) } });
      expect(await syncTeam(f.tournament.id, f.teamA.id)).toBe(2);
      const g3 = side(f, 'g3', f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a1, a2]));

      await seedRedCard(f.games.g1.gameId, f.games.g1.sideByTeam.get(f.teamA.id)!, a1);
      await inTx((client) => syncRostersAfterResultChange(client, f.games.g1.gameId));

      expect(await rosterOf(g3.gameId, g3.sideId)).toEqual(sorted([a2]));
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1, a2]));
    });

    it('끝난 대회의 킥오프 시각 지난 경기는 맞추지 않는다 — 시각 전 경기는 그대로 맞춘다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const g3 = side(f, 'g3', f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      await prisma.v1TeamMatch.update({ where: { id: f.games.g3.teamMatchId }, data: { startAt: new Date(Date.now() - 60_000) } });
      await prisma.v1Tournament.update({ where: { id: f.tournament.id }, data: { status: 'completed' } });
      const g3Before = await latestLineup(g3.gameId, g3.sideId);
      await exclude(g3, a2, f.teamA.ownerId);
      await exclude(g4, a2, f.teamA.ownerId);

      expect(await syncTeam(f.tournament.id, f.teamA.id)).toBe(1);

      expect((await latestLineup(g3.gameId, g3.sideId)).id).toBe(g3Before.id);
      expect(await rosterOf(g4.gameId, g4.sideId)).toEqual(sorted([a1]));
    });

    it('명단이 다시 맞춰져도 받아 둔 검인은 새 제출본에 이어지고, 대체된 리비전 행에 검인하면 409 다', async () => {
      const f = await seedTournament({ redCardRule: false, redCardOnA1: false });
      const [a1, a2] = f.teamA.members;
      await syncTeam(f.tournament.id, f.teamA.id);
      const g4 = side(f, 'g4', f.teamA.id);
      const games = app.get(GamesService);
      const admin = authUser(adminUserId);
      const before = await prisma.v1GameParticipant.findMany({ where: { lineupId: (await latestLineup(g4.gameId, g4.sideId)).id } });
      const oldA1 = before.find((row) => row.userId === a1)!;
      const checkedIn = await games.setParticipantArrival(admin, g4.gameId, oldA1.id, true);
      await games.setParticipantArrival(admin, g4.gameId, before.find((row) => row.userId === a2)!.id, true);

      await app.get(GameRosterService).exclude(admin, g4, { userId: a2 } as never);

      const after = await prisma.v1GameParticipant.findMany({ where: { lineupId: (await latestLineup(g4.gameId, g4.sideId)).id } });
      expect(after.map((row) => [row.userId, row.arrivedAt])).toEqual([[a1, checkedIn.arrivedAt]]);
      await expect(games.setParticipantArrival(admin, g4.gameId, oldA1.id, false)).rejects.toMatchObject({
        response: { code: 'GAME_PARTICIPANT_SUPERSEDED' },
      });
      expect((await prisma.v1GameParticipant.findUniqueOrThrow({ where: { id: oldA1.id } })).arrivedAt).toEqual(checkedIn.arrivedAt);
      await expect(games.setParticipantArrival(admin, g4.gameId, after[0].id, false)).resolves.toMatchObject({ arrivedAt: null });
    });
  });

  // ── 리그: A·B 두 팀, 경기 L1(+7일) · L2(+14일) ─────────────────────────────────────
  async function seedLeague(input: { eligibleA: boolean }) {
    const teamA = await makeTeam('LA', ['m1', 'm2'], input.eligibleA);
    const teamB = await makeTeam('LB', ['n1']);
    const league = await seedLeagueOnTournamentAxis(prisma, {
      title: `명단 계산 리그 ${suiteId}-${seq}`,
      sportId,
      regionId,
      state: 'active',
      teamIds: [teamA.id, teamB.id],
      appliedByUserId: teamA.ownerId,
    });
    const config = await resolveTeamMatchCompetitionConfig(prisma, sportId);
    const fixtures: Record<'L1' | 'L2', { gameId: string; teamMatchId: string; sideByTeam: Map<string, string> }> = {} as never;
    for (const [key, days] of [['L1', 7], ['L2', 14]] as const) {
      const teamMatchId = await inTx(async (client) => {
        const teams = await loadLeagueTeamRosters(client, league.id, [teamA.id, teamB.id]);
        return createLeagueFixture(client, app.get(GamesService), {
          leagueId: league.id,
          adminUserId,
          sportId,
          regionId,
          competitionConfigId: config!.id,
          title: `명단 계산 ${key}`,
          placeName: '테스트 구장',
          startAt: new Date(Date.now() + days * DAY),
          endAt: null,
          home: teams.get(teamA.id)!,
          away: teams.get(teamB.id)!,
        });
      });
      const game = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { sides: true } });
      fixtures[key] = { gameId: game.id, teamMatchId, sideByTeam: new Map(game.sides.map((row) => [row.teamId!, row.id])) };
    }
    const registration = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { tournamentId_teamId: { tournamentId: league.id, teamId: teamA.id } },
    });
    return { league, teamA, teamB, fixtures, registration };
  }
  const leagueSide = (f: Awaited<ReturnType<typeof seedLeague>>, key: 'L1' | 'L2', teamId: string) => ({
    gameId: f.fixtures[key].gameId,
    sideId: f.fixtures[key].sideByTeam.get(teamId)!,
  });

  describe('리그', () => {
    it('조정은 그 경기의 우리 팀 사이드에만 걸리고, 참가 명단 추가는 두 경기 모두에 반영된다', async () => {
      const f = await seedLeague({ eligibleA: true });
      const [m1, m2] = f.teamA.members;
      const l1 = leagueSide(f, 'L1', f.teamA.id);
      const l2 = leagueSide(f, 'L2', f.teamA.id);
      const l2B = leagueSide(f, 'L2', f.teamB.id);
      const [l1Before, l2BBefore] = [await latestLineup(l1.gameId, l1.sideId), await latestLineup(l2B.gameId, l2B.sideId)];

      await exclude(l2, m1, f.teamA.ownerId);
      expect(await inTx((client) => syncGameSideRoster(client, l2))).toBe(true);

      expect(await rosterOf(l2.gameId, l2.sideId)).toEqual(sorted([f.teamA.ownerId, m2]));
      expect((await latestLineup(l2.gameId, l2.sideId)).state).toBe('SUBMITTED');
      expect((await latestLineup(l1.gameId, l1.sideId)).id).toBe(l1Before.id);
      expect((await latestLineup(l2B.gameId, l2B.sideId)).id).toBe(l2BBefore.id);

      const m3 = await makeUser('m3');
      await prisma.v1TeamMembership.create({ data: { teamId: f.teamA.id, userId: m3, role: 'member', status: 'active' } });
      await app.get(TournamentPlayersService).addPlayer(authUser(f.teamA.ownerId), f.league.id, f.registration.id, {
        userId: m3,
      } as never);
      await drainWorker();

      expect(await rosterOf(l2.gameId, l2.sideId)).toEqual(sorted([f.teamA.ownerId, m2, m3]));
      expect(await rosterOf(l1.gameId, l1.sideId)).toEqual(sorted([f.teamA.ownerId, m1, m2, m3]));
    });

    it('참가 명단이 없는 팀(팀원 폴백)도 멤버십 userId 로 조정이 걸리고, 참가자에는 계정이 붙지 않는다', async () => {
      const f = await seedLeague({ eligibleA: false });
      const [m1] = f.teamA.members;
      const l2 = leagueSide(f, 'L2', f.teamA.id);
      const fallback = await prisma.v1GameParticipant.findMany({ where: { lineupId: (await latestLineup(l2.gameId, l2.sideId)).id } });
      expect(fallback).toHaveLength(3);
      expect(fallback.every((row) => row.userId === null)).toBe(true);
      const excludedName = (await prisma.v1UserProfile.findUniqueOrThrow({ where: { userId: m1 } })).nickname;

      await exclude(l2, m1, f.teamA.ownerId);
      await inTx((client) => syncGameSideRoster(client, l2));

      const rows = await prisma.v1GameParticipant.findMany({ where: { lineupId: (await latestLineup(l2.gameId, l2.sideId)).id } });
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.userId === null)).toBe(true);
      expect(rows.map((row) => row.displayNameSnapshot)).not.toContain(excludedName);
    });

    it('팀원 폴백 팀은 멤버십이 바뀐 뒤(teamMembers 이벤트) 시작 전 경기 명단에서 나간 팀원이 빠진다', async () => {
      const f = await seedLeague({ eligibleA: false });
      const [m1, m2] = f.teamA.members;
      const names = async (userIds: readonly string[]) =>
        (await prisma.v1UserProfile.findMany({ where: { userId: { in: [...userIds] } } })).map((row) => `name:${row.nickname}`).sort();
      // 지운 선수 행만 있는 신청은 여전히 명단이 없는 팀(폴백)이다.
      await prisma.v1TournamentPlayer.create({ data: { registrationId: f.registration.id, userId: m2, realName: '지운 선수', removedAt: new Date() } });
      const l1 = leagueSide(f, 'L1', f.teamA.id);
      const l2 = leagueSide(f, 'L2', f.teamA.id);
      const l1B = leagueSide(f, 'L1', f.teamB.id);
      const l1BBefore = await latestLineup(l1B.gameId, l1B.sideId);
      expect(await rosterOf(l1.gameId, l1.sideId)).toEqual(await names([f.teamA.ownerId, m1, m2]));

      await prisma.v1TeamMembership.updateMany({ where: { teamId: f.teamA.id, userId: m1 }, data: { status: 'left', leftAt: new Date() } });
      await inTx((client) => enqueueRosterResync(client, teamMembersTargets([f.teamA.id])));
      await drainWorker();

      for (const target of [l1, l2]) expect(await rosterOf(target.gameId, target.sideId)).toEqual(await names([f.teamA.ownerId, m2]));
      expect((await latestLineup(l1B.gameId, l1B.sideId)).id).toBe(l1BBefore.id);
    });

    it('경기 시각을 결장 기간 안으로 옮기면(updateFixture) 그 경기에서만 빠진다', async () => {
      const f = await seedLeague({ eligibleA: true });
      const [m1, m2] = f.teamA.members;
      const target = new Date(Date.now() + 20 * DAY);
      await prisma.v1TeamMemberUnavailability.create({
        data: {
          teamId: f.teamA.id,
          userId: m1,
          startsAt: new Date(target.getTime() - DAY),
          endsAt: new Date(target.getTime() + DAY),
          actorUserId: f.teamA.ownerId,
          actorRole: 'TEAM_MANAGER',
        },
      });
      const l1 = leagueSide(f, 'L1', f.teamA.id);
      const l2 = leagueSide(f, 'L2', f.teamA.id);
      expect(await rosterOf(l2.gameId, l2.sideId)).toEqual(sorted([f.teamA.ownerId, m1, m2]));

      await app.get(LeagueMatchAdminService).updateFixture(authUser(adminUserId), f.league.id, f.fixtures.L2.teamMatchId, {
        startsAt: target.toISOString(),
      } as never);
      await drainWorker();

      expect(await rosterOf(l2.gameId, l2.sideId)).toEqual(sorted([f.teamA.ownerId, m2]));
      expect(await rosterOf(l1.gameId, l1.sideId)).toEqual(sorted([f.teamA.ownerId, m1, m2]));
    });

    it('결과 제출 이벤트를 워커가 처리하면 리그 다음 경기의 저장된 명단에서 정지 선수가 빠진다', async () => {
      const f = await seedLeague({ eligibleA: true });
      const [m1, m2] = f.teamA.members;
      await prisma.v1Tournament.update({ where: { id: f.league.id }, data: { redCardSuspensionMatches: 1 } });
      await prisma.v1TeamMatch.update({ where: { id: f.fixtures.L1.teamMatchId }, data: { startAt: new Date(Date.now() - DAY) } });
      const l2 = leagueSide(f, 'L2', f.teamA.id);
      const l2B = leagueSide(f, 'L2', f.teamB.id);
      expect(await rosterOf(l2.gameId, l2.sideId)).toEqual(sorted([f.teamA.ownerId, m1, m2]));

      const revisionId = await seedRedCard(f.fixtures.L1.gameId, f.fixtures.L1.sideByTeam.get(f.teamA.id)!, m1);
      const event = await prisma.v1OutboxEvent.create({
        data: {
          businessKey: `result-review:${revisionId}:GAME_RESULT_SUBMITTED`,
          aggregateType: 'GAME',
          aggregateId: f.fixtures.L1.gameId,
          revisionId,
          type: 'GAME_RESULT_SUBMITTED',
          payload: { revisionId },
        },
      });
      const worker = new V1GameOperationsWorkerService(prisma);
      for (let guard = 0; guard < 100 && (await worker.processOne()); guard += 1);

      expect((await prisma.v1OutboxEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('COMPLETED');
      expect(await rosterOf(l2.gameId, l2.sideId)).toEqual(sorted([f.teamA.ownerId, m2]));
      expect((await latestLineup(l2.gameId, l2.sideId)).state).toBe('SUBMITTED');
      // 카드가 없는 상대 팀은 전원 그대로다.
      expect(await rosterOf(l2B.gameId, l2B.sideId)).toEqual(sorted([f.teamB.ownerId, ...f.teamB.members]));
    });

    it('대진 일괄 생성 전에 등록한 결장 기간이 새 경기의 저장된 명단에 걸린다', async () => {
      const teamA = await makeTeam('GA', ['g1', 'g2']);
      const teamB = await makeTeam('GB', ['h1']);
      const league = await seedLeagueOnTournamentAxis(prisma, {
        title: `명단 계산 일괄 ${suiteId}-${seq}`,
        sportId,
        regionId,
        state: 'active',
        startsOn: new Date(Date.now() + 3 * DAY),
        teamIds: [teamA.id, teamB.id],
        appliedByUserId: teamA.ownerId,
      });
      const [g1, g2] = teamA.members;
      await prisma.v1TeamMemberUnavailability.create({
        data: {
          teamId: teamA.id,
          userId: g1,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 60 * DAY),
          actorUserId: teamA.ownerId,
          actorRole: 'TEAM_MANAGER',
        },
      });

      await app.get(LeagueMatchAdminService).generateFixtures(authUser(adminUserId), league.id, { weeksCount: 1 } as never);
      await drainWorker();

      const game = await prisma.v1Game.findFirstOrThrow({ where: { teamMatch: { leagueId: league.id } }, include: { sides: true } });
      const sideA = game.sides.find((row) => row.teamId === teamA.id)!;
      const sideB = game.sides.find((row) => row.teamId === teamB.id)!;
      expect(await rosterOf(game.id, sideA.id)).toEqual(sorted([teamA.ownerId, g2]));
      expect((await latestLineup(game.id, sideA.id)).state).toBe('SUBMITTED');
      expect(await rosterOf(game.id, sideB.id)).toEqual(sorted([teamB.ownerId, ...teamB.members]));
    });
  });
});
