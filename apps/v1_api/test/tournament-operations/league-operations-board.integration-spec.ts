import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';
import { TournamentOperationsBoardService } from '../../src/tournament-operations/board/tournament-operations-board.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import type { ListTournamentOperationsQueryDto } from '../../src/tournament-operations/board/dto/list-operations-query.dto';

/**
 * **운영 콘솔 목록이 정규 리그를 보여준다 (real DB, Task 165 BE-2).**
 *
 * 정본 §4 가 "리그도 대회와 같은 콘솔을 쓴다" 로 확정했는데, 콘솔 목록은
 * `V1TournamentFixture` 만 읽고 리그 거울에는 그 행이 **하나도 없어서** 빈 목록이 나왔다.
 *
 * 유닛으로는 증명할 수 없는 것만 본다:
 *
 * 1. **콘솔이 보는 경기 집합 == 관전자가 보는 집합.** 두 경로가 같은 술어를 쓴다는 것은
 *    행이 실제로 같은 수로 나와야 확인된다 — fake 는 어느 쪽이든 원하는 대로 준다.
 * 2. **커서로 끝까지 걸어도 중복·누락이 없다.** 같은 `startAt` 대진이 섞여 있어야 의미가
 *    있는데(`timing` 이 하루에 여러 경기를 만든다), 그 tie-break 는 DB 정렬이 정한다.
 * 3. **등록 id 가 실제로 채워진다.** 팀 id → 등록 id 조회가 진짜로 맞는지는 행이 있어야 안다.
 */
