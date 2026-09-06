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
      // 프로덕션의 리그 대진은 `matched` 로 만들어진다. 모델 기본값은 `recruiting` 이라
      // 명시하지 않으면 **감사 로그의 fromStatus 가 현실과 달라진다** — 실제로 이 스펙을
      // 쓰는 동안 그 차이가 드러났고, 헬퍼가 상수 대신 **읽은 값**을 적는 이유이기도 하다.
      status: 'matched' as const,
    };
    await prisma.v1TeamMatch.create({
      data: { ...common, id: ids.leagueMatch, title: '#29 리그 대진', leagueId: league.id },
    });
    await prisma.v1TeamMatch.create({
      // `leagueId` 를 **주지 않는다** — 이것이 친선이다.
      data: { ...common, id: ids.friendlyMatch, title: '#29 친선 팀매치' },
    });

    // **일정 행을 실제로 만든다.** 없으면 "SCHEDULED 0건" 단언이 빈 집합에서 참이 되어
    // cascade 가 도는지 아닌지를 전혀 구분하지 못한다(공허한 테스트).
    for (const [teamId, teamMatchId, title] of [
      [ids.homeTeam, ids.leagueMatch, '#29 리그 홈 일정'],
      [ids.awayTeam, ids.leagueMatch, '#29 리그 원정 일정'],
      [ids.homeTeam, ids.friendlyMatch, '#29 친선 홈 일정'],
    ] as const) {
      await prisma.v1TeamSchedule.create({
        data: {
          teamId,
          teamMatchId,
          title,
          type: 'MATCH',
          startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          endAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
          timezone: 'Asia/Seoul',
        },
      });
    }

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

  it('리그 종료는 팀매치를 **완료**로 넘긴다 — 이게 없으면 상호평가에 영원히 못 들어간다', async () => {
    // `reviews.service.ts` 의 리뷰 진입 게이트는 `isCompleted(teamMatch)`
    // (= `status === 'completed' || Boolean(completedAt)`, 1418행) 를 통과하지 못하면
    // **409 `SOURCE_NOT_COMPLETED`** 를 던진다(648행). 그리고 평가 마감 창의 **기준시각이
    // `completedAt`** 이라(655행) 그 값이 없으면 창 계산 자체가 성립하지 않는다.
    // 그래서 둘 다 본다 — `status` 만 보면 `completedAt` 누락을 놓친다.
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: ids.leagueMatch } });
    expect(teamMatch.status).toBe('completed');
    expect(teamMatch.completedAt).not.toBeNull();
  });

  it('완료 전이는 감사 로그를 남기고, 양 팀 캘린더 일정도 함께 닫는다', async () => {
    // 셋은 **함께** 일어나야 한다. 상태만 바뀌고 로그·캘린더가 빠지면 화면이 조용히 어긋난다.
    const log = await prisma.v1StatusChangeLog.findFirst({
      where: { targetType: 'team_match', targetId: ids.leagueMatch, toStatus: 'completed' },
    });
    expect(log).not.toBeNull();
    // `fromStatus` 는 상수가 아니라 **읽은 값**이어야 한다 — 콘솔 `end` 는 제출 경로의
    // `assertTeamMatchMatched` 를 지나지 않으므로 `matched` 를 상수로 적으면 사실과 달라질 수 있다.
    expect(log?.fromStatus).toBe('matched');

    // 필드는 `status` 가 아니라 `state` 다(`V1ScheduleState`).
    const leagueSchedules = await prisma.v1TeamSchedule.findMany({
      where: { teamMatchId: ids.leagueMatch },
      select: { state: true },
    });
    // 빈 집합에서 참이 되지 않도록 **개수부터** 확인한다.
    expect(leagueSchedules).toHaveLength(2);
    expect(leagueSchedules.every((row) => row.state === 'COMPLETED')).toBe(true);
  });

  it('친선 팀매치는 여전히 콘솔로 끝낼 수 없다 (409) — 이 가드가 지키던 것', async () => {
    await run(friendlyGameId, 'start', 'console-end-friendly-start');
    const error = await captureFailure(() => run(friendlyGameId, 'end', 'console-end-friendly-end'));
    expect(httpBody(error)).toEqual({ status: 409, code: 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN' });
  });

  it('친선은 종료 시도 뒤에도 완료되지 않는다 — 완료 부수효과가 새지 않았다', async () => {
    // **순서가 중요하다.** 바로 위 테스트가 친선 `end` 를 실제로 시도한 뒤에 본다 —
    // 시도 전에 보면 "아직 안 끝냈으니 당연히 미완료" 라 아무것도 증명하지 못한다.
    const friendly = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: ids.friendlyMatch } });
    expect(friendly.status).not.toBe('completed');
    expect(friendly.completedAt).toBeNull();
    const friendlySchedules = await prisma.v1TeamSchedule.findMany({
      where: { teamMatchId: ids.friendlyMatch },
      select: { state: true },
    });
    expect(friendlySchedules).toHaveLength(1);
    expect(friendlySchedules[0]?.state).toBe('SCHEDULED');
  });

  it('친선도 **시작**은 된다 — 가드는 `end` 에만 걸린다', async () => {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: friendlyGameId } });
    expect(game.state).toBe(V1GameState.LIVE);
  });
});
