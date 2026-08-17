import { HttpException } from '@nestjs/common';
import {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSideKey,
  V1GameSourceType,
  V1OutboxStatus,
} from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';

/**
 * 대회 결과 **정정(correction) 레인**의 서버측 가드 — 사용자 보고 대응.
 *
 * > "대회 경기 기록 입력을 **수정**할 때 이미 남아 있는 기록까지 봤어야 하는데,
 * >  그게 연결이 안 돼서 선수 개개인 기록이 정확히 남지 않는다."
 *
 * 정정 레인은 정본 종료(`end`) 레인이 갖춘 가드를 하나도 복제하지 않았다.
 * `end`는 `GamesService.applyPenalties`가 승부차기·무승부를 검증하는데, 정정은
 * 클라이언트가 준 score를 그대로 저장했고(`score: jsonInput(dto.changes.score)`)
 * 참가자는 중복·sideId만 봤다. 이 파일은 그 네 결함(2-B/2-C/2-E/2-F)이 실제
 * Postgres + 아웃박스 워커까지 태운 상태에서 닫혔는지 검증한다.
 *
 * ## 이 파일이 재현하는 최악의 경로 (2-C)
 *
 * 정정 폼(`result-edit-modal.tsx`)은 항상 평평한 `{home, away}`만 보내므로
 * 승부차기 점수가 탈락한다. 결선 경기를 정정하면:
 *
 *   1. 무승부(1-1)가 그대로 DRAFT → officialize로 공식 확정된다. **200 성공.**
 *   2. 아웃박스의 브래킷 프로젝션이
 *      `resolveWinnerSide`에서 `BRACKET_RESULT_DRAW_UNSUPPORTED`를 던진다.
 *   3. 워커가 6회 재시도 끝에 그 잡을 **POISONED**로 남긴다.
 *   4. 운영자 화면에는 "성공"만 보이고, **다음 라운드 대진이 영영 비어 있다.**
 *
 * 이 사고는 이미 한 번 났고 `games/core/knockout-penalties.ts`의 docblock에
 * 박제돼 있다 — 그때 `end` 경로만 막고 정정 경로엔 같은 가드를 넣지 않았다.
 *
 * 아래 세 테스트가 한 세트다: ① "정정 시점에 409로 돌려줘야 한다",
 * ② "그 거부가 막다른 길이 아니다 — 승부차기를 실으면 저장되고 POISONED 없이
 * 끝난다", ③ **역방향** "폼이 승부차기를 못 보내는 현실에서도 base 값을 승계해
 * 정정 자체가 막히지 않는다". ③이 없으면 이 PR은 조용한 POISONED를 "정정 화면이
 * 영구히 409" 라는 다른 결함으로 바꿔 놓는다.
 *
 * ## 실행 환경
 *
 * 실제 Postgres가 필요하다(`DATABASE_URL`). 작성 시점 로컬에는 v1 Postgres가
 * 없어(관련 컨테이너 전부 Exited) **CI의 integration 프로젝트에서 처음 실행된다** —
 * `jest.config.ts`의 `test/tournaments/**\/*.integration-spec.ts` 글롭이 이
 * 파일을 자동으로 선택한다(위 글롭의 `/`를 이스케이프한 이유: 이스케이프
 * 없이 적으면 `**` 뒤의 `*` + `/`가 이 블록 주석을 여기서 닫아 버려 아래 코드
 * 전체가 주석 밖으로 튀어나오고, 파일이 파싱조차 되지 않는다 — `test/`는
 * `tsconfig.json`의 `include`에 없어서 `tsc --noEmit`으로는 드러나지 않고
 * CI에서 "Test suite failed to run"으로만 나타난다).
 */
