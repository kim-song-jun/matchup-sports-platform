import { randomUUID } from 'node:crypto';
import { V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { invalidateLineupAndTactics } from '../../src/tournaments/tournament-match-update';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';

/**
 * [P1-c] 라인업을 **한쪽도 제출하지 않은** 대회 경기를 시작할 수 있어야 한다.
 *
 * 예전에는 `assertLineupsSubmittedForStart` 가 SCHEDULED→LIVE 를 막았다. 근거는
 * "시작해 봐야 기록할 참가자가 없다"였는데, 그 전제가 더 이상 참이 아니다 — 참가자는
 * **대회 등록 명단에서 경기 생성 시점에 이미 만들어진다**
 * (tournament-bracket.service.ts: registration.players → participants). 제출 여부와
 * 무관하게 참가자가 있을 수 있다. 2026-11-14부터 빈 명단도 익명 기록으로 운영한다.
 *
 * 반대로 그 게이트는 실제 운영을 막고 있었다. 현장에서 한 팀이 명단을 미리 못 내는 일은
 * 흔한데, 그것 하나로 경기를 시작할 수 없었다.
 *
 * **이 스펙이 게이트 제거만 확인하는 것이 아니다.** 더 중요한 두 번째 단언이 있다:
 * 제출 없이 끝난 경기의 **공식 결과에 선수가 실려야 한다.** 게이트는 공식 결과 스냅샷의
 * 전제이기도 했다(엄격 셀렉터는 "대회는 이 게이트를 거치므로 제출본이 항상 있다"에
 * 기대고 있었다). 게이트만 지우고 셀렉터를 안 바꾸면 그 사이드가 **빈 배열**이 되어
 * 득점이 아무에게도 안 붙는다 — 기능을 여는 대신 기록을 망가뜨리는 변경이 된다.
 * 그래서 여기서 결과까지 확인한다.
 */
const ids = {
  operatorUser: '6c000000-0000-4000-8000-000000000001',
  hostUser: '6c000000-0000-4000-8000-000000000002',
  awayUser: '6c000000-0000-4000-8000-000000000003',
  replacementUser: '6c000000-0000-4000-8000-000000000004',
  sport: '6c000000-0000-4000-8000-000000000010',
  region: '6c000000-0000-4000-8000-000000000011',
  hostTeam: '6c000000-0000-4000-8000-000000000020',
  awayTeam: '6c000000-0000-4000-8000-000000000021',
  replacementTeam: '6c000000-0000-4000-8000-000000000022',
  tournament: '6c000000-0000-4000-8000-000000000030',
  hostRegistration: '6c000000-0000-4000-8000-000000000031',
  awayRegistration: '6c000000-0000-4000-8000-000000000032',
  replacementRegistration: '6c000000-0000-4000-8000-000000000033',
  fixture: '6c000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.operatorUser, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('[P1-c] 라인업 미제출 상태에서도 대회 경기를 시작할 수 있다', () => {
  let gameId: string;
  let hostParticipantIds: string[] = [];
  let replacedAwayParticipantIds: string[] = [];
  let replacementParticipantId: string | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the P1-c start-gate spec');
    }
    await prisma.$connect();

    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('futsal-v1 competition config preset is required (run competition-config-backfill.cli.ts)');
    }

    await prisma.v1User.createMany({
      data: [ids.operatorUser, ids.hostUser, ids.awayUser, ids.replacementUser].map((id, index) => ({
        id,
        email: `p1c-start-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({ data: { userId: ids.operatorUser, adminRole: 'owner', status: 'active' } });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: 'P1c futsal' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'P1C_REGION', name: 'P1c region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'P1c host' },
        { id: ids.awayTeam, ownerUserId: ids.awayUser, sportId: ids.sport, regionId: ids.region, name: 'P1c away' },
        { id: ids.replacementTeam, ownerUserId: ids.replacementUser, sportId: ids.sport, regionId: ids.region, name: 'P1c replacement' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'P1c tournament', competitionConfigVersionId: config.id },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        {
          id: ids.hostRegistration,
          tournamentId: ids.tournament,
          teamId: ids.hostTeam,
          appliedByUserId: ids.hostUser,
          status: 'confirmed',
        },
        {
          id: ids.awayRegistration,
          tournamentId: ids.tournament,
          teamId: ids.awayTeam,
          appliedByUserId: ids.awayUser,
          status: 'confirmed',
        },
        {
          id: ids.replacementRegistration,
          tournamentId: ids.tournament,
          teamId: ids.replacementTeam,
          appliedByUserId: ids.replacementUser,
          status: 'confirmed',
        },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        sportId: ids.sport,
        hostTeamId: ids.hostTeam,
        approvedApplicantTeamId: ids.awayTeam,
        title: 'P1c start match',
        status: 'matched',
        startAt: new Date(Date.now() - 60_000),
        competitionConfigVersionId: config.id,
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        legNumber: 1,
        homeRegistrationId: ids.hostRegistration,
        awayRegistrationId: ids.awayRegistration,
      },
    });

    // 경기 생성 시 참가자를 함께 넣는다 — 실제 대회 경로가 등록 명단을 이렇게 싣는다
    // (tournament-bracket.service.ts). **라인업 저장·제출은 일부러 하지 않는다.**
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'P1c host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'P1c away' },
      ],
      participants: [
        { sourceParticipantId: 'p1c-home-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: '호스트 선수1', jerseyNumber: 1 },
        { sourceParticipantId: 'p1c-home-2', sideKey: V1GameSideKey.HOME, displayNameSnapshot: '호스트 선수2', jerseyNumber: 2 },
        { sourceParticipantId: 'p1c-away-1', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '원정 선수1', jerseyNumber: 1 },
        { sourceParticipantId: 'p1c-away-2', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: '원정 선수2', jerseyNumber: 2 },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, creationContext('p1c-source', input)),
    );
    gameId = created.gameId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('전제 확인: 라인업은 자동 생성된 DRAFT 뿐이고 제출본이 하나도 없다', async () => {
    const lineups = await prisma.v1GameLineup.findMany({ where: { gameId }, select: { state: true } });
    expect(lineups.length).toBeGreaterThan(0);
    // 이 전제가 깨지면 아래 테스트는 "제출 없이 시작"을 검증하는 것이 아니게 된다.
    expect(lineups.every((lineup) => lineup.state === 'DRAFT')).toBe(true);
  });

  it.each([
    { label: '홈 명단 없음', home: false, away: true },
    { label: '원정 명단 없음', home: true, away: false },
    { label: '양쪽 명단 없음', home: false, away: false },
  ])('$label: 시작 → 익명 득점 → 종료에서 팀 점수만 남기고 가상 선수를 만들지 않는다', async ({ home, away }) => {
    const fixtureId = randomUUID();
    const config = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { competitionConfigVersionId: true } });
    await prisma.v1TeamMatch.create({
      data: {
        id: fixtureId, tournamentId: ids.tournament, sportId: ids.sport,
        hostTeamId: ids.hostTeam, approvedApplicantTeamId: ids.awayTeam,
        title: 'Rosterless operations', status: 'matched', startAt: new Date(Date.now() - 60_000),
        competitionConfigVersionId: config.competitionConfigVersionId,
      },
    });
    await prisma.v1TournamentMatchDetails.create({
      data: {
        teamMatchId: fixtureId, tournamentId: ids.tournament, round: 'group', fixtureNumber: home ? 2 : away ? 3 : 4,
        legNumber: 1, homeRegistrationId: ids.hostRegistration, awayRegistrationId: ids.awayRegistration,
      },
    });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH, sourceId: fixtureId,
      competitionConfigVersionId: config.competitionConfigVersionId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Rosterless home' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Rosterless away' },
      ],
      participants: [
        ...(home ? [{ sourceParticipantId: 'home', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Home player' }] : []),
        ...(away ? [{ sourceParticipantId: 'away', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away player' }] : []),
      ],
    };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, creationContext(`create-${fixtureId}`, input)));
    const anonymousGameId = created.gameId;
    const grant = await service.requestTakeover(authUser(ids.operatorUser), anonymousGameId, { clientInstanceId: fixtureId, lastSequence: 0 });
    const version = async () => (await prisma.v1Game.findUniqueOrThrow({ where: { id: anonymousGameId }, select: { version: true } })).version;
    const command = async (name: 'start' | 'end') => service.executeCommand(authUser(ids.operatorUser), anonymousGameId, name, `${name}-${fixtureId}`, {
      expectedVersion: await version(), clientCommandId: `${name}-${fixtureId}`, takeoverToken: grant.takeoverToken,
      occurredAt: new Date().toISOString(), payload: name === 'start' ? { period: 1 } : {},
    });
    expect((await command('start')).state).toBe(V1GameState.LIVE);
    const missingSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId: anonymousGameId, sideKey: home ? 'AWAY' : 'HOME' } });
    const event = await service.appendEvent(authUser(ids.operatorUser), anonymousGameId, `goal-${fixtureId}`, {
      expectedVersion: await version(), clientEventId: `goal-${fixtureId}`, takeoverToken: grant.takeoverToken,
      type: 'GOAL' as never, sideId: missingSide.id, period: 1, clockMs: 1000,
      occurredAt: new Date().toISOString(), payload: { anonymous: true },
    });
    expect(event.event).toMatchObject({ participantId: null, payload: { anonymous: true } });
    const namedPlayer = await prisma.v1GameParticipant.findFirst({ where: { gameId: anonymousGameId } });
    if (namedPlayer !== null) {
      const namedEvent = await service.appendEvent(authUser(ids.operatorUser), anonymousGameId, `named-${fixtureId}`, {
        expectedVersion: await version(), clientEventId: `named-${fixtureId}`, takeoverToken: grant.takeoverToken,
        type: 'GOAL' as never, sideId: namedPlayer.sideId, participantId: namedPlayer.id,
        period: 1, clockMs: 2000, occurredAt: new Date().toISOString(), payload: {},
      });
      expect(namedEvent.event?.participantId).toBe(namedPlayer.id);
    }
    expect((await command('end')).state).toBe(V1GameState.ENDED);
    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: anonymousGameId }, orderBy: { revision: 'desc' } });
    expect(revision.score).toMatchObject({ home: 1, away: home || away ? 1 : 0 });
    expect(revision.missingScorer).toBe(false);
    const resultPlayers = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    expect(resultPlayers).toHaveLength(Number(home) + Number(away));
    if (namedPlayer !== null) {
      expect(resultPlayers.find((player) => player.participantId === namedPlayer.id)?.goals).toBe(1);
    }
    expect(resultPlayers.filter((player) => player.sideId === missingSide.id)).toHaveLength(0);
    expect(await prisma.v1GameParticipant.count({ where: { gameId: anonymousGameId } })).toBe(Number(home) + Number(away));
  });

  it('팀 교체 뒤 유효한 새 초안이 있으면 start 가 성공한다', async () => {
    const awaySide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.AWAY } });
    const homeSide = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    hostParticipantIds = (await prisma.v1GameParticipant.findMany({
      where: { gameId, sideId: homeSide.id },
      select: { id: true },
    })).map((participant) => participant.id);
    replacedAwayParticipantIds = (await prisma.v1GameParticipant.findMany({
      where: { gameId, sideId: awaySide.id },
      select: { id: true },
    })).map((participant) => participant.id);
    const priorLineup = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId, sideId: awaySide.id },
      orderBy: { revision: 'desc' },
      select: { id: true },
    });
    const replacementLineupId = await prisma.$transaction(async (tx) => {
      await tx.v1GameLineup.update({ where: { id: priorLineup.id }, data: { state: 'SUBMITTED' } });
      const newLineupId = await invalidateLineupAndTactics(tx, gameId, awaySide.id);
      if (newLineupId === null) throw new Error('Replacement lineup was not created');
      await tx.v1TeamMatch.update({ where: { id: ids.fixture }, data: { approvedApplicantTeamId: ids.replacementTeam } });
      await tx.v1TournamentMatchDetails.update({
        where: { teamMatchId: ids.fixture },
        data: { awayRegistrationId: ids.replacementRegistration },
      });
      await tx.v1GameSide.update({
        where: { id: awaySide.id },
        data: { teamId: ids.replacementTeam, displayNameSnapshot: 'P1c replacement' },
      });
      const replacementParticipant = await tx.v1GameParticipant.create({
        data: {
          gameId,
          sideId: awaySide.id,
          lineupId: newLineupId,
          userId: ids.replacementUser,
          displayNameSnapshot: '대체 선수',
          jerseyNumber: 9,
        },
        select: { id: true },
      });
      replacementParticipantId = replacementParticipant.id;
      return newLineupId;
    });
    expect(await prisma.v1GameLineup.findUniqueOrThrow({ where: { id: replacementLineupId }, select: { state: true, invalidatedAt: true } }))
      .toMatchObject({ state: 'DRAFT', invalidatedAt: null });
    expect(await prisma.v1GameLineup.findUniqueOrThrow({
      where: { id: priorLineup.id },
      select: { state: true, invalidatedAt: true, invalidationReason: true },
    })).toMatchObject({ state: 'SUBMITTED', invalidatedAt: expect.any(Date), invalidationReason: 'SIDE_TEAM_CHANGED' });

    const grant = await service.requestTakeover(authUser(ids.operatorUser), gameId, {
      clientInstanceId: 'p1c-client',
      lastSequence: 0,
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });

    const started = await service.executeCommand(authUser(ids.operatorUser), gameId, 'start', 'p1c-start', {
      expectedVersion: game.version,
      clientCommandId: 'p1c-start',
      takeoverToken: grant.takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: { period: 1 },
    });

    expect(started.state).toBe(V1GameState.LIVE);
  });

  it('팀 교체 뒤 공식 결과에는 새 유효 명단만 싣고 무효화된 이전 제출 선수는 제외한다', async () => {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });
    const grant = await service.requestTakeover(authUser(ids.operatorUser), gameId, {
      clientInstanceId: 'p1c-client-end',
      lastSequence: 0,
    });

    await service.executeCommand(authUser(ids.operatorUser), gameId, 'end', 'p1c-end', {
      expectedVersion: game.version,
      clientCommandId: 'p1c-end',
      takeoverToken: grant.takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const revision = await prisma.v1GameResultRevision.findFirst({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    expect(revision).not.toBeNull();

    const resultParticipants = await prisma.v1GameResultParticipant.findMany({
      where: { resultRevisionId: revision!.id },
      select: { participantId: true },
    });
    const resultParticipantIds = resultParticipants.map((participant) => participant.participantId);
    expect(resultParticipantIds).toHaveLength(3);
    expect(resultParticipantIds).toEqual(expect.arrayContaining(hostParticipantIds));
    expect(resultParticipantIds).toContain(replacementParticipantId);
    for (const previousTeamParticipantId of replacedAwayParticipantIds) {
      expect(resultParticipantIds).not.toContain(previousTeamParticipantId);
    }
  });
});