const ids = {
  sport: 'b7000000-0000-4000-8000-000000000010',
  region: 'b7000000-0000-4000-8000-000000000020',
  adminUser: 'b7000000-0000-4000-8000-000000000030',
  league: 'b7000000-0000-4000-8000-000000000040',
} as const;
const teamId = (n: number) => `b7000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const ownerId = (n: number) => `b7000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const matchId = (n: number) => `b7000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;

/** 4팀 · 6경기. 그중 둘은 **같은 `startAt`** 이라 `id` tie-break 이 없으면 순서가 흔들린다. */
const TEAMS = 4;
const FIXTURES = 6;
const BASE_AT = new Date('2026-11-02T10:00:00.000Z');

const prisma = new PrismaService();
const board = new TournamentOperationsBoardService(prisma);
// 공개 일정과 **같은 집합**인지 보려면 진짜 서비스여야 한다 — 목을 쓰면 내가 정한 수와
// 내가 정한 수를 비교하는 셈이다.
const publicRecords = new PublicTournamentRecordsService(
  prisma,
  new TournamentStaffAccessService(prisma),
);
const query = (over: Partial<ListTournamentOperationsQueryDto> = {}) =>
  over as ListTournamentOperationsQueryDto;

describe('운영 콘솔 목록 — 정규 리그', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    // `V1Sport.code` 는 @unique — 시드의 'futsal' 과 겹치면 시드가 돈 DB 에서 깨진다.
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'futsal-task165-be2', name: '풋살', sortOrder: 1 },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'task165-be2-region', name: '검증 지역', level: 2, isActive: true },
    });
    await prisma.v1User.create({
      data: {
        id: ids.adminUser,
        email: 'task165-be2-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    for (let n = 1; n <= TEAMS; n += 1) {
      await prisma.v1User.create({
        data: {
          id: ownerId(n),
          email: `task165-be2-owner-${n}@example.test`,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
      await prisma.v1Team.create({
        data: {
          id: teamId(n),
          name: `검증 팀 ${n}`,
          sportId: ids.sport,
          regionId: ids.region,
          status: 'active',
          ownerUserId: ownerId(n),
        },
      });
    }

    const admin = await prisma.v1AdminUser.create({
      data: { userId: ids.adminUser, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1League.create({
      data: {
        id: ids.league,
        title: 'BE-2 콘솔 검증 리그',
        sportId: ids.sport,
        regionId: ids.region,
        createdByAdminUserId: admin.id,
        startsOn: BASE_AT,
        endsOn: new Date(BASE_AT.getTime() + 30 * 86_400_000),
        tieBreakJson: { order: ['points'] },
        teams: { createMany: { data: [1, 2, 3, 4].map((n) => ({ teamId: teamId(n) })) } },
      },
    });
    // 거울 — 콘솔·공개 경로가 둘 다 이 행을 지난다.
    await prisma.v1Tournament.create({
      data: {
        id: ids.league,
        kind: 'regular_league',
        sportId: ids.sport,
        regionId: ids.region,
        title: 'BE-2 콘솔 검증 리그',
        status: 'in_progress',
        scheduledAt: BASE_AT,
      },
    });
    // 참가 등록 — alpha 는 백필이 이미 돌아 있다. 이 브랜치엔 그 생성 코드(#984)가 없으므로
    // 백필이 만든 것과 같은 모양으로 직접 심는다.
    for (let n = 1; n <= TEAMS; n += 1) {
      await prisma.v1TournamentRegistration.create({
        data: {
          tournamentId: ids.league,
          teamId: teamId(n),
          appliedByUserId: ownerId(n),
          status: 'confirmed',
          entrySource: 'seeded',
        },
      });
    }

    // 게임 설정 버전은 실재하는 것을 쓴다 — 없는 id 를 넣으면 FK 로 막힌다.
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (config === null) throw new Error('활성 경기 설정 버전이 필요하다');

    for (let n = 1; n <= FIXTURES; n += 1) {
      // 2·3번 경기를 같은 시각에 둔다. **동점이 페이지 경계에 걸쳐야** tie-break 이
      // 시험된다 — limit=2 면 1페이지가 [1,2] 로 끝나고 2페이지는 2번과 **같은 시각**인
      // 3번부터 시작해야 한다. 동점을 한 페이지 안에 두면 커서가 그 둘을 가를 일이 없어
      // `id` 절을 지워도 통과한다(실제로 처음 그렇게 짰다가 변이에서 green 인 걸 보고 잡았다).
      const offsetDays = n === 3 ? 2 : n;
      await prisma.v1TeamMatch.create({
        data: {
          id: matchId(n),
          title: `BE-2 리그 ${n}경기`,
          sportId: ids.sport,
          regionId: ids.region,
          leagueId: ids.league,
          createdByUserId: ids.adminUser,
          hostTeamId: teamId(((n - 1) % TEAMS) + 1),
          approvedApplicantTeamId: teamId((n % TEAMS) + 1),
          placeName: '검증 구장',
          startAt: new Date(BASE_AT.getTime() + offsetDays * 86_400_000),
          status: 'matched',
        },
      });
      // **마지막 한 경기만 게임 없이 둔다.** 공개 일정은 게임(가시성 정책)이 없는 대진을
      // `HIDDEN` 으로 접어 버리는데, 콘솔은 그것도 보여야 한다 — 운영자는 아직 공개되지
      // 않은 경기를 준비하는 사람이다. 그 차이를 아래 스펙이 명시적으로 고정한다.
      if (n === FIXTURES) continue;
      const game = await prisma.v1Game.create({
        data: {
          sourceType: 'TEAM_MATCH',
          teamMatchId: matchId(n),
          competitionConfigVersionId: config.id,
        },
      });
      await prisma.v1GameVisibilityPolicy.create({ data: { gameId: game.id, mode: 'LIVE' } });
    }
  });

  afterAll(async () => {
    const games = await prisma.v1Game.findMany({
      where: { teamMatch: { leagueId: ids.league } },
      select: { id: true },
    });
    await prisma.v1GameVisibilityPolicy.deleteMany({ where: { gameId: { in: games.map((g) => g.id) } } });
    await prisma.v1Game.deleteMany({ where: { id: { in: games.map((g) => g.id) } } });
    await prisma.v1TeamMatch.deleteMany({ where: { leagueId: ids.league } });
    await prisma.v1TournamentRegistration.deleteMany({ where: { tournamentId: ids.league } });
    await prisma.v1LeagueTeam.deleteMany({ where: { leagueId: ids.league } });
    await prisma.v1Tournament.deleteMany({ where: { id: ids.league } });
    await prisma.v1League.deleteMany({ where: { id: ids.league } });
    await prisma.v1Team.deleteMany({ where: { sportId: ids.sport } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: ids.adminUser } });
    await prisma.v1User.deleteMany({ where: { id: { startsWith: 'b7000000' } } });
    await prisma.v1Region.deleteMany({ where: { id: ids.region } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sport } });
    await prisma.$disconnect();
  });

  it('콘솔 목록이 공개 일정과 **같은 수**의 경기를 낸다', async () => {
    const board_ = await board.list(ids.league, query({ limit: 50 }));
    const schedule = await publicRecords.getSchedule(ids.league, {} as never);

    expect(board_.items).toHaveLength(FIXTURES);

    // 공개 일정은 **게임(가시성 정책)이 있는 것만** 낸다 — 게임이 없으면 정책 모드가
    // `HIDDEN` 으로 떨어져 접힌다. 콘솔은 그것까지 보여야 한다(운영자는 아직 공개되지
    // 않은 경기를 준비하는 사람이다). 그래서 개수가 정확히 하나 차이 난다.
    expect(schedule.items).toHaveLength(FIXTURES - 1);

    // **그 하나를 빼면 두 집합은 정확히 같아야 한다.** 개수만 비교하면 서로 다른 5개여도
    // 통과하므로 id 로 맞춘다. 공개 일정도 리그 대진을 `fixtureId` 로 내고 값은 팀매치 id 다.
    const publicIds = schedule.items.map((item) => item.fixtureId).sort();
    const consoleIds = board_.items
      .map((item) => item.fixtureId)
      .filter((id) => id !== matchId(FIXTURES))
      .sort();
    expect(consoleIds).toEqual(publicIds);
  });

  it('리그 항목은 대진 전용 필드가 null 이고 등록 id 는 채워진다', async () => {
    const { items } = await board.list(ids.league, query({ limit: 50 }));
    const first = items[0];
    // `V1TeamMatch` 에 없는 컬럼이다 — 안 채운 게 아니라 존재하지 않는다.
    expect(first.round).toBeNull();
    expect(first.fixtureNumber).toBeNull();
    expect(first.fieldId).toBeNull();
    // FE 가 그대로 쓰는 계약이다. 팀 id -> 등록 id 조회가 실제로 맞아야 채워진다.
    expect(first.homeRegistrationId).not.toBeNull();
    expect(first.awayRegistrationId).not.toBeNull();
    const registrationIds = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: ids.league },
      select: { id: true },
    });
    const known = new Set(registrationIds.map((row) => row.id));
    for (const item of items) {
      expect(known.has(item.homeRegistrationId!)).toBe(true);
      expect(known.has(item.awayRegistrationId!)).toBe(true);
    }
  });

  it('해제할 수 없는 경고(필드·스태프)는 리그에서 내지 않는다', async () => {
    const { items, liveWarnings } = await board.list(ids.league, query({ limit: 50 }));
    // 팀매치엔 fieldId 컬럼이 없고 스태프 스코프는 대진 id 를 가리킨다 — 둘 다 운영자가
    // 영원히 해제할 수 없으므로 켜 두면 진짜 경고를 덮는 소음이다.
    for (const item of items) {
      expect(item.warnings).not.toContain('NO_FIELD_ASSIGNED');
    }
    for (const entry of liveWarnings) {
      expect(entry.warnings).not.toContain('NO_STAFF_ASSIGNED');
    }
  });

  it('커서로 끝까지 걸어도 중복·누락이 없다 — 같은 startAt 경기가 섞여 있어도', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const result = await board.list(ids.league, query({ limit: 2, cursor }));
      seen.push(...result.items.map((item) => item.fixtureId));
      if (result.nextCursor === null) break;
      cursor = result.nextCursor;
    }
    expect(seen).toHaveLength(FIXTURES);
    expect(new Set(seen).size).toBe(FIXTURES); // 중복 0
    const all = await board.list(ids.league, query({ limit: 50 }));
    expect(seen).toEqual(all.items.map((item) => item.fixtureId)); // 순서까지 같다
  });

  it('대회 커서를 리그에 쓰면 빈 페이지다 — 존재하지 않는 커서와 구분되지 않는다', async () => {
    const foreign = Buffer.from(
      JSON.stringify({ kind: 'fixture', tournamentId: ids.league, round: 'R1', fixtureNumber: 1, id: matchId(1) }),
      'utf8',
    ).toString('base64url');
    const result = await board.list(ids.league, query({ limit: 50, cursor: foreign }));
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('필드 필터는 리그에서 빈 페이지다 — 없는 축으로 거른 결과가 "전체" 로 보이면 안 된다', async () => {
    const result = await board.list(
      ids.league,
      query({ limit: 50, fieldId: 'b7000000-0000-4000-8000-000000000099' }),
    );
    expect(result.items).toEqual([]);
  });

  it('리그 페이지도 쿼리 수가 페이지 크기와 무관하다 — 등록 조회가 N+1 이면 여기서 터진다', async () => {
    // 팀 id -> 등록 id 를 행마다 조회하면 페이지가 커질수록 쿼리가 는다. 한 번의 IN 조회여야
    // 한다. 대회 축에는 같은 취지의 스펙이 이미 있고(`tournament-operations-board`), 리그
    // 축은 조회 구성이 달라 따로 지킨다.
    const queryLog: string[] = [];
    // 대회 축 스펙(`tournament-operations-board.integration-spec.ts`)과 같은 계측 방식이다.
    const instrumented = prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query: run }) {
            queryLog.push(`${model}.${operation}`);
            return run(args);
          },
        },
      },
    });
    const probed = new TournamentOperationsBoardService(instrumented as unknown as PrismaService);

    queryLog.length = 0;
    await probed.list(ids.league, query({ limit: 2 }));
    const small = [...queryLog].sort();
    queryLog.length = 0;
    await probed.list(ids.league, query({ limit: 50 }));
    const large = [...queryLog].sort();

    // 같은 쿼리 **집합**이 같은 **횟수**로 나야 한다. 등록 조회를 행마다 하면 여기서 갈린다.
    expect(large).toEqual(small);
    // 무엇이 도는지도 못 박는다 — 개수만 같고 다른 쿼리로 바뀌어도 통과하면 의미가 없다.
    expect(large).toEqual(
      [
        'V1Tournament.findFirst',
        'V1TeamMatch.findMany',
        'V1TournamentRegistration.findMany',
        'V1GameLineup.findMany',
        'V1GameSide.findMany',
      ].sort(),
    );
  });
});
