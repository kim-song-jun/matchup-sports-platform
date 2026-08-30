import { PrismaService } from '../../src/prisma/prisma.service';
import {
  LeagueBackfillBlockedError,
  backfillLeaguesAsCompetitions,
} from '../../src/tournaments/migration/league-competition-backfill';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';

/**
 * **리그 시즌 → 통합 축 백필 (R3).**
 *
 * 이 테스트가 잡는 것은 셋이다:
 * 1. **미지원 종목이 하나라도 있으면 아무것도 만들지 않는다.** 러닝 리그 하나 때문에
 *    `assertAllSourcesHaveSupportedSport` 가 `v1_tournaments` **전 행**을 스캔하다 걸려
 *    설정 백필 도구 전체가 죽는다 — "그 리그만 빼면 되는" 문제가 아니라서, 부분 생성도
 *    허용하지 않는다.
 * 2. **재실행해도 늘지 않는다.** 백필은 배포마다 돌 수 있다.
 * 3. **백필한 뒤에도 대회 표면에 안 보인다.** 이게 진짜 증명이다 — #856 의 누출 테스트는
 *    손으로 심은 행으로 확인했지만, 여기서는 **백필이 실제로 만든 행**으로 확인한다.
 *    게이트가 두 겹인 것(`kind` 필터 + `status='draft'` 가 공개 필터에서 빠지는 것)도
 *    함께 걸린다.
 */
const ids = {
  adminUserId: '9b000000-0000-4000-8000-000000000001',
  adminId: '9b000000-0000-4000-8000-000000000002',
  futsalSportId: '9b000000-0000-4000-8000-000000000010',
  runningSportId: '9b000000-0000-4000-8000-000000000011',
  regionId: '9b000000-0000-4000-8000-000000000020',
  futsalLeagueA: '9b000000-0000-4000-8000-000000000030',
  futsalLeagueB: '9b000000-0000-4000-8000-000000000031',
  runningLeague: '9b000000-0000-4000-8000-000000000032',
} as const;

const prisma = new PrismaService();

async function createLeague(id: string, sportId: string, title: string) {
  await prisma.v1League.create({
    data: {
      id,
      title,
      sportId,
      regionId: ids.regionId,
      createdByAdminUserId: ids.adminId,
      startsOn: new Date('2026-09-01T00:00:00Z'),
      endsOn: new Date('2026-10-01T00:00:00Z'),
      tieBreakJson: [],
    },
  });
}

describe('리그 시즌 백필 (real DB)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: 'league-backfill-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.adminId, userId: ids.adminUserId, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Region.create({
      data: { id: ids.regionId, code: 'league-backfill-region', name: '백필 지역', level: 1 },
    });
    await prisma.v1Sport.create({ data: { id: ids.futsalSportId, code: 'futsal', name: '풋살', sortOrder: 1 } });
    await prisma.v1Sport.create({ data: { id: ids.runningSportId, code: 'running', name: '러닝', sortOrder: 2 } });

    await createLeague(ids.futsalLeagueA, ids.futsalSportId, '백필 대상 풋살 리그 A');
    await createLeague(ids.futsalLeagueB, ids.futsalSportId, '백필 대상 풋살 리그 B');
  });

  // 정리하지 않는다 — 격리 환경이 파일마다 DB 를 클론해 주고 teardown 에서 DROP 한다
  // (isolated-integration-environment.cjs 의 CREATE ... TEMPLATE / DROP DATABASE).
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('미지원 종목 리그가 하나라도 있으면 아무것도 만들지 않고 멈춘다', async () => {
    await createLeague(ids.runningLeague, ids.runningSportId, '백필 대상 아님 러닝 리그');

    await expect(backfillLeaguesAsCompetitions(prisma, { dryRun: false })).rejects.toBeInstanceOf(
      LeagueBackfillBlockedError,
    );

    // **부분 생성도 없어야 한다** — 풋살 둘은 지원 종목이지만 러닝 하나 때문에 전부 막힌다.
    const created = await prisma.v1Tournament.count({ where: { kind: 'regular_league' } });
    expect(created).toBe(0);

    await prisma.v1League.delete({ where: { id: ids.runningLeague } });
  });

  it('dry-run 은 아무것도 쓰지 않고 계획만 돌려준다', async () => {
    const plan = await backfillLeaguesAsCompetitions(prisma, { dryRun: true });
    expect(plan.scanned).toBe(2);
    expect(plan.created).toBe(0);
    expect(await prisma.v1Tournament.count({ where: { kind: 'regular_league' } })).toBe(0);
  });

  it('지원 종목만 남으면 리그 수만큼 만들고, 재실행해도 늘지 않는다', async () => {
    const first = await backfillLeaguesAsCompetitions(prisma, { dryRun: false });
    expect(first.created).toBe(2);

    const rows = await prisma.v1Tournament.findMany({
      where: { kind: 'regular_league' },
      select: { id: true, status: true, competitionConfigVersionId: true },
      orderBy: { id: 'asc' },
    });
    // id 가 리그와 같아야 한다 — read-swap 때 기존 링크가 그대로 사는 근거다.
    expect(rows.map((row) => row.id)).toEqual([ids.futsalLeagueA, ids.futsalLeagueB]);
    // status 는 매핑하지 않는다(read-swap 에서 정한다). draft 는 공개 필터에서 빠진다.
    expect(rows.every((row) => row.status === 'draft')).toBe(true);
    expect(rows.every((row) => row.competitionConfigVersionId !== null)).toBe(true);

    const second = await backfillLeaguesAsCompetitions(prisma, { dryRun: false });
    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(2);
    expect(await prisma.v1Tournament.count({ where: { kind: 'regular_league' } })).toBe(2);
  });

  it('우리 것이 아닌 id 가 이미 있으면 skip 하지 않고 멈춘다', async () => {
    const strayLeagueId = '9b000000-0000-4000-8000-000000000040';
    await createLeague(strayLeagueId, ids.futsalSportId, '남의 행과 id 가 겹치는 리그');
    // 같은 id 로 **대회**(kind=regular_tournament) 가 이미 있는 상황을 만든다.
    await prisma.v1Tournament.create({
      data: { id: strayLeagueId, sportId: ids.futsalSportId, title: '남의 대회', status: 'draft' },
    });

    try {
      await expect(backfillLeaguesAsCompetitions(prisma, { dryRun: false })).rejects.toMatchObject({
        detail: { idConflicts: [{ leagueId: strayLeagueId }] },
      });
    } finally {
      // **이 케이스가 남긴 행은 이 케이스가 치운다.** 파일 전체의 뒷정리는 격리 환경이
      // 하지만(DB 를 통째로 DROP 한다), 이 리그는 **다음 케이스의 입력**이 된다 — 남겨
      // 두면 이후에 백필을 부르는 케이스를 추가하는 순간 그 케이스가 이유 없이 깨진다.
      await prisma.v1Tournament.delete({ where: { id: strayLeagueId } });
      await prisma.v1League.delete({ where: { id: strayLeagueId } });
    }
  });

  it('백필한 뒤에도 공개 대회 목록·상세에 안 보인다 (게이트 두 겹)', async () => {
    const read = new TournamentsReadService(prisma, new TournamentStaffAccessService(prisma));

    const list = await read.list({ limit: 100 } as never);
    const listedIds = (list.items as Array<{ id: string }>).map((row) => row.id);
    expect(listedIds).not.toContain(ids.futsalLeagueA);
    expect(listedIds).not.toContain(ids.futsalLeagueB);

    await expect(read.get(ids.futsalLeagueA)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TOURNAMENT_NOT_FOUND' }),
    });
  });
});
