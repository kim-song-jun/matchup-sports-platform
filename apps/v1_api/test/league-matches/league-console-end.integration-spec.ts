import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';
import { GameResultSubmittedEscalationService } from '../../src/jobs/result-escalation/game-result-submitted-escalation.service';
import type { GameOperationClaim } from '../../src/jobs/v1-game-operations-worker.service';

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
  draftMatch: '96000000-0000-4000-8000-000000000042',
  cancelledMatch: '96000000-0000-4000-8000-000000000043',
  // 대조군: **대회 픽스처**. 같은 `deriveTournamentRevision` 을 지나지만 억제되면 안 된다.
  tournamentFixture: '96000000-0000-4000-8000-000000000050',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const escalation = new GameResultSubmittedEscalationService();

/** 워커가 이 이벤트를 집었을 때와 같은 모양의 claim. */
const escalationClaim = (revisionId: string, gameId: string): GameOperationClaim => ({
  id: `outbox-${revisionId}`,
  businessKey: `result-review:${revisionId}:GAME_RESULT_SUBMITTED`,
  aggregateType: 'GAME',
  aggregateId: gameId,
  revisionId,
  type: 'GAME_RESULT_SUBMITTED',
  payload: { revisionId },
  attempts: 0,
  retryGeneration: 0,
  version: 0,
  leaseOwner: 'qa-owner',
  leaseUntil: new Date(),
});
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

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * **성공이든 실패든 값으로 돌려준다.** `beforeAll` 에서 던지면 Jest 가 그 describe 의 모든
 * `it` 을 실패로 보고해서 **"무엇이 깨졌는지" 가 통째로 뭉개진다** — 실제로 겪었다: 리비전
 * 번호를 되돌리는 변이가 `beforeAll` 에서 터져 10건 전부 red 가 됐고, 그 숫자로는 어느
 * 계약이 깨졌는지 알 수 없었다. 전이를 여기서 잡아 두면 각 `it` 이 자기 계약만 검사한다.
 */
const capture = async <T>(run: () => Promise<T>): Promise<Outcome<T>> => {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
};

const httpBody = (outcome: Outcome<unknown>): { code?: string; status: number } => {
  if (outcome.ok) throw new Error('실패했어야 하는데 성공했다');
  const error = outcome.error;
  if (!(error instanceof HttpException)) {
    throw new Error(`HttpException 이 아니다: ${String(error)}`);
  }
  const body = error.getResponse();
  const code = typeof body === 'object' && body !== null ? (body as { code?: string }).code : undefined;
  return { code, status: error.getStatus() };
};

