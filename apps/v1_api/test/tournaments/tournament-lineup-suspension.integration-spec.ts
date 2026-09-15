import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * 대회 축 출전정지 가드 — `GamesService.submitLineup` 이 `DISCIPLINE_SUSPENDED` 로 막는다.
 *
 * **이 스펙이 없던 동안 그 코드를 단언하는 테스트가 저장소 전체에 0건이었다.**
 * (`card-suspension.spec.ts` 는 순수 규칙만 보고 DB·가드를 지나지 않는다.) 그래서 규칙을
 * 축에서 떼어내는 리팩터가 들어올 때마다 "행동이 보존됐다" 를 **코드 대조로만** 말할 수
 * 있었다. 이 스펙이 그 자리를 실행으로 바꾼다.
 *
 * ## 왜 통합인가
 *
 * 판정이 성립하려면 **네 테이블의 관계**가 필요하다 — 대회의 규정 컬럼 · 픽스처의 일정
 * 순서 · 앞 경기 결과 리비전의 카드 · 그 카드가 붙은 참가자의 `userId`. mock 으로 만들면
 * 그 관계를 내가 지어내는 것이라 아무것도 증명하지 못한다.
 *
 * ## 왜 takeover 토큰이 없어도 되나
 *
 * 인계 토큰은 **참가팀의 사전 명단 제출에는 요구되지 않는다** — takeover 는 "현장 기기가
 * 이 경기를 배타적으로 장악 중" 이라는 라이브 운영 개념이라 경기 전 로스터 준비와 무관하다
 * (`submitLineup` 의 그 자리 주석). 그래서 팀장 신원으로 부르면 그 관문을 지나지 않는다.
 */

