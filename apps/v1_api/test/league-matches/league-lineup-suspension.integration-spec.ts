import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

/**
 * 정규 리그에도 출전정지 규정이 걸린다 — **옵트인이고, 리그 축으로 판정한다.**
 *
 * ## 왜 리그에는 안 걸렸나 (원인이 둘이다)
 *
 * 1. 가드가 대회 라우트(`GamesService.submitLineup`)에만 있었는데 **그 라우트는 리그에서
 *    409 다**(`TEAM_MATCH_GENERIC_LINEUP_FORBIDDEN`). 리그의 실제 입구는
 *    `TeamMatchLineupService.submitLineup` 이고 거기엔 정지 검사가 한 줄도 없었다.
 * 2. 그보다 근본적으로, 판정이 `V1TournamentFixture` 행에서 카드를 누적하는데 **정규
 *    리그엔 그 행이 0건**이다(리그 경기는 `V1TeamMatch`). 집계 소스 자체가 없었다.
 *
 * ## 이 스펙이 재는 것
 *
 * - 규정을 켠 리그: 앞 경기에서 레드카드를 받은 선수를 다음 경기 명단으로 제출하면 막힌다.
 * - 규정을 끈 리그: **똑같은 상황에서 그대로 통과한다**(옵트인 전제). 이 대조가 없으면
 *   "리그는 무조건 막는다" 와 구분되지 않는다.
 * - 규정 수정은 첫 경기가 시작되면 잠긴다(소급 적용 방지).
 *
 * ## 결과 리비전은 SUBMITTED 다 — 공식 확정본이 아니다
 *
 * 리그 결과는 어드민이 확인을 누를 때까지 `SUBMITTED` 로 머문다. 공식본만 세는 구현이면
 * 리그 정지는 사실상 한 번도 안 걸린다 — 그래서 픽스처를 일부러 `SUBMITTED` 로만 만든다.
 *
 * 팀 일정(`V1TeamSchedule`)은 만들지 않는다 — 참석 응답 게이트는 이 스펙이 재는 계약이
 * 아니고, 일정이 없으면 그 게이트는 애초에 건너뛴다.
 */