const ids = {
  platformOps: '91000000-0000-4000-8000-000000000001',
  sport: '91000000-0000-4000-8000-000000000010',
  region: '91000000-0000-4000-8000-000000000011',
  hostTeam: '91000000-0000-4000-8000-000000000020',
  opponentTeam: '91000000-0000-4000-8000-000000000021',
  tournament: '91000000-0000-4000-8000-000000000030',
  semiGroup: '91000000-0000-4000-8000-000000000031',
  groupPhaseGroup: '91000000-0000-4000-8000-000000000032',
  /** 결선 + 진출 엣지. 무승부 정정이 POISONED를 만드는 픽스처. */
  drawCorrectionFixture: '91000000-0000-4000-8000-000000000040',
  /** 위 픽스처의 다음 라운드. 승자가 배정되어야 한다. */
  nextRoundFixture: '91000000-0000-4000-8000-000000000041',
  /** 결선 + 진출 엣지. 승부차기를 실은 정정이 브래킷을 진행시키는 픽스처. */
  penaltyCorrectionFixture: '91000000-0000-4000-8000-000000000042',
  penaltyNextRoundFixture: '91000000-0000-4000-8000-000000000043',
  /**
   * 결선, 진출 엣지 **없음**(결승·3/4위전 형태). base 승부차기 승계를 검증한다 —
   * 엣지가 없으면 브래킷 프로젝션이 `edges.length === 0`에서 그냥 return하므로
   * 이 테스트는 "정정이 통과하고 승부차기가 승계돼 저장되는가"만 본다.
   */
  carryOverFixture: '91000000-0000-4000-8000-000000000046',
  /** 조별리그. 참가자 계열 가드(2-B/2-F/2-G)를 검증하는 픽스처. */
  participantGuardFixture: '91000000-0000-4000-8000-000000000044',
  /** 다른 경기 — 남의 participantId 출처. */
  foreignFixture: '91000000-0000-4000-8000-000000000045',
  hostRegistration: '91000000-0000-4000-8000-000000000050',
  opponentRegistration: '91000000-0000-4000-8000-000000000051',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@correction-guards.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(payload: unknown, commandId: string): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the correction to be rejected');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function drainOutbox(): Promise<void> {
  const worker = new V1GameOperationsWorkerService(prisma);
  let guard = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await worker.processOne()) {
    guard += 1;
    if (guard > 80) throw new Error('Correction guards outbox drain guard exceeded');
  }
}

function previewHash(revision: { score: unknown; eventsHash: string; mvpParticipantId: string | null }): string {
  return canonicalGameCommandPayloadHash({
    score: revision.score,
    eventsHash: revision.eventsHash,
    mvpParticipantId: revision.mvpParticipantId,
  });
}

async function buildTournamentGame(fixtureId: string): Promise<string> {
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
    sourceId: fixtureId,
    competitionConfigVersionId: config.id,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Correction Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Correction Opponent' },
    ],
    participants: [
      {
        sourceParticipantId: `host-player-${fixtureId}`,
        sideKey: V1GameSideKey.HOME,
        displayNameSnapshot: 'Host Scorer',
      },
      {
        sourceParticipantId: `away-player-${fixtureId}`,
        sideKey: V1GameSideKey.AWAY,
        displayNameSnapshot: 'Away Scorer',
      },
    ],
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `correction-source-${fixtureId}`)),
  );
  return created.gameId;
}

async function grantTakeover(gameId: string, seed: string): Promise<string> {
  const grant = await games.requestTakeover(authUser(ids.platformOps), gameId, {
    clientInstanceId: `correction-${seed}-client`,
    lastSequence: 0,
  });
  return grant.takeoverToken;
}

type GameSetup = {
  readonly gameId: string;
  readonly homeSideId: string;
  readonly awaySideId: string;
  readonly homeScorerId: string;
  readonly awayScorerId: string;
  /** 정정의 base가 되는 현재 공식 리비전. */
  readonly officialRevisionId: string;
  /** 그 officialize 직후의 game.version. */
  readonly version: number;
};

/**
 * 픽스처를 만들고 `homeGoals`-`awayGoals`로 종료 → officialize까지 몰고 간다.
 * 정정은 "현재 공식 리비전"을 base로만 시작할 수 있으므로 여기까지가 전제다.
 *
 * `endPayload`로 `end` 커맨드의 승부차기를 실어 결선 무승부도 정상 종료시킬 수
 * 있다 — `applyPenalties`가 `end` 레인에서는 이미 무승부를 막기 때문에, 결선
 * 픽스처를 "정정 가능한 공식 결과가 있는 상태"로 만들려면 반드시 필요하다.
 */
