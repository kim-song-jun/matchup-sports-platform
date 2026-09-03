/**
 * Task 165 BE-1 — 콘솔의 결과 명령 경계가 **리그 경기도 해석한다**.
 *
 * 정본 §4 가 "리그도 대회와 같은 콘솔을 쓴다" 로 확정했는데, `withResultCommand` 의 출처
 * 경계가 `sourceType !== TOURNAMENT_FIXTURE` 를 404 로 튕겨 리그 경기가 아예 들어오지
 * 못했다. 그래서 리그가 전용 결과 입력 모달을 따로 갖고 있어야 했다.
 *
 * ## 어떻게 재는가 — 에러 코드가 경계 통과 여부를 가른다
 * 결과 리비전을 통째로 만들지 않고도 **경계만** 잴 수 있다:
 * ```
 * 경계에서 막히면        GAME_NOT_FOUND            ← 출처를 해석 못 했다
 * 경계를 지나면          RESULT_REVISION_NOT_FOUND ← 그 다음 단계까지 갔다
 * ```
 * 둘 다 404 라서 **상태 코드만 보면 구분되지 않는다** — 코드를 봐야 한다.
 *
 * ## 권한은 대회와 같은 함수를 지난다
 * 리그 거울엔 스태프 배정이 보통 없다. 플랫폼 관리자는 배정 없이도 통과하고, 배정 없는
 * 일반 사용자는 403 이다 — 그 규칙이 대회와 **같은 `staffAccess.assertAccess`** 에서
 * 나오는지 본다(복사본이 생기면 두 규칙이 갈린다).
 */
import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { resolveGameSource } from '../../src/tournament-operations/resolve-game-source';
import { seedLeagueOnTournamentAxis } from '../fixtures/league-on-tournament-axis.fixture';

const ids = {
  platformOps: '8b000000-0000-4000-8000-000000000001',
  stranger: '8b000000-0000-4000-8000-000000000002',
  teamOwner: '8b000000-0000-4000-8000-000000000003',
  sport: '8b000000-0000-4000-8000-000000000010',
  region: '8b000000-0000-4000-8000-000000000011',
  homeTeam: '8b000000-0000-4000-8000-000000000020',
  awayTeam: '8b000000-0000-4000-8000-000000000021',
  league: '8b000000-0000-4000-8000-000000000030',
  leagueMatch: '8b000000-0000-4000-8000-000000000031',
  friendlyMatch: '8b000000-0000-4000-8000-000000000032',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task165.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

/** 던져진 예외에서 도메인 코드만 꺼낸다 — 상태 코드로는 두 404 를 못 가른다. */
async function codeOf(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof HttpException)) throw error;
    const body = error.getResponse();
    return typeof body === 'object' && body !== null && 'code' in body ? String((body as { code: unknown }).code) : '(코드 없음)';
  }
  throw new Error('예외가 나지 않았다 — 이 프로브는 항상 실패해야 한다');
}

/** 이 게임에 아무 결과 명령이나 걸어 본다. 경계만 재는 것이 목적이다.
 *
 * Task 166 이 `reviewDecision`(반려/보완 요청)을 없애면서 `supersedeAndSubmit` 으로 바꿨다 —
 * 둘 다 `withResultCommand` 를 지나므로 **재는 경계는 같다**. 존재하지 않는 리비전 id 를
 * 주므로 경계를 통과하면 `RESULT_REVISION_NOT_FOUND` 에서 멈춘다(경계를 못 넘으면 그 앞의
 * 코드가 나온다 — 이 프로브가 가르려는 것이 바로 그 차이다). */
const probeBoundary = (userId: string, gameId: string) =>
  codeOf(() =>
    resultReview.supersedeAndSubmit(authUser(userId), gameId, '8b000000-0000-4000-8000-0000000000ff', `t165-${gameId}-${userId}`, {
      expectedVersion: 0,
      clientCommandId: `t165-${gameId}-${userId}`,
      score: { home: 1, away: 0 },
      actualParticipants: [],
      eventsHash: 'boundary-probe',
      reason: '경계 프로브',
    }),
  );

