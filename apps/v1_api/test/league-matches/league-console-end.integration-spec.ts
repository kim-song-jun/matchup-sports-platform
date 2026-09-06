import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';

/**
 * **리그 대진은 콘솔의 `end` 로 끝난다. 친선 팀매치는 여전히 못 끝낸다(결함 #29).**
 *
 * 두 경기는 **같은 `sourceType = TEAM_MATCH`** 다 — 리그 대진의 게임도 팀매치 소스로
 * 만들어지기 때문이다(`league-fixture-creation.ts`). 그래서 소스 타입만으로는 갈 수 없고,
 * `V1TeamMatch.leagueId` 로 가른다. 이 스펙은 **그 갈림이 실제로 서는지**를 양쪽에서 잡는다.
 *
 * 왜 통합인가: 판별이 DB 조회(`v1TeamMatch.leagueId`)라 mock 으로는 SQL 도 관계도 증명되지
 * 않는다. 이 저장소는 mock 한 raw 조회가 배포에서 500 을 낸 전례가 있다.
 */
const ids = {
  admin: '96000000-0000-4000-8000-000000000001',
  sport: '96000000-0000-4000-8000-000000000010',
  region: '96000000-0000-4000-8000-000000000011',
  homeTeam: '96000000-0000-4000-8000-000000000020',
  awayTeam: '96000000-0000-4000-8000-000000000021',
  league: '96000000-0000-4000-8000-000000000030',
  leagueMatch: '96000000-0000-4000-8000-000000000040',
  friendlyMatch: '96000000-0000-4000-8000-000000000041',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const authUser = (id: string) => ({
  id,
  email: `${id}@console-end.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

const sourceContext = (actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext => ({
  actor,
  expectedVersion: 0,
  durableCommandId: commandId,
  payloadHash: canonicalGameCommandPayloadHash(payload),
});

const captureFailure = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('호출이 실패했어야 하는데 성공했다');
};

const httpBody = (error: unknown): { code?: string; status: number } => {
  if (!(error instanceof HttpException)) throw error;
  const body = error.getResponse();
  const code = typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
  return { code, status: error.getStatus() };
};

describe('#29 콘솔 종료 — 리그 대진만 열린다', () => {
  let configId: string;
  let leagueGameId: string;
  let friendlyGameId: string;

  const createGame = async (teamMatchId: string, commandId: string): Promise<string> => {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatchId,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.homeTeam, displayNameSnapshot: '#29 홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: '#29 원정' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(
        tx,
        input,
        sourceContext({ actorType: 'USER', actorUserId: ids.admin, role: 'platform_ops' }, commandId, input),
      ),
    );
    return created.gameId;
  };

  const run = async (gameId: string, command: 'start' | 'end', commandId: string) => {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    return service.executeCommand(authUser(ids.admin), gameId, command, commandId, {
      expectedVersion: game.version,
      clientCommandId: commandId,
      takeoverToken: 'league-console-end-token',
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  };

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 프리셋이 필요하다');
    configId = config.id;

    await prisma.v1User.create({
      data: { id: ids.admin, email: 'league-console-end@example.test', accountStatus: 'active', onboardingStatus: 'completed' },
    });
    const admin = await prisma.v1AdminUser.create({
      data: { userId: ids.admin, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: '#29 Futsal' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'CONSOLE_END_REGION', name: '#29 Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.homeTeam, ownerUserId: ids.admin, sportId: ids.sport, regionId: ids.region, name: '#29 홈팀' },
        { id: ids.awayTeam, ownerUserId: ids.admin, sportId: ids.sport, regionId: ids.region, name: '#29 원정팀' },
      ],
    });
    const league = await seedLeagueOnTournamentAxis(prisma, {
      id: ids.league,
      title: '#29 콘솔 종료 리그',
      sportId: ids.sport,
      sportCode: 'futsal',
      regionId: ids.region,
      // **유저 id 가 아니라 어드민 행 id 다** — `v1_tournaments_created_by_admin_user_id_fkey`.
      createdByAdminUserId: admin.id,
      state: 'active',
    });

    const common = {
      hostTeamId: ids.homeTeam,
      createdByUserId: ids.admin,
      sportId: ids.sport,
      regionId: ids.region,
      placeName: '#29 구장',
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      approvedApplicantTeamId: ids.awayTeam,
      competitionConfigVersionId: configId,
    };
    await prisma.v1TeamMatch.create({
      data: { ...common, id: ids.leagueMatch, title: '#29 리그 대진', leagueId: league.id },
    });
    await prisma.v1TeamMatch.create({
      // `leagueId` 를 **주지 않는다** — 이것이 친선이다.
      data: { ...common, id: ids.friendlyMatch, title: '#29 친선 팀매치' },
    });

    leagueGameId = await createGame(ids.leagueMatch, 'console-end-src-league');
    friendlyGameId = await createGame(ids.friendlyMatch, 'console-end-src-friendly');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('리그 대진은 콘솔에서 시작하고 끝낼 수 있다', async () => {
    await run(leagueGameId, 'start', 'console-end-league-start');
    const ended = await run(leagueGameId, 'end', 'console-end-league-end');
    expect(ended.state).toBe(V1GameState.ENDED);

    const stored = await prisma.v1Game.findUniqueOrThrow({ where: { id: leagueGameId } });
    expect(stored.state).toBe(V1GameState.ENDED);
  });

  it('리그의 종료는 결과를 **잠정(SUBMITTED)** 으로 남긴다 — 어드민 확인 단계가 살아 있어야 한다', async () => {
    // 여기서 바로 OFFICIAL 이 되면 정본의 "결과 보내기 → 어드민 확인" 이 한 단계 사라진다.
    const revisions = await prisma.v1GameResultRevision.findMany({ where: { gameId: leagueGameId } });
    expect(revisions.length).toBeGreaterThan(0);
    expect(revisions.every((r) => r.state === 'SUBMITTED')).toBe(true);

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: leagueGameId } });
    expect(game.currentOfficialRevisionId).toBeNull();
  });

  it('친선 팀매치는 여전히 콘솔로 끝낼 수 없다 (409) — 이 가드가 지키던 것', async () => {
    await run(friendlyGameId, 'start', 'console-end-friendly-start');
    const error = await captureFailure(() => run(friendlyGameId, 'end', 'console-end-friendly-end'));
    expect(httpBody(error)).toEqual({ status: 409, code: 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN' });
  });

  it('친선도 **시작**은 된다 — 가드는 `end` 에만 걸린다', async () => {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: friendlyGameId } });
    expect(game.state).toBe(V1GameState.LIVE);
  });
});