const ids = {
  hostOwner: '6c000000-0000-4000-8000-000000000001',
  suspended: '6c000000-0000-4000-8000-000000000002',
  clean: '6c000000-0000-4000-8000-000000000003',
  awayOwner: '6c000000-0000-4000-8000-000000000004',
  sport: '6c000000-0000-4000-8000-000000000010',
  region: '6c000000-0000-4000-8000-000000000011',
  hostTeam: '6c000000-0000-4000-8000-000000000020',
  awayTeam: '6c000000-0000-4000-8000-000000000021',
  // 규정 ON 대회
  strictTournament: '6c000000-0000-4000-8000-000000000030',
  strictHostReg: '6c000000-0000-4000-8000-000000000031',
  strictAwayReg: '6c000000-0000-4000-8000-000000000032',
  strictPastFixture: '6c000000-0000-4000-8000-000000000033',
  strictNextFixture: '6c000000-0000-4000-8000-000000000034',
  // 규정 OFF 대회 (같은 상황, 같은 사람)
  openTournament: '6c000000-0000-4000-8000-000000000040',
  openHostReg: '6c000000-0000-4000-8000-000000000041',
  openAwayReg: '6c000000-0000-4000-8000-000000000042',
  openPastFixture: '6c000000-0000-4000-8000-000000000043',
  openNextFixture: '6c000000-0000-4000-8000-000000000044',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('대회 축 출전정지 — 라인업 제출이 DISCIPLINE_SUSPENDED 로 막힌다', () => {
  let configId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the tournament suspension spec');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 preset is required');
    configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.hostOwner, ids.suspended, ids.clean, ids.awayOwner].map((id, index) => ({
        id,
        email: `tournament-suspension-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: '대회 정지 풋살' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TOURNAMENT_SUSPENSION_REGION', name: '대회 정지 지역', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostOwner, sportId: ids.sport, regionId: ids.region, name: '정지 홈팀' },
        { id: ids.awayTeam, ownerUserId: ids.awayOwner, sportId: ids.sport, regionId: ids.region, name: '정지 원정팀' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.suspended, role: 'member', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.clean, role: 'member', status: 'active' },
        { teamId: ids.awayTeam, userId: ids.awayOwner, role: 'owner', status: 'active' },
      ],
    });

    await seedTournament({
      tournamentId: ids.strictTournament,
      title: '규정 켠 대회',
      redCardSuspensionMatches: 1,
      hostRegistrationId: ids.strictHostReg,
      awayRegistrationId: ids.strictAwayReg,
      pastFixtureId: ids.strictPastFixture,
      nextFixtureId: ids.strictNextFixture,
    });
    await seedTournament({
      tournamentId: ids.openTournament,
      title: '규정 끈 대회',
      redCardSuspensionMatches: null,
      hostRegistrationId: ids.openHostReg,
      awayRegistrationId: ids.openAwayReg,
      pastFixtureId: ids.openPastFixture,
      nextFixtureId: ids.openNextFixture,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedTournament(input: {
    tournamentId: string;
    title: string;
    redCardSuspensionMatches: number | null;
    hostRegistrationId: string;
    awayRegistrationId: string;
    pastFixtureId: string;
    nextFixtureId: string;
  }) {
    await prisma.v1Tournament.create({
      data: {
        id: input.tournamentId,
        sportId: ids.sport,
        regionId: ids.region,
        title: input.title,
        competitionConfigVersionId: configId,
        redCardSuspensionMatches: input.redCardSuspensionMatches,
      },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        {
          id: input.hostRegistrationId,
          tournamentId: input.tournamentId,
          teamId: ids.hostTeam,
          appliedByUserId: ids.hostOwner,
          status: 'confirmed',
        },
        {
          id: input.awayRegistrationId,
          tournamentId: input.tournamentId,
          teamId: ids.awayTeam,
          appliedByUserId: ids.awayOwner,
          status: 'confirmed',
        },
      ],
    });
    // 일정 순서가 정지 판정의 기준틀이다 — 앞 경기가 먼저 와야 그 카드가 "이미 치른
    // 경기" 로 잡힌다. 대회 경기는 canonical TeamMatch + Details가 정본이다.
    await prisma.v1TeamMatch.createMany({
      data: [
        {
          id: input.pastFixtureId,
          tournamentId: input.tournamentId,
          sportId: ids.sport,
          regionId: ids.region,
          title: `${input.title} 지난 경기`,
          hostTeamId: ids.hostTeam,
          approvedApplicantTeamId: ids.awayTeam,
          startAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          competitionConfigVersionId: configId,
        },
        {
          id: input.nextFixtureId,
          tournamentId: input.tournamentId,
          sportId: ids.sport,
          regionId: ids.region,
          title: `${input.title} 다음 경기`,
          hostTeamId: ids.hostTeam,
          approvedApplicantTeamId: ids.awayTeam,
          startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          competitionConfigVersionId: configId,
        },
      ],
    });
    await prisma.v1TournamentMatchDetails.createMany({
      data: [
        {
          teamMatchId: input.pastFixtureId,
          tournamentId: input.tournamentId,
          round: 'group',
          fixtureNumber: 1,
          homeRegistrationId: input.hostRegistrationId,
          awayRegistrationId: input.awayRegistrationId,
        },
        {
          teamMatchId: input.nextFixtureId,
          tournamentId: input.tournamentId,
          round: 'group',
          fixtureNumber: 2,
          homeRegistrationId: input.hostRegistrationId,
          awayRegistrationId: input.awayRegistrationId,
        },
      ],
    });

    for (const fixtureId of [input.pastFixtureId, input.nextFixtureId]) {
      const creation: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: fixtureId,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: '정지 홈팀' },
          { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: '정지 원정팀' },
        ],
        participants: [],
      };
      const context: GameCommandContext = {
        // **시드 액터를 시나리오와 같은 사람으로 둔다.** `actorUserId` 는 팀장인데 `role` 만
        // `platform_ops` 로 두면 두 의미가 섞이고, 나중에 role 기반 가드가 붙었을 때 시드
        // 경로가 **비현실적으로 통과**한다 — 픽스처가 실제와 다른 모양이라 테스트가 거짓으로
        // 통과하는 그 부류다(Copilot 지적).
        actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
        expectedVersion: 0,
        durableCommandId: `tournament-suspension-${fixtureId}`,
        payloadHash: canonicalGameCommandPayloadHash(creation),
      };
      await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, creation, context));
    }

    await seedRedCardResult(input.pastFixtureId);
    await seedDraftRoster(input.nextFixtureId);
  }

  /** 앞 경기에 "레드카드 1장" 제출본을 심는다. */
  async function seedRedCardResult(fixtureId: string) {
    const { game, homeSide, homeLineup } = await loadGame(fixtureId);

    const participant = await prisma.v1GameParticipant.create({
      data: {
        gameId: game.id,
        sideId: homeSide.id,
        lineupId: homeLineup.id,
        userId: ids.suspended,
        displayNameSnapshot: '퇴장 선수',
        started: true,
      },
    });
    // DB 불변식 트리거가 "result participants require a draft revision" 으로 막으므로
    // DRAFT 로 만들고 참가자를 넣은 뒤 제출로 올린다 — 프로덕션도 같은 순서다.
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'DRAFT',
        score: { home: 0, away: 1 },
        eventsHash: `tournament-suspension-${fixtureId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'TOURNAMENT_SUSPENSION_TEST_SEED',
      },
    });
    await prisma.v1GameResultParticipant.create({
      data: {
        resultRevisionId: revision.id,
        participantId: participant.id,
        sideId: homeSide.id,
        started: true,
        cards: { yellow: 0, red: 1 },
      },
    });
    await prisma.v1GameResultRevision.update({
      where: { id: revision.id },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  /** 다음 경기의 홈 라인업 초안에 정지 대상 선수를 넣어 둔다. */
  async function seedDraftRoster(fixtureId: string) {
    const { game, homeSide, homeLineup } = await loadGame(fixtureId);
    await prisma.v1GameParticipant.createMany({
      data: [
        { gameId: game.id, sideId: homeSide.id, lineupId: homeLineup.id, userId: ids.hostOwner, displayNameSnapshot: '팀장', jerseyNumber: 1, started: true },
        { gameId: game.id, sideId: homeSide.id, lineupId: homeLineup.id, userId: ids.clean, displayNameSnapshot: '멀쩡한 선수', jerseyNumber: 2, started: true },
        { gameId: game.id, sideId: homeSide.id, lineupId: homeLineup.id, userId: ids.suspended, displayNameSnapshot: '퇴장 선수', jerseyNumber: 3, started: true },
      ],
    });
  }

  async function loadGame(fixtureId: string) {
    const game = await prisma.v1Game.findFirstOrThrow({
      where: { teamMatchId: fixtureId },
      select: {
        id: true,
        sides: { select: { id: true, sideKey: true } },
        lineups: { select: { id: true, sideId: true, revision: true } },
      },
    });
    const homeSide = game.sides.find((side) => side.sideKey === V1GameSideKey.HOME)!;
    const homeLineup = game.lineups.find((lineup) => lineup.sideId === homeSide.id)!;
    return { game, homeSide, homeLineup };
  }

  async function submitHomeLineup(fixtureId: string, commandId: string) {
    const { game, homeLineup } = await loadGame(fixtureId);
    return games.submitLineup(authUser(ids.hostOwner), game.id, homeLineup.id, commandId, {
      expectedVersion: homeLineup.revision,
      clientCommandId: commandId,
    });
  }

  it('규정을 켠 대회: 앞 경기 레드카드 선수가 낀 명단은 400 DISCIPLINE_SUSPENDED 로 막힌다', async () => {
    const rejected = await captureFailure(() =>
      submitHomeLineup(ids.strictNextFixture, 'tournament-suspension-strict-submit'),
    );
    expectHttpCode(rejected, 400, 'DISCIPLINE_SUSPENDED');
    // 누구 때문인지 화면이 말해 줘야 한다 — 이름 없이 막으면 팀장은 고칠 수가 없다.
    expect((rejected as HttpException).getResponse()).toEqual(
      expect.objectContaining({ details: { blocked: [expect.objectContaining({ name: '퇴장 선수' })] } }),
    );

    // 막힌 제출이 상태를 바꾸면 안 된다 — 초안 그대로여야 다시 고쳐 낼 수 있다.
    const { homeLineup } = await loadGame(ids.strictNextFixture);
    expect(homeLineup).toBeDefined();
    const row = await prisma.v1GameLineup.findUniqueOrThrow({ where: { id: homeLineup.id } });
    expect(row.state).toBe('DRAFT');
  });

  it('규정을 끈 대회: 똑같은 상황에서 그대로 제출된다 (옵트인)', async () => {
    const submitted = await submitHomeLineup(ids.openNextFixture, 'tournament-suspension-open-submit');
    // `state` 는 **게임 상태**(SCHEDULED)다 — 명단 상태는 `lineupState` 다. 둘을 헷갈리면
    // 라인업이 제출되지 않았는데도 통과하는 단언이 된다.
    expect(submitted).toEqual(
      expect.objectContaining({ lineupState: 'SUBMITTED', lineupRevision: 1, replayed: false }),
    );
  });
});