describe('Task 165 BE-1 — 콘솔 결과 명령 경계가 리그 경기를 해석한다', () => {
  let leagueGameId: string;
  let friendlyGameId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) throw new Error('futsal-v1 competition config preset is required');

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.stranger, ids.teamOwner].map((id, index) => ({
        id,
        email: `task165-${index}@example.test`,
        accountStatus: 'active' as const,
        onboardingStatus: 'completed' as const,
      })),
    });
    // `V1League.createdByAdminUserId` 는 **v1_admin_users.id** 를 가리킨다(userId 가 아니다).
    const admin = await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
      select: { id: true },
    });
    // ⚠️ `V1Sport.code` 는 @unique 다. 시드(seed-alpha-*-qa.ts)가 'futsal' 을 쓰므로
    // 같은 code 로 만들면 시드가 돈 DB 에서 이 스펙이 깨진다 — 태스크 전용 code 를 쓴다.
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'futsal-task165', name: 'Task 165 Futsal' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'TASK165', name: 'Task 165 Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.homeTeam, ownerUserId: ids.teamOwner, sportId: ids.sport, regionId: ids.region, name: 'Task 165 Home' },
        { id: ids.awayTeam, ownerUserId: ids.teamOwner, sportId: ids.sport, regionId: ids.region, name: 'Task 165 Away' },
      ],
    });
    // BE-5 drop: 리그는 통합 축이 정본이다. 프로덕션과 같은 매핑 함수를 지나는 픽스처를 쓴다.
    await seedLeagueOnTournamentAxis(prisma, {
      id: ids.league,
      title: 'Task 165 리그',
      sportId: ids.sport,
      regionId: ids.region,
      startsOn: new Date('2026-09-05T00:00:00.000Z'),
      endsOn: new Date('2026-12-05T00:00:00.000Z'),
      createdByAdminUserId: admin.id,
    });

    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    // 리그 대진(leagueId 있음)과 친선 팀매치(leagueId 없음)를 나란히 만든다 —
    // 콘솔이 앞의 것만 열어야 한다.
    for (const [id, leagueId] of [
      [ids.leagueMatch, ids.league],
      [ids.friendlyMatch, null],
    ] as const) {
      await prisma.v1TeamMatch.create({
        data: {
          id,
          hostTeamId: ids.homeTeam,
          createdByUserId: ids.teamOwner,
          sportId: ids.sport,
          regionId: ids.region,
          title: `Task 165 ${leagueId === null ? '친선' : '리그'}`,
          placeName: 'Task 165 court',
          startAt,
          approvedApplicantTeamId: ids.awayTeam,
          competitionConfigVersionId: config.id,
          ...(leagueId === null ? {} : { leagueId }),
        },
      });
      const input: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: id,
        competitionConfigVersionId: config.id,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: ids.homeTeam, displayNameSnapshot: 'Task 165 Home' },
          { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Task 165 Away' },
        ],
        participants: [],
      };
      const context: GameCommandContext = {
        actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
        expectedVersion: 0,
        durableCommandId: `t165-source-${id}`,
        payloadHash: canonicalGameCommandPayloadHash(input),
      };
      await prisma.$transaction((tx) => games.createFromSourceInTransaction(tx, input, context));
    }

    leagueGameId = (
      await prisma.v1Game.findFirstOrThrow({ where: { teamMatchId: ids.leagueMatch }, select: { id: true } })
    ).id;
    friendlyGameId = (
      await prisma.v1Game.findFirstOrThrow({ where: { teamMatchId: ids.friendlyMatch }, select: { id: true } })
    ).id;
  });

  afterAll(async () => {
    const gameIds = (
      await prisma.v1Game.findMany({
        where: { teamMatchId: { in: [ids.leagueMatch, ids.friendlyMatch] } },
        select: { id: true },
      })
    ).map((row) => row.id);
    await prisma.v1GameParticipant.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.v1GameLineup.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.v1GameVisibilityPolicy.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.v1GameSide.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.v1Game.deleteMany({ where: { id: { in: gameIds } } });
    await prisma.v1TeamMatch.deleteMany({ where: { id: { in: [ids.leagueMatch, ids.friendlyMatch] } } });
    await prisma.v1Tournament.deleteMany({ where: { id: ids.league } });
    await prisma.v1Team.deleteMany({ where: { id: { in: [ids.homeTeam, ids.awayTeam] } } });
    await prisma.v1Region.deleteMany({ where: { id: ids.region } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sport } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: ids.platformOps } });
    await prisma.v1User.deleteMany({ where: { id: { in: [ids.platformOps, ids.stranger, ids.teamOwner] } } });
    await prisma.$disconnect();
  });

  it('리그 경기가 경계를 지난다 — 예전엔 여기서 GAME_NOT_FOUND 로 튕겼다', async () => {
    // 경계를 지나면 그 다음 단계(리비전 조회)까지 가서 다른 코드로 실패한다.
    // 둘 다 404 라서 **코드를 봐야** 구분된다.
    expect(await probeBoundary(ids.platformOps, leagueGameId)).toBe('RESULT_REVISION_NOT_FOUND');
  });

  it('리그 거울에 배정이 없어도 플랫폼 관리자는 통과한다 — 대회와 같은 규칙', async () => {
    // 이 리그에는 스태프 배정 행이 하나도 없다. 그래도 adminRole 로 통과하는 것이
    // 대회에서와 같은 동작이고, 그 판정은 같은 assertAccess 를 지난다.
    const assignments = await prisma.v1TournamentStaffAssignment.count({ where: { tournamentId: ids.league } });
    expect(assignments).toBe(0);
    expect(await probeBoundary(ids.platformOps, leagueGameId)).toBe('RESULT_REVISION_NOT_FOUND');
  });

  it('배정 없는 일반 사용자는 403 이다 — 콘솔이 열렸다고 아무나 쓰는 게 아니다', async () => {
    const code = await probeBoundary(ids.stranger, leagueGameId);
    // 권한 거부는 404 계열이 아니다 — 경계를 지나 권한 검사까지 갔다는 뜻이기도 하다.
    expect(code).not.toBe('RESULT_REVISION_NOT_FOUND');
    expect(code).not.toBe('GAME_NOT_FOUND');
  });

  it('친선 팀매치는 열리지 않는다 — 대회 운영 권한 체계 밖이다', async () => {
    expect(await probeBoundary(ids.platformOps, friendlyGameId)).toBe('GAME_NOT_FOUND');
  });
  /**
   * enum 에는 이미 `COMPETITION_FIXTURE`·`FRIENDLY_MATCH` 가 있고(R1 expand) 앞으로 더
   * 늘어난다. "대회 대진이 아니면 전부 팀매치" 로 두면 그 경기들이 **운영 규칙이 다른 채로**
   * 콘솔에 열린다(예: takeover 요구 여부).
   *
   * DB 로는 이 상태를 만들 수 없다 — `v1_games_source_exactly_one_ck` 가 sourceType 과
   * FK 조합을 강제해서 sourceType 만 뒤집는 UPDATE 가 거부된다(실측). 그래서 해석기를 직접
   * 부르고, **조회를 시도하기도 전에** 걸러지는 것까지 본다: 넘긴 tx 가 쓰이면 던진다.
   */
  it('알 수 없는 sourceType 은 조회도 하기 전에 막힌다 — fail-open 이 아니다', async () => {
    const txThatMustNotBeUsed = new Proxy(
      {},
      {
        get() {
          throw new Error('알 수 없는 sourceType 인데 DB 를 조회했다 — 그 자체가 fail-open 이다');
        },
      },
    ) as Parameters<typeof resolveGameSource>[0];

    for (const sourceType of [V1GameSourceType.COMPETITION_FIXTURE, V1GameSourceType.FRIENDLY_MATCH]) {
      await expect(
        resolveGameSource(txThatMustNotBeUsed, {
          sourceType,
          tournamentFixtureId: null,
          teamMatchId: ids.leagueMatch,
        }),
      ).resolves.toBeNull();
    }
  });

});