async function endAndOfficialize(
  fixtureId: string,
  homeGoals: number,
  awayGoals: number,
  endPayload: Record<string, unknown> = {},
): Promise<GameSetup> {
  const gameId = await buildTournamentGame(fixtureId);
  const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
  const away = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.AWAY } });
  const homeScorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
  const awayScorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: away.id } });

  await prisma.v1GameLineup.updateMany({
    where: { gameId, sideId: { in: [home.id, away.id] }, revision: 1 },
    data: { state: 'SUBMITTED' },
  });

  const startToken = await grantTakeover(gameId, `start-${fixtureId}`);
  await games.executeCommand(authUser(ids.platformOps), gameId, 'start', `correction-start-${fixtureId}`, {
    expectedVersion: 0,
    clientCommandId: `correction-start-${fixtureId}`,
    takeoverToken: startToken,
    occurredAt: new Date().toISOString(),
    payload: {},
  });

  let version = 1;
  const appendGoal = async (sideId: string, participantId: string, seed: string, clockMs: number) => {
    const token = await grantTakeover(gameId, seed);
    await games.appendEvent(authUser(ids.platformOps), gameId, `correction-goal-${seed}`, {
      expectedVersion: version,
      clientEventId: `correction-goal-${seed}`,
      takeoverToken: token,
      type: V1GameEventType.GOAL,
      sideId,
      participantId,
      period: 1,
      clockMs,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    version += 1;
  };
  for (let i = 0; i < homeGoals; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await appendGoal(home.id, homeScorer.id, `${fixtureId}-home-${i}`, 60_000 + i * 1000);
  }
  for (let i = 0; i < awayGoals; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await appendGoal(away.id, awayScorer.id, `${fixtureId}-away-${i}`, 70_000 + i * 1000);
  }

  const endToken = await grantTakeover(gameId, `end-${fixtureId}`);
  await games.executeCommand(authUser(ids.platformOps), gameId, 'end', `correction-end-${fixtureId}`, {
    expectedVersion: version,
    clientCommandId: `correction-end-${fixtureId}`,
    takeoverToken: endToken,
    occurredAt: new Date().toISOString(),
    payload: endPayload,
  });

  const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({
    where: { gameId },
    orderBy: { revision: 'desc' },
  });
  const gameAfterEnd = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
  const officialized = await resultReview.officializeResultRevision(
    authUser(ids.platformOps),
    gameId,
    submitted.id,
    `correction-officialize-${fixtureId}`,
    {
      expectedVersion: gameAfterEnd.version,
      clientCommandId: `correction-officialize-${fixtureId}`,
      projectionPreviewHash: previewHash(submitted),
    },
  );
  await drainOutbox();

  return {
    gameId,
    homeSideId: home.id,
    awaySideId: away.id,
    homeScorerId: homeScorer.id,
    awayScorerId: awayScorer.id,
    officialRevisionId: officialized.revisionId,
    version: officialized.version,
  };
}

/** 이 경기의 정상 참가자 두 명. 모든 정상 정정 본문의 기본값. */
function participantsOf(setup: GameSetup, homeGoals: number, awayGoals: number) {
  return [
    {
      participantId: setup.homeScorerId,
      sideId: setup.homeSideId,
      started: true,
      goals: homeGoals,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    },
    {
      participantId: setup.awayScorerId,
      sideId: setup.awaySideId,
      started: true,
      goals: awayGoals,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    },
  ];
}

let attempt = 0;
/**
 * `expectedVersion`을 **매 호출 직전에 DB에서 다시 읽는다.**
 *
 * `createResultCorrection`은 성공할 때마다 `v1Game.version`을 +1 하고(실패는
 * 롤백되어 그대로), 커맨드 경계 `withResultCommand`는 mutate 콜백보다 **먼저**
 * `assertCommandContext({ expectedVersion, currentVersion: game.version })`를
 * 돌린다. 그래서 `beforeAll`에서 한 번 읽은 `setup.version`을 재사용하면 아래
 * describe의 **첫 성공 정정 이후 모든 호출이 409 `VERSION_CONFLICT`**가 되고,
 * 이 파일이 검증하려는 가드에는 도달조차 하지 않는다(테스트가 초록/빨강 둘 다
 * 엉뚱한 이유로 나온다). 정정은 공식 포인터를 옮기지 않으므로
 * `baseRevisionId`는 그대로 유효하다.
 */
async function correct(setup: GameSetup, changes: Record<string, unknown>) {
  attempt += 1;
  const commandId = `correction-guard-${attempt}`;
  const current = await prisma.v1Game.findUniqueOrThrow({
    where: { id: setup.gameId },
    select: { version: true },
  });
  return resultReview.createResultCorrection(authUser(ids.platformOps), setup.gameId, commandId, {
    expectedVersion: current.version,
    clientCommandId: commandId,
    baseRevisionId: setup.officialRevisionId,
    reason: '기록 정정',
    changes: {
      score: { home: 1, away: 0 },
      actualParticipants: participantsOf(setup, 1, 0),
      eventsHash: `correction-hash-${attempt}`,
      ...changes,
    },
  } as never);
}

async function revisionCount(gameId: string): Promise<number> {
  return prisma.v1GameResultRevision.count({ where: { gameId } });
}

describe('대회 결과 정정 레인 가드', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the correction guard integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.create({
      data: {
        id: ids.platformOps,
        email: 'correction-guards-0@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Correction Guards Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'CORRECTION_GUARD_REGION', name: 'Correction Guard Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.platformOps,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Correction Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.platformOps,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Correction Opponent',
        },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Correction guards tournament' },
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    // knockout 판정의 단일 기준은 `V1TournamentGroup.phase`다 —
    // `V1TournamentFixture.round`는 한글/영문이 섞인 표시용 라벨이라 판별에 쓰면 함정.
    await prisma.v1TournamentGroup.createMany({
      data: [
        { id: ids.semiGroup, tournamentId: ids.tournament, name: '준결승', phase: 'semi' },
        { id: ids.groupPhaseGroup, tournamentId: ids.tournament, name: 'A조', phase: 'group' },
      ],
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        {
          id: ids.drawCorrectionFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '준결승',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.nextRoundFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '결승',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.penaltyCorrectionFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '준결승',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.penaltyNextRoundFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '결승',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.participantGuardFixture,
          tournamentId: ids.tournament,
          groupId: ids.groupPhaseGroup,
          round: '조별리그',
          fixtureNumber: 1,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.foreignFixture,
          tournamentId: ids.tournament,
          groupId: ids.groupPhaseGroup,
          round: '조별리그',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
        },
        {
          id: ids.carryOverFixture,
          tournamentId: ids.tournament,
          groupId: ids.semiGroup,
          round: '준결승',
          fixtureNumber: 3,
          competitionConfigVersionId: config.id,
        },
      ],
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        {
          id: ids.hostRegistration,
          tournamentId: ids.tournament,
          teamId: ids.hostTeam,
          appliedByUserId: ids.platformOps,
          status: 'confirmed',
        },
        {
          id: ids.opponentRegistration,
          tournamentId: ids.tournament,
          teamId: ids.opponentTeam,
          appliedByUserId: ids.platformOps,
          status: 'confirmed',
        },
      ],
    });
    for (const fixtureId of [
      ids.drawCorrectionFixture,
      ids.penaltyCorrectionFixture,
      ids.participantGuardFixture,
      ids.foreignFixture,
      ids.carryOverFixture,
    ]) {
      // eslint-disable-next-line no-await-in-loop
      await prisma.v1TournamentFixture.update({
        where: { id: fixtureId },
        data: { homeRegistrationId: ids.hostRegistration, awayRegistrationId: ids.opponentRegistration },
      });
    }
    // 진출 엣지가 있어야 브래킷 프로젝션이 실제로 승자를 판정한다
    // (`edges.length === 0`이면 그냥 return하므로 POISONED가 될 수 없다).
    await prisma.v1TournamentFixtureAdvancementEdge.createMany({
      data: [
        {
          tournamentId: ids.tournament,
          sourceFixtureId: ids.drawCorrectionFixture,
          sourceOutcome: 'WINNER',
          targetFixtureId: ids.nextRoundFixture,
          targetSide: 'HOME',
        },
        {
          tournamentId: ids.tournament,
          sourceFixtureId: ids.penaltyCorrectionFixture,
          sourceOutcome: 'WINNER',
          targetFixtureId: ids.penaltyNextRoundFixture,
          targetSide: 'HOME',
        },
      ],
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      create: { key: 'DIRECTOR_OFFICIALIZE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * 2-C 🔴. 정정이 결선 경기를 무승부로 만들면 브래킷이 승자를 못 뽑아
   * 조용히 멈춘다. 정정 시점에 409로 돌려줘야 운영자가 그 자리에서 승부차기를
   * 입력해 복구할 수 있다.
   *
   * base 는 **결정적**(2:1, 승부차기 없음)이어야 한다 — 승계할 승부차기가
   * 아예 없는 상태에서 정정이 동점을 만드는 것이 이 가드의 실제 도달 경로다.
   * base 가 이미 `1:1 + penalties` 인 경우는 `readStoredPenalties` 가 승계하므로
   * **통과가 정답**이고, 그 경로는 아래 '2-C 역방향' 테스트가 따로 못박는다.
   * (CI 첫 실행에서 이 테스트가 실패해 발견 — base 를 동점+승부차기로 두면
   *  승계가 일어나 거부되지 않는다.)
   */
  it('2-C: 결정적 결선 결과를 무승부로 정정하면 409 TOURNAMENT_PENALTY_REQUIRED로 거부하고 리비전을 만들지 않는다', async () => {
    const setup = await endAndOfficialize(ids.drawCorrectionFixture, 2, 1);
    const before = await revisionCount(setup.gameId);

    // 정정 폼이 실제로 보내는 형태: 평평한 {home, away} — 승부차기 탈락.
    const rejected = await captureFailure(() =>
      correct(setup, {
        score: { home: 1, away: 1 },
        actualParticipants: participantsOf(setup, 1, 1),
      }),
    );

    expectHttpCode(rejected, 409, 'TOURNAMENT_PENALTY_REQUIRED');
    expect(await revisionCount(setup.gameId)).toBe(before);

    // 거부가 롤백됐으므로 공식 포인터도 그대로다.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } });
    expect(game.currentOfficialRevisionId).toBe(setup.officialRevisionId);

    // 그리고 아무 잡도 POISONED가 되지 않았다 — 이 가드가 막으려는 최종 피해.
    const poisoned = await prisma.v1OutboxEvent.count({
      where: { aggregateId: setup.gameId, status: V1OutboxStatus.POISONED },
    });
    expect(poisoned).toBe(0);
  });

  /**
   * 거부가 막다른 길이 아니라는 증거: 승부차기를 실은 정정은 그 값이 온전히
   * 저장되고, officialize 후 브래킷이 **POISONED 없이** 끝난다.
   *
   * ⚠️ 여기서 승부차기 **승자를 뒤집지 않는다**(5-4 → 6-4, 둘 다 home 승).
   * 정정으로 승자를 바꾸는 것은 오늘 지원되지 않는 동작이기 때문이다:
   * `officializeResultRevision`은 `GAME_RESULT_OFFICIAL` 하나만 아웃박스에 쓰고
   * 이전 진출 배정을 되돌리는 이벤트를 쓰지 않으므로, 재실행되는
   * `GameResultBracketProjectionService.assignTarget`이 이미 점유된 target side를
   * 보고 `BRACKET_TARGET_SIDE_CONFLICT`를 던진다 → 그 잡이 POISONED가 된다.
   * 승자 변경은 void → 재진입 흐름의 일이고 이 PR의 범위가 아니다(PR-4).
   * "정정이 브래킷 승자를 교체한다"고 단언하면 제품이 하지 않는 동작을 못박는
   * 가짜 테스트가 된다.
   */
  it('2-C: 승부차기를 실어 정정하면 저장되고, officialize 후 POISONED 없이 끝난다', async () => {
    const setup = await endAndOfficialize(ids.penaltyCorrectionFixture, 1, 1, {
      penalties: { home: 5, away: 4 },
    });

    // 최초 확정은 home 승 → 다음 라운드 HOME 슬롯은 host 팀.
    const targetBefore = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.penaltyNextRoundFixture },
    });
    expect(targetBefore.homeRegistrationId).toBe(ids.hostRegistration);

    const correction = await correct(setup, {
      score: { home: 1, away: 1, penalties: { home: 6, away: 4 } },
      actualParticipants: participantsOf(setup, 1, 1),
    });
    expect(correction.revisionState).toBe(V1GameResultRevisionState.DRAFT);

    const draft = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: correction.revisionId },
    });
    // 클라이언트가 보낸 승부차기가 온전히 저장됐다.
    expect(draft.score).toEqual({ home: 1, away: 1, penalties: { home: 6, away: 4 } });

    const gameBeforeOfficialize = await prisma.v1Game.findUniqueOrThrow({ where: { id: setup.gameId } });
    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      setup.gameId,
      correction.revisionId,
      'correction-penalty-officialize',
      {
        expectedVersion: gameBeforeOfficialize.version,
        clientCommandId: 'correction-penalty-officialize',
        projectionPreviewHash: previewHash(draft),
      },
    );
    expect(officialized.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);
    await drainOutbox();

    // 승자가 그대로이므로 브래킷 배정도 그대로다(`assignTarget`은
    // `current === registrationId`에서 조용히 return한다).
    const targetAfter = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.penaltyNextRoundFixture },
    });
    expect(targetAfter.homeRegistrationId).toBe(ids.hostRegistration);

    // POISONED 없이 끝났다 — 이 가드가 막으려는 최종 피해가 실제로 없다.
    const poisoned = await prisma.v1OutboxEvent.count({
      where: { aggregateId: setup.gameId, status: V1OutboxStatus.POISONED },
    });
    expect(poisoned).toBe(0);
  });

  /**
   * 2-C 역방향 — 가드를 조이다 정상 흐름을 막지 않았는가.
   *
   * 정정 폼(`result-edit-modal.tsx`)은 **항상 평평한 `{home, away}`만** 보내고
   * 클라이언트 타입 `V1GameResultScoreInput`에는 penalties 필드조차 없다. 한편
   * `end` 레인이 이미 결선 무승부를 막으므로 공식이 된 결선 무승부 경기는 예외
   * 없이 `score.penalties`를 갖는다. 그래서 "penalties가 없으면 결선 무승부 거부"
   * 만 구현하면 승부차기로 결정된 **모든** 결선 경기가 어떤 정정도 받지 않게
   * 된다(득점자 오기입 하나 고치는 것조차) — 폼에 승부차기 입력란이 없으므로
   * 409가 요구하는 행동을 할 방법이 없다. 서버가 base 리비전의 값을 승계해야
   * 한다.
   */
  it('2-C 역방향: 폼이 penalties를 떨어뜨려도 base 승부차기를 승계해 득점자 정정이 통과한다', async () => {
    const setup = await endAndOfficialize(ids.carryOverFixture, 1, 1, {
      penalties: { home: 5, away: 4 },
    });

    // 폼이 실제로 보내는 형태 — 평평한 {home, away}. 참가자 기록만 바꾼다.
    const correction = await correct(setup, {
      score: { home: 1, away: 1 },
      actualParticipants: participantsOf(setup, 1, 1),
    });

    const draft = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: correction.revisionId },
    });
    // 승계된 값이 실제로 저장돼야 한다 — 저장되지 않으면 officialize 후
    // `resolveWinnerSide`가 draw로 떨어져 잡이 POISONED가 된다.
    expect(draft.score).toEqual({ home: 1, away: 1, penalties: { home: 5, away: 4 } });
  });

  describe('참가자·승부차기 형태 가드 (조별리그 픽스처)', () => {
    let setup: GameSetup;
    let foreignParticipantId: string;

    beforeAll(async () => {
      setup = await endAndOfficialize(ids.participantGuardFixture, 1, 0);
      // 완전히 다른 경기의 참가자 — 이 경기의 정정에 등장할 수 없어야 한다.
      const foreignGameId = await buildTournamentGame(ids.foreignFixture);
      const foreign = await prisma.v1GameParticipant.findFirstOrThrow({
        where: { gameId: foreignGameId },
      });
      foreignParticipantId = foreign.id;
    });

    /** 짝 증거. 이게 초록이면 위 픽스처·멱등키·버전 CAS가 모두 옳다. */
    it('정상 정정은 통과하고 참가자 행을 실제로 만든다', async () => {
      const correction = await correct(setup, {});

      expect(correction.revisionState).toBe(V1GameResultRevisionState.DRAFT);
      const rows = await prisma.v1GameResultParticipant.findMany({
        where: { resultRevisionId: correction.revisionId },
      });
      expect(rows).toHaveLength(2);
    });

    /**
     * 2-B. 빈 배열이 통과하면 새 공식 리비전의 개인기록이 0행이 된다.
     * `public-user-records.service.ts`가 `v1GameResultParticipant`를 직접 읽으므로
     * 그 경기의 선수 개개인 기록이 전멸한다 — 사용자 보고와 정확히 같은 증상.
     *
     * 가드의 술어는 "비우지 말라"가 아니라 **"있던 것을 비우지 말라"**다(base
     * 리비전이 정당하게 0행인 경기의 정정을 막지 않기 위해). 그래서 이 테스트가
     * 옳은 이유로 초록인지 확인하려면 **base에 개인기록이 실제로 있다는 전제**를
     * 먼저 단언해야 한다 — 0행이었다면 이 정정은 통과해야 정상이고, 그때
     * `toBe(before)`만 보는 테스트는 아무것도 증명하지 못한다.
     */
    it('2-B: base에 개인기록이 있으면 빈 actualParticipants를 422 PARTICIPANT_INVALID로 거부한다', async () => {
      const baseParticipants = await prisma.v1GameResultParticipant.count({
        where: { resultRevisionId: setup.officialRevisionId },
      });
      expect(baseParticipants).toBeGreaterThan(0);
      const before = await revisionCount(setup.gameId);

      const rejected = await captureFailure(() => correct(setup, { actualParticipants: [] }));

      expectHttpCode(rejected, 422, 'PARTICIPANT_INVALID');
      expect(await revisionCount(setup.gameId)).toBe(before);
    });

    /**
     * 2-F. `assertCorrectionParticipantsValid`는 중복과 sideId만 본다 —
     * participantId가 *이 경기의* 참가자인지 확인하지 않는다.
     * `v1_game_result_participants.participantId`에는 FK도 없어서 DB도 막지
     * 않는다. 그래서 남의 경기 참가자가 이 경기의 공식 기록에 들어가고,
     * 그 선수의 개인 통계에 남의 경기 성적이 더해진다.
     */
    it('2-F: 정상 참가자 옆에 다른 경기의 participantId를 끼워 넣으면 422 PARTICIPANT_INVALID', async () => {
      const before = await revisionCount(setup.gameId);

      const rejected = await captureFailure(() =>
        correct(setup, {
          // 정상 참가자를 **빼지 않고** 남의 것을 하나 더 얹는다. 남의 것만
          // 보내면 재제출 레인에서는 `validateGameResultInvariants`가 다른 이유로
          // 먼저 걸려(GOAL 이벤트의 득점자가 목록에 없음) 이 가드가 없어도
          // 초록이 된다 — 실제 구멍은 `goals: 0`인 남의 행을 추가하는 형태다.
          actualParticipants: [
            ...participantsOf(setup, 1, 0),
            {
              participantId: foreignParticipantId,
              sideId: setup.awaySideId,
              started: true,
              goals: 0,
              cards: { yellow: 0, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      );

      expectHttpCode(rejected, 422, 'PARTICIPANT_INVALID');
      expect(await revisionCount(setup.gameId)).toBe(before);
    });

    it('2-F: 이 경기의 참가자를 상대 진영으로 잘못 적어도 422 PARTICIPANT_INVALID', async () => {
      const before = await revisionCount(setup.gameId);

      const rejected = await captureFailure(() =>
        correct(setup, {
          actualParticipants: [
            {
              // homeScorer는 실제로 homeSide 소속인데 awaySide로 적었다.
              // sideId 자체는 이 경기의 side이므로 리팩터 전 가드는 통과시켰다.
              participantId: setup.homeScorerId,
              sideId: setup.awaySideId,
              started: true,
              goals: 1,
              cards: { yellow: 0, red: 0 },
              goalkeeper: false,
            },
          ],
        }),
      );

      expectHttpCode(rejected, 422, 'PARTICIPANT_INVALID');
      expect(await revisionCount(setup.gameId)).toBe(before);
    });

    /**
     * 2-G. `GameScoreDto.penalties`가 `@IsOptional() @IsObject()`뿐이라 형태가
     * 깨진 값이 통과한다. 그 값이 저장되면 아웃박스 핸들러의
     * `parseOfficialPenalties`가 throw → 6회 재시도 → POISONED.
     *
     * `null`과 `{}`는 DTO만으로는 못 막는다(`@IsOptional()`은 null을 건너뛴다).
     * 서비스가 `extractEndPenalties`를 재사용해 422로 거부해야 한다.
     */
    it.each([
      ['null', null],
      ['빈 객체', {}],
      ['home이 문자열', { home: 'a', away: 0 }],
      ['away 누락', { home: 1 }],
      ['음수', { home: -1, away: 0 }],
    ])('2-G: penalties가 %s이면 422 TOURNAMENT_PENALTY_INVALID', async (_label, penalties) => {
      const before = await revisionCount(setup.gameId);

      const rejected = await captureFailure(() =>
        correct(setup, { score: { home: 1, away: 0, penalties } }),
      );

      expectHttpCode(rejected, 422, 'TOURNAMENT_PENALTY_INVALID');
      expect(await revisionCount(setup.gameId)).toBe(before);
    });

    /**
     * 2-C의 조별리그 쪽 반대 방향. 조별리그 무승부는 정상 결과이므로 막지
     * 않지만, 조별리그에 승부차기를 실으면 거부해야 한다 —
     * `calculateCompetitionStandings`가 승부차기를 승패로 읽을 여지를 만들지
     * 않기 위해서다(`end` 레인의 `TOURNAMENT_PENALTY_NOT_ALLOWED`와 동일 정책).
     */
    it('2-C: 조별리그 정정에 승부차기를 실으면 409 TOURNAMENT_PENALTY_NOT_ALLOWED', async () => {
      const before = await revisionCount(setup.gameId);

      const rejected = await captureFailure(() =>
        correct(setup, {
          score: { home: 1, away: 1, penalties: { home: 5, away: 4 } },
          actualParticipants: participantsOf(setup, 1, 1),
        }),
      );

      expectHttpCode(rejected, 409, 'TOURNAMENT_PENALTY_NOT_ALLOWED');
      expect(await revisionCount(setup.gameId)).toBe(before);
    });

    it('2-C: 조별리그 무승부 정정은 정상 결과이므로 막지 않는다(짝 증거)', async () => {
      const correction = await correct(setup, {
        score: { home: 1, away: 1 },
        actualParticipants: participantsOf(setup, 1, 1),
      });

      expect(correction.revisionState).toBe(V1GameResultRevisionState.DRAFT);
    });

    /**
     * 2-E. 정정 경로만 `missingScorer: false`를 하드코딩한다(supersede 경로는
     * `invariant.missingScorer`를 쓴다). 하드코딩은 "득점자 미상 골이 있다"는
     * 사실을 새 공식 리비전에서 조용히 지워, 아무도 그 골의 득점자를 채워 넣지
     * 않게 만든다.
     */
    it('2-E: 득점자 미상 GOAL 이벤트가 있으면 정정 리비전의 missingScorer가 true다', async () => {
      // 이 경기의 GOAL 이벤트에서 득점자를 떼어 "미상" 상태를 만든다.
      // ENDED 게임은 새 이벤트를 받을 수 없으므로 기존 행을 직접 고친다 —
      // 이벤트 로그 자체가 정정 대상일 수 있다는 이 레인의 전제와 같은 상황이다.
      await prisma.v1GameEvent.updateMany({
        where: { gameId: setup.gameId, type: V1GameEventType.GOAL },
        data: { participantId: null },
      });

      const correction = await correct(setup, {});

      const draft = await prisma.v1GameResultRevision.findUniqueOrThrow({
        where: { id: correction.revisionId },
      });
      expect(draft.missingScorer).toBe(true);
    });
  });
});