describe('#29 콘솔 종료 — 리그 대진만 열린다', () => {
  let configId: string;
  let leagueGameId: string;
  let friendlyGameId: string;
  let draftGameId: string;
  let cancelledGameId: string;
  let fixtureGameId: string;
  let fixtureEnd: EndOutcome;
  type EndOutcome = Outcome<Awaited<ReturnType<typeof service.executeCommand>>>;
  let leagueEnd: EndOutcome;
  let draftEnd: EndOutcome;
  let friendlyEnd: EndOutcome;
  let cancelledEnd: EndOutcome;

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

  const createFixtureGame = async (): Promise<string> => {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.tournamentFixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.homeTeam, displayNameSnapshot: '대조군 홈' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: '대조군 원정' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(
        tx,
        input,
        sourceContext({ actorType: 'USER', actorUserId: ids.admin, role: 'platform_ops' }, 'console-end-src-fixture', input),
      ),
    );
    return created.gameId;
  };

  /**
   * 대회 픽스처 커맨드는 **실제 takeover 토큰**이 필요하다(팀매치는 그 요구가 early-return
   * 이라 아무 문자열이나 통과한다 — 그 차이 자체가 계약이다).
   */
  const runFixture = async (command: 'start' | 'end', commandId: string) => {
    const { takeoverToken } = await service.requestTakeover(authUser(ids.admin), fixtureGameId, {
      clientInstanceId: 'console-end-fixture-client',
      lastSequence: 0,
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: fixtureGameId } });
    return service.executeCommand(authUser(ids.admin), fixtureGameId, command, commandId, {
      expectedVersion: game.version,
      clientCommandId: commandId,
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
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
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the #29 league console-end integration suite');
    }
    await prisma.$connect();
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
    await prisma.v1TeamMatch.create({
      data: { ...common, id: ids.draftMatch, title: '#31 초안이 있는 리그 대진', leagueId: league.id },
    });
    await prisma.v1TeamMatch.create({
      data: { ...common, id: ids.cancelledMatch, title: '#29 C-1 취소될 리그 대진', leagueId: league.id },
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
    draftGameId = await createGame(ids.draftMatch, 'console-end-src-draft');
    cancelledGameId = await createGame(ids.cancelledMatch, 'console-end-src-cancelled');

    // 대조군 — 리그 거울(`league.id`)이 곧 `V1Tournament` 이므로 그 아래 픽스처를 만든다.
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.tournamentFixture,
        tournamentId: league.id,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: configId,
      },
    });
    fixtureGameId = await createFixtureGame();
    // **초안을 미리 심는다(#31).** 호스트 팀장이 `createResultRevision` 으로 만들 수 있는
    // 상태다 — 그 경로엔 게임 상태 게이트가 없다. 예전 코드는 `revision: 1` 리터럴이라
    // 이 상태에서 `end` 가 P2002 로 죽고, 그게 409 "reload and retry" 로 번역됐다.
    await prisma.v1GameResultRevision.create({
      data: {
        gameId: draftGameId,
        revision: 1,
        state: 'DRAFT',
        score: { homeScore: 0, awayScore: 0 },
        eventsHash: 'draft-seed',
        createdByActorType: 'USER',
        createdByUserId: ids.admin,
      },
    });
  });

  /**
   * **상태 전이는 전부 여기서 한 번만 한다.** 각 `it` 은 그 결과를 읽기만 하므로 순서·단독
   * 실행에 흔들리지 않는다(Copilot 지적). 경기는 상태 기계라 "끝낸 뒤" 를 단언하려면 끝내는
   * 행위 자체는 어딘가에서 일어나야 하는데, 그걸 테스트 본문에 두면 그 테스트만 돌릴 때
   * 뒤따르는 단언들이 전제를 잃는다.
   */
  beforeAll(async () => {
    await run(leagueGameId, 'start', 'console-end-league-start');
    leagueEnd = await capture(() => run(leagueGameId, 'end', 'console-end-league-end'));

    await run(draftGameId, 'start', 'console-end-draft-start');
    draftEnd = await capture(() => run(draftGameId, 'end', 'console-end-draft-end'));

    await run(friendlyGameId, 'start', 'console-end-friendly-start');
    friendlyEnd = await capture(() => run(friendlyGameId, 'end', 'console-end-friendly-end'));

    // **C-1 재현: 진행 중에 대진이 취소된 상황.** 우천 중단·팀 이탈로 운영자가 대진을
    // 취소하는 경로(`cancelFixture`/`regenerateFixtures`/`removeTeam`)는 **게임을 건드리지
    // 않는다** — LIVE 이던 게임은 LIVE 로 남는다. 그래서 콘솔의 "경기 종료" 가 그대로 눌린다.
    await run(cancelledGameId, 'start', 'console-end-cancelled-start');
    await prisma.v1TeamMatch.update({
      where: { id: ids.cancelledMatch },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    cancelledEnd = await capture(() => run(cancelledGameId, 'end', 'console-end-cancelled-end'));

    await runFixture('start', 'console-end-fixture-start');
    fixtureEnd = await capture(() => runFixture('end', 'console-end-fixture-end'));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('리그 대진은 콘솔에서 시작하고 끝낼 수 있다', () => {
    expect(leagueEnd.ok && leagueEnd.value.state).toBe(V1GameState.ENDED);
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

  it('초안이 남아 있어도 콘솔 종료가 된다 — 다음 번호로 붙인다 (#31)', async () => {
    // 예전엔 `revision: 1` 리터럴이라 `@@unique([gameId, revision])` 에 걸려 P2002 가 났고,
    // 그 P2002 는 경합 코드로 번역돼 **"reload and retry"** 라는 거짓 안내가 나갔다 —
    // 재시도해도 영원히 같은 답이다(원인이 경합이 아니다).
    expect(draftEnd.ok && draftEnd.value.state).toBe(V1GameState.ENDED);

    const revisions = await prisma.v1GameResultRevision.findMany({
      where: { gameId: draftGameId },
      orderBy: { revision: 'asc' },
      select: { revision: true, state: true },
    });
    // 초안은 **그대로 남는다**(지우는 경로가 없다) — 그 위에 다음 번호로 붙는다.
    expect(revisions).toEqual([
      { revision: 1, state: 'DRAFT' },
      { revision: 2, state: 'SUBMITTED' },
    ]);
  });

  it('취소된 리그 대진은 콘솔로 끝낼 수 없다 — 되살아나면 24시간 뒤 자동 확정된다 (C-1)', () => {
    // 이걸 열어 두면 **취소된 경기가 공식 결과가 된다.** 사슬이 이렇다:
    //   대진 취소는 게임을 안 끝낸다(LIVE 유지) → 콘솔 `end` 통과 → 완료 처리가
    //   `cancelled` 를 `completed` 로 바꾼다 → 24시간 뒤 자동 승인 잡의
    //   `revision.teamMatchStatus === 'cancelled'` 가드가 **이미 바뀐 값을 읽어** 통과 →
    //   OFFICIAL. 그 가드의 자기 주석이 정확히 이 시나리오를 적고 있다.
    //   순위표의 `status === 'cancelled'` 필터도 같은 이유로 뚫린다.
    // 즉 **가드를 지운 게 아니라 가드가 보는 값을 바꿔서** 같은 결과를 만든다.
    expect(httpBody(cancelledEnd)).toEqual({ status: 409, code: 'TEAM_MATCH_NOT_MATCHED' });
  });

  it('취소된 대진은 상태도 결과도 그대로다 — 되살아나지 않는다 (C-1)', async () => {
    const cancelled = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: ids.cancelledMatch } });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.completedAt).toBeNull();
    // 리비전 자체가 안 생겨야 한다 — `where` 를 `status: matched` 로 좁히는 것만으로는
    // 완료 처리만 막히고 **리비전은 그대로 생긴다**(그러면 자동 승인 레인에 그대로 들어간다).
    const revisions = await prisma.v1GameResultRevision.count({ where: { gameId: cancelledGameId } });
    expect(revisions).toBe(0);
  });

  it('리그 콘솔 결과를 에스컬레이션 핸들러에 태우면 아무것도 안 만든다 (A-3)', async () => {
    // **이벤트는 그대로 발행된다** — 억제는 생산자가 아니라 **핸들러**에서 한다. 생산자는
    // 넷(콘솔 end · 팀 제출 · 어드민 정정 재제출 · 어시스트 동기화)이라 각각 막으면 하나가
    // 조용히 빠지고, 실제로 어드민 정정 재제출은 리그에서 정상 도달 가능한 동선이다.
    //
    // 그래서 여기서는 **실제로 만들어진 이벤트를 핸들러에 태워** 아무 행도 안 생기는지 본다.
    const revisionId = (
      await prisma.v1GameResultRevision.findFirstOrThrow({
        where: { gameId: leagueGameId },
        orderBy: { revision: 'desc' },
        select: { id: true },
      })
    ).id;
    const before = await prisma.v1OutboxEvent.count({ where: { aggregateId: leagueGameId } });
    await prisma.$transaction((tx) => escalation.handler(escalationClaim(revisionId, leagueGameId), tx));
    const after = await prisma.v1OutboxEvent.count({ where: { aggregateId: leagueGameId } });
    // 예약 아웃박스(24h 자동승인 · 12h 재촉)가 **하나도 안 늘어야** 한다.
    expect(after).toBe(before);
    const queued = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM v1_result_escalations WHERE result_revision_id = ${revisionId}
    `;
    expect(Number(queued[0]?.n ?? 0)).toBe(0);
  });

  it('대회 픽스처는 같은 핸들러에서 그대로 만든다 (A-3 대조군)', async () => {
    // 억제가 너무 넓으면 **대회 운영이 조용히 멈춘다** — 화면에 안 보이는 종류라 아무도 모른다.
    expect(fixtureEnd.ok && fixtureEnd.value.state).toBe(V1GameState.ENDED);
    const revisionId = (
      await prisma.v1GameResultRevision.findFirstOrThrow({
        where: { gameId: fixtureGameId },
        orderBy: { revision: 'desc' },
        select: { id: true },
      })
    ).id;
    await prisma.$transaction((tx) => escalation.handler(escalationClaim(revisionId, fixtureGameId), tx));
    const queued = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM v1_result_escalations WHERE result_revision_id = ${revisionId}
    `;
    expect(Number(queued[0]?.n ?? 0)).toBeGreaterThan(0);
  });

  it('친선 팀매치는 여전히 콘솔로 끝낼 수 없다 (409) — 이 가드가 지키던 것', () => {
    expect(httpBody(friendlyEnd)).toEqual({ status: 409, code: 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN' });
  });

  it('친선은 종료 시도 뒤에도 완료되지 않는다 — 완료 부수효과가 새지 않았다', async () => {
    // **시도가 선행돼야 의미가 있다.** `beforeAll` 이 친선 `end` 를 실제로 한 번 시도한다 —
    // 시도 없이 보면 "아직 안 끝냈으니 당연히 미완료" 라 아무것도 증명하지 못한다.
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