const ids = {
  hostOwner: '6b000000-0000-4000-8000-000000000001',
  suspended: '6b000000-0000-4000-8000-000000000002',
  clean: '6b000000-0000-4000-8000-000000000003',
  awayOwner: '6b000000-0000-4000-8000-000000000004',
  adminUser: '6b000000-0000-4000-8000-000000000005',
  admin: '6b000000-0000-4000-8000-000000000006',
  sport: '6b000000-0000-4000-8000-000000000010',
  region: '6b000000-0000-4000-8000-000000000011',
  hostTeam: '6b000000-0000-4000-8000-000000000020',
  awayTeam: '6b000000-0000-4000-8000-000000000021',
  // 규정 ON 리그
  strictLeague: '6b000000-0000-4000-8000-000000000030',
  strictPast: '6b000000-0000-4000-8000-000000000031',
  strictNext: '6b000000-0000-4000-8000-000000000032',
  // 규정 OFF 리그 (같은 상황, 같은 사람)
  openLeague: '6b000000-0000-4000-8000-000000000040',
  openPast: '6b000000-0000-4000-8000-000000000041',
  openNext: '6b000000-0000-4000-8000-000000000042',
  // 카드가 **나중 경기**에 있는 리그 — 정렬만 뒤집혀도 갈리는 자리다.
  futureCardLeague: '6b000000-0000-4000-8000-000000000050',
  futureCardEarly: '6b000000-0000-4000-8000-000000000051',
  futureCardLate: '6b000000-0000-4000-8000-000000000052',
  // 카드가 **공식 확정본**에 있는 리그 — SUBMITTED 폴백과 무관하게 걸려야 한다.
  officialLeague: '6b000000-0000-4000-8000-000000000060',
  officialPast: '6b000000-0000-4000-8000-000000000061',
  officialNext: '6b000000-0000-4000-8000-000000000062',
  // 경고 누적 — 앞 두 경기에 경고 1장씩. 한도만 다른 두 리그를 같은 데이터로 둔다.
  yellowHitLeague: '6b000000-0000-4000-8000-000000000070',
  yellowHitFirst: '6b000000-0000-4000-8000-000000000071',
  yellowHitSecond: '6b000000-0000-4000-8000-000000000072',
  yellowHitNext: '6b000000-0000-4000-8000-000000000073',
  yellowUnderLeague: '6b000000-0000-4000-8000-000000000080',
  yellowUnderFirst: '6b000000-0000-4000-8000-000000000081',
  yellowUnderSecond: '6b000000-0000-4000-8000-000000000082',
  yellowUnderNext: '6b000000-0000-4000-8000-000000000083',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const lineups = new TeamMatchLineupService(prisma, new OperationAuditWriterService());

function makeAdminService() {
  return new LeagueMatchAdminService(
    prisma,
    new AdminContextService(prisma),
    {} as GamesService,
    { emitToManyDeferred: jest.fn() } as unknown as NotificationsService,
  );
}

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

describe('정규 리그 출전정지 — 옵트인 규정이 리그 축으로 판정된다', () => {
  let configId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the league suspension spec');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 preset is required');
    configId = config.id;

    await prisma.v1User.createMany({
      data: [ids.hostOwner, ids.suspended, ids.clean, ids.awayOwner, ids.adminUser].map((id, index) => ({
        id,
        email: `league-suspension-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.admin, userId: ids.adminUser, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal', name: '리그 정지 풋살' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'LEAGUE_SUSPENSION_REGION', name: '리그 정지 지역', level: 1 },
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

    await seedLeague({
      leagueId: ids.strictLeague,
      title: '규정 켠 리그',
      // 옵트인: 레드카드 1장 = 다음 1경기 정지.
      redCardSuspensionMatches: 1,
      pastMatchId: ids.strictPast,
      nextMatchId: ids.strictNext,
    });
    await seedLeague({
      leagueId: ids.openLeague,
      title: '규정 끈 리그',
      redCardSuspensionMatches: null,
      pastMatchId: ids.openPast,
      nextMatchId: ids.openNext,
    });
    await seedLeague({
      leagueId: ids.officialLeague,
      title: '공식본 리그',
      redCardSuspensionMatches: 1,
      pastMatchId: ids.officialPast,
      nextMatchId: ids.officialNext,
      officializeCardedResult: true,
    });
    await seedLeague({
      leagueId: ids.futureCardLeague,
      title: '나중 경기에 카드가 있는 리그',
      redCardSuspensionMatches: 1,
      // **두 경기 모두 미래다.** 카드는 나중 경기에 있고, 제출하는 것은 앞선 경기다 --
      // 순서를 제대로 세면 그 카드는 "아직 치르지 않은 경기" 라 판정에 쓰이지 않는다.
      pastMatchId: ids.futureCardEarly,
      nextMatchId: ids.futureCardLate,
      bothFuture: true,
      cardOnSecondFixture: true,
    });
    await seedYellowLeague({
      leagueId: ids.yellowHitLeague,
      title: '경고 2장이면 정지인 리그',
      yellowAccumulationLimit: 2,
      pastMatchIds: [ids.yellowHitFirst, ids.yellowHitSecond],
      nextMatchId: ids.yellowHitNext,
    });
    await seedYellowLeague({
      leagueId: ids.yellowUnderLeague,
      title: '경고 3장이면 정지인 리그',
      // **데이터는 위와 똑같고 한도만 다르다** — 갈리는 것이 누적 수인지 확인한다.
      yellowAccumulationLimit: 3,
      pastMatchIds: [ids.yellowUnderFirst, ids.yellowUnderSecond],
      nextMatchId: ids.yellowUnderNext,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedLeague(input: {
    leagueId: string;
    title: string;
    redCardSuspensionMatches: number | null;
    pastMatchId: string;
    nextMatchId: string;
    /** 두 경기를 모두 미래로 둔다 — 앞선 경기를 실제로 제출할 수 있어야 할 때. */
    bothFuture?: boolean;
    /** 카드를 첫 경기가 아니라 **둘째 경기**에 심는다. */
    cardOnSecondFixture?: boolean;
    /** 카드가 실린 리비전을 공식 확정본으로 올린다(SUBMITTED 폴백과 분리해서 재려고). */
    officializeCardedResult?: boolean;
  }) {
    await prisma.v1Tournament.create({
      data: {
        id: input.leagueId,
        sportId: ids.sport,
        regionId: ids.region,
        title: input.title,
        kind: 'regular_league',
        competitionConfigVersionId: configId,
        // 거울은 `startsOn` 을 여기 담는다(leagueMirrorCreateData) — 어드민 상세가
        // 이 값이 비면 LEAGUE_MIRROR_MISSING 으로 막는다.
        scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        redCardSuspensionMatches: input.redCardSuspensionMatches,
      },
    });

    // 지난 경기는 과거, 다음 경기는 미래 — 정지 판정의 기준틀이 경기 순서이므로
    // `leagueFixtureListOrder()`(startAt → id)가 실제로 이 순서를 내야 한다.
    const pastStartAt = input.bothFuture === true
      ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const nextStartAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await prisma.v1TeamMatch.createMany({
      data: [input.pastMatchId, input.nextMatchId].map((id, index) => ({
        id,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: index === 0 ? '지난 경기' : '다음 경기',
        placeName: '풋살장',
        startAt: index === 0 ? pastStartAt : nextStartAt,
        approvedApplicantTeamId: ids.awayTeam,
        competitionConfigVersionId: configId,
        leagueId: input.leagueId,
        tournamentId: input.leagueId,
      })),
    });

    for (const teamMatchId of [input.pastMatchId, input.nextMatchId]) {
      const creation: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: teamMatchId,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: '정지 홈팀' },
          { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: '정지 원정팀' },
        ],
        participants: [],
      };
      const context: GameCommandContext = {
        actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
        expectedVersion: 0,
        durableCommandId: `league-suspension-${teamMatchId}`,
        payloadHash: canonicalGameCommandPayloadHash(creation),
      };
      await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, creation, context));
    }

    await seedRedCardResult(
      input.cardOnSecondFixture === true ? input.nextMatchId : input.pastMatchId,
      input.officializeCardedResult === true,
    );
  }

  /** 지난 경기에 "레드카드 1장" 제출본을 심는다 — **공식 확정본이 아니라 SUBMITTED 다.** */
  async function seedRedCardResult(teamMatchId: string, officialize: boolean) {
    const game = await prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId },
      select: { id: true, sides: { select: { id: true, sideKey: true } }, lineups: { select: { id: true, sideId: true } } },
    });
    const homeSide = game.sides.find((side) => side.sideKey === V1GameSideKey.HOME)!;
    const homeLineup = game.lineups.find((lineup) => lineup.sideId === homeSide.id)!;

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
    // **DRAFT 로 만들고 참가자를 넣은 뒤 제출로 올린다.** DB 불변식 트리거가
    // "result participants require a draft revision" 으로 막는다 — 프로덕션도 같은 순서다.
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'DRAFT',
        score: { home: 0, away: 1 },
        eventsHash: `league-suspension-${teamMatchId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'LEAGUE_SUSPENSION_TEST_SEED',
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
    if (officialize) {
      await prisma.v1GameResultRevision.update({
        where: { id: revision.id },
        data: { state: 'OFFICIAL', officialAt: new Date() },
      });
      await prisma.v1Game.update({
        where: { id: game.id },
        data: { currentOfficialRevisionId: revision.id },
      });
    }
  }

  /**
   * 경고 누적 리그: **앞 두 경기에 경고 1장씩** + 다음 경기 하나. 레드카드 쪽
   * `seedLeague` 와 달리 경기가 셋이어야 한다 — 누적은 **여러 경기에 걸쳐** 세는 값이라
   * 두 경기짜리 하네스로는 "한 경기 안에서 2장" 과 구분되지 않는다.
   */
  async function seedYellowLeague(input: {
    leagueId: string;
    title: string;
    yellowAccumulationLimit: number;
    pastMatchIds: readonly [string, string];
    nextMatchId: string;
  }) {
    await prisma.v1Tournament.create({
      data: {
        id: input.leagueId,
        sportId: ids.sport,
        regionId: ids.region,
        title: input.title,
        kind: 'regular_league',
        competitionConfigVersionId: configId,
        scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        yellowAccumulationLimit: input.yellowAccumulationLimit,
      },
    });

    const startAts = [
      new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    ];
    const matchIds = [...input.pastMatchIds, input.nextMatchId];
    await prisma.v1TeamMatch.createMany({
      data: matchIds.map((id, index) => ({
        id,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: index === 2 ? '다음 경기' : `지난 경기 ${index + 1}`,
        placeName: '풋살장',
        startAt: startAts[index],
        approvedApplicantTeamId: ids.awayTeam,
        competitionConfigVersionId: configId,
        leagueId: input.leagueId,
        tournamentId: input.leagueId,
      })),
    });

    for (const teamMatchId of matchIds) {
      const creation: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: teamMatchId,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: '정지 홈팀' },
          { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: '정지 원정팀' },
        ],
        participants: [],
      };
      const context: GameCommandContext = {
        actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
        expectedVersion: 0,
        durableCommandId: `league-yellow-${teamMatchId}`,
        payloadHash: canonicalGameCommandPayloadHash(creation),
      };
      await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, creation, context));
    }

    for (const teamMatchId of input.pastMatchIds) {
      await seedYellowCardResult(teamMatchId);
    }
  }

  /** 한 경기에 "경고 1장" 제출본을 심는다 — 레드는 0이라 레드 규정과 섞이지 않는다. */
  async function seedYellowCardResult(teamMatchId: string) {
    const game = await prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId },
      select: { id: true, sides: { select: { id: true, sideKey: true } }, lineups: { select: { id: true, sideId: true } } },
    });
    const homeSide = game.sides.find((side) => side.sideKey === V1GameSideKey.HOME)!;
    const homeLineup = game.lineups.find((lineup) => lineup.sideId === homeSide.id)!;

    const participant = await prisma.v1GameParticipant.create({
      data: {
        gameId: game.id,
        sideId: homeSide.id,
        lineupId: homeLineup.id,
        userId: ids.suspended,
        displayNameSnapshot: '경고 선수',
        started: true,
      },
    });
    const revision = await prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: 1,
        state: 'DRAFT',
        score: { home: 0, away: 0 },
        eventsHash: `league-yellow-${teamMatchId}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'LEAGUE_SUSPENSION_TEST_SEED',
      },
    });
    await prisma.v1GameResultParticipant.create({
      data: {
        resultRevisionId: revision.id,
        participantId: participant.id,
        sideId: homeSide.id,
        started: true,
        cards: { yellow: 1, red: 0 },
      },
    });
    await prisma.v1GameResultRevision.update({
      where: { id: revision.id },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    });
  }

  async function saveNextLineup(teamMatchId: string, idempotencyKey: string) {
    const view = await lineups.getLineup(authUser(ids.hostOwner), teamMatchId);
    return lineups.saveLineup(authUser(ids.hostOwner), teamMatchId, idempotencyKey, {
      expectedVersion: view.version,
      starters: [
        { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
        { userId: ids.clean, jerseyNumber: 2 },
        { userId: ids.suspended, jerseyNumber: 3 },
      ],
      bench: [],
    });
  }

  it('규정을 켠 리그: 앞 경기 레드카드 선수를 다음 경기 명단으로 제출하면 400 DISCIPLINE_SUSPENDED 로 막힌다', async () => {
    const saved = await saveNextLineup(ids.strictNext, 'league-suspension-strict-save');

    const rejected = await captureFailure(() =>
      lineups.submitLineup(authUser(ids.hostOwner), ids.strictNext, 'league-suspension-strict-submit', {
        expectedVersion: saved.revision,
      }),
    );
    expectHttpCode(rejected, 400, 'DISCIPLINE_SUSPENDED');
    // 누구 때문인지 화면이 말해 줘야 한다 — 이름 없이 막으면 팀장은 고칠 수가 없다.
    expect((rejected as HttpException).getResponse()).toEqual(
      expect.objectContaining({ details: { blocked: [expect.objectContaining({ name: expect.any(String) })] } }),
    );

    // 막힌 제출이 상태를 바꾸면 안 된다 — 초안 그대로여야 다시 고쳐 낼 수 있다.
    const after = await lineups.getLineup(authUser(ids.hostOwner), ids.strictNext);
    expect(after.state).toBe('DRAFT');
  });

  it('규정을 끈 리그: 똑같은 상황에서 그대로 제출된다 (옵트인)', async () => {
    const saved = await saveNextLineup(ids.openNext, 'league-suspension-open-save');

    const submitted = await lineups.submitLineup(
      authUser(ids.hostOwner),
      ids.openNext,
      'league-suspension-open-submit',
      { expectedVersion: saved.revision },
    );
    expect(submitted.state).toBe('SUBMITTED');
  });

  /**
   * **아직 치르지 않은 경기의 카드는 세지 않는다.**
   *
   * 결과 정정 때문에 나중 경기의 카드가 먼저 들어오는 경우가 실제로 있다. 정지 판정의
   * 기준틀은 "몇 번째 경기인가" 이므로, 리그 축 정렬(`leagueFixtureListOrder()` --
   * `startAt` → `id`)이 흐트러지면 미래의 카드가 과거로 둔갑해 **아무 잘못 없는 선수가
   * 막힌다.**
   *
   * 이 케이스가 따로 있는 이유: 다른 케이스들은 "가드가 안 돌았다"·"폴백이 없다"·"정렬이
   * 뒤집혔다" 가 **전부 같은 테스트 하나**만 red 로 만들어 원인을 못 가른다. 여기는
   * **정렬이 뒤집힐 때만** red 가 되므로 신호가 갈린다.
   */
  it('나중 경기의 카드는 앞선 경기 제출을 막지 않는다 (리그 축 정렬)', async () => {
    const view = await lineups.getLineup(authUser(ids.hostOwner), ids.futureCardEarly);
    const saved = await lineups.saveLineup(authUser(ids.hostOwner), ids.futureCardEarly, 'league-suspension-order-save', {
      expectedVersion: view.version,
      starters: [
        { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
        { userId: ids.clean, jerseyNumber: 2 },
        { userId: ids.suspended, jerseyNumber: 3 },
      ],
      bench: [],
    });

    const submitted = await lineups.submitLineup(
      authUser(ids.hostOwner),
      ids.futureCardEarly,
      'league-suspension-order-submit',
      { expectedVersion: saved.revision },
    );
    expect(submitted.state).toBe('SUBMITTED');
  });

  /**
   * 카드가 **공식 확정본**에 있어도 걸린다.
   *
   * 이 케이스는 `SUBMITTED` 폴백과 **독립적**이다 — 폴백을 지워도 공식본은 그대로 세므로
   * 여기는 green 으로 남는다. 그래서 "가드가 안 돌았다"(둘 다 red)와 "폴백이 없다"(제출본
   * 케이스만 red)를 가르는 두 번째 신호가 된다.
   */
  it('공식 확정본의 카드도 다음 경기 제출을 막는다', async () => {
    const view = await lineups.getLineup(authUser(ids.hostOwner), ids.officialNext);
    const saved = await lineups.saveLineup(authUser(ids.hostOwner), ids.officialNext, 'league-suspension-official-save', {
      expectedVersion: view.version,
      starters: [
        { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
        { userId: ids.clean, jerseyNumber: 2 },
        { userId: ids.suspended, jerseyNumber: 3 },
      ],
      bench: [],
    });

    const rejected = await captureFailure(() =>
      lineups.submitLineup(authUser(ids.hostOwner), ids.officialNext, 'league-suspension-official-submit', {
        expectedVersion: saved.revision,
      }),
    );
    expectHttpCode(rejected, 400, 'DISCIPLINE_SUSPENDED');
  });

  /**
   * **경고 누적은 여러 경기에 걸쳐 세는 값이다.** 레드카드는 한 경기의 한 장으로 끝나지만
   * 이쪽은 앞선 경기들을 합산해야 하고, 그 합산이 **DB 를 거쳐** 맞는지는 여기서만 잰다
   * (순수 함수 스펙은 자기가 만든 배열을 셀 뿐이다).
   *
   * 아래 두 케이스는 **데이터가 완전히 같고 한도만 다르다** — 그래야 갈리는 것이 누적
   * 수라는 게 증명된다. 하나만 두면 "경고가 하나라도 있으면 막는다" 와 구분되지 않는다.
   */
  it('한도 2인 리그: 앞 두 경기 경고 1장씩이면 다음 경기 제출이 막힌다', async () => {
    const saved = await saveNextLineup(ids.yellowHitNext, 'league-yellow-hit-save');

    const rejected = await captureFailure(() =>
      lineups.submitLineup(authUser(ids.hostOwner), ids.yellowHitNext, 'league-yellow-hit-submit', {
        expectedVersion: saved.revision,
      }),
    );
    expectHttpCode(rejected, 400, 'DISCIPLINE_SUSPENDED');
    expect((rejected as HttpException).getResponse()).toEqual(
      expect.objectContaining({ details: { blocked: [expect.objectContaining({ name: expect.any(String) })] } }),
    );

    const after = await lineups.getLineup(authUser(ids.hostOwner), ids.yellowHitNext);
    expect(after.state).toBe('DRAFT');
  });

  it('한도 3인 리그: 같은 경고 2장으로는 막히지 않는다', async () => {
    const saved = await saveNextLineup(ids.yellowUnderNext, 'league-yellow-under-save');

    const submitted = await lineups.submitLineup(
      authUser(ids.hostOwner),
      ids.yellowUnderNext,
      'league-yellow-under-submit',
      { expectedVersion: saved.revision },
    );
    expect(submitted.state).toBe('SUBMITTED');
  });

  it('규정 수정은 첫 경기가 시작되면 잠긴다 — 시작 전에는 저장되고 상세에 그대로 보인다', async () => {
    const admin = makeAdminService();

    // 아직 아무 경기도 시작하지 않았다(생성 직후 게임은 SCHEDULED).
    const updated = await admin.updateDiscipline(authUser(ids.adminUser), ids.openLeague, {
      yellowAccumulationLimit: 3,
    });
    expect(updated.yellowAccumulationLimit).toBe(3);
    // 한쪽만 보냈으므로 다른 쪽은 건드리지 않는다.
    expect(updated.redCardSuspensionMatches).toBeNull();

    const detail = await admin.detail(authUser(ids.adminUser), ids.openLeague);
    expect(detail.yellowAccumulationLimit).toBe(3);

    // **끄는 동작을 잰다.** `null` 이 "이 리그에는 규정을 적용하지 않는다" 의 시그널인데,
    // 응답이 `??` 로 폴백하면 **끄려고 null 을 보내도 기존 값이 돌아온다** — 화면이 응답을
    // 정본으로 쓰면 껐는데 안 꺼진 것으로 보인다. 응답과 저장본 둘 다 확인한다.
    const cleared = await admin.updateDiscipline(authUser(ids.adminUser), ids.openLeague, {
      yellowAccumulationLimit: null,
    });
    expect(cleared.yellowAccumulationLimit).toBeNull();
    expect((await admin.detail(authUser(ids.adminUser), ids.openLeague)).yellowAccumulationLimit).toBeNull();

    // 다시 켜 둔다 — 아래 잠금 단언이 "값이 남아 있다" 를 재기 때문이다.
    await admin.updateDiscipline(authUser(ids.adminUser), ids.openLeague, { yellowAccumulationLimit: 3 });

    // 경기 하나가 끝난 상태로 만들면 잠긴다 — 규정은 이미 치른 경기의 카드까지 소급해서
    // 세기 때문에, 진행 중에 바꾸면 어제까지 뛴 선수가 오늘 갑자기 정지된다.
    await prisma.v1Game.update({ where: { teamMatchId: ids.openPast }, data: { state: 'ENDED' } });

    const locked = await captureFailure(() =>
      admin.updateDiscipline(authUser(ids.adminUser), ids.openLeague, { yellowAccumulationLimit: 5 }),
    );
    expectHttpCode(locked, 409, 'LEAGUE_DISCIPLINE_LOCKED');

    // 잠금은 값을 되돌리지 않는다 — 앞서 저장한 3 이 그대로 남아야 한다.
    const stillThree = await admin.detail(authUser(ids.adminUser), ids.openLeague);
    expect(stillThree.yellowAccumulationLimit).toBe(3);
  });
});
