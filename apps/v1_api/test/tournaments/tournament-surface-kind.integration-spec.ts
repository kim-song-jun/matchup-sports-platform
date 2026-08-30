import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminService } from '../../src/admin/admin.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { TournamentsAdminService } from '../../src/tournaments/tournaments-admin.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { AdminContextService } from '../../src/common/admin-context.service';

/**
 * **"대회 조회는 대회만 본다" — 누출 회귀 테스트.**
 *
 * 통합(R1) 이후 `v1_tournaments` 는 정규 리그 시즌도 담게 된다(`kind = regular_league`).
 * 이 테스트가 잡는 버그는 **리그 행이 대회 표면으로 새는 것**이다 — 백필(R3)이 실행되면
 * 공개 대회 목록에 리그가 대회 카드로 뜨고, 어드민 목록·상태 탭 카운트·대시보드 KPI 가
 * 함께 오염된다.
 *
 * **필터를 넣었는지가 아니라 안 나오는지를 본다.** 서비스를 실제로 호출해 응답을 확인하며,
 * 세 행을 한 DB 에 함께 심어 매 표면에서 세 케이스를 동시에 검사한다:
 *
 * | 행 | 기대 |
 * |---|---|
 * | `kind = regular_tournament` | 나온다 |
 * | `kind = regular_league` | **안 나온다** |
 * | `kind = null`(R1 이전 행) | **나온다** |
 *
 * 세 번째가 이 테스트의 핵심이다. `TOURNAMENT_SURFACE_KIND` 의 `OR` 을 "단순화"해
 * `{ kind: 'regular_tournament' }` 한 줄로 바꾸면 **R1 이전 대회가 사용자 화면에서
 * 통째로 사라지는데**, 그 순간 이 케이스가 red 가 된다.
 *
 * **상세·순위도 함께 건다.** 목록만 막으면 id 를 아는 사람은 그대로 열 수 있고
 * (대회 id 는 대진·순위 응답에 실려 나간다), 그 상태로도 목록 테스트만으로는 green 이 된다.
 */
const ids = {
  adminUserId: '9a000000-0000-4000-8000-000000000001',
  adminId: '9a000000-0000-4000-8000-000000000002',
  sportId: '9a000000-0000-4000-8000-000000000010',
  tournament: '9a000000-0000-4000-8000-000000000020',
  league: '9a000000-0000-4000-8000-000000000021',
  legacyNullKind: '9a000000-0000-4000-8000-000000000022',
} as const;

const prisma = new PrismaService();

describe('대회 표면은 정규 리그 시즌을 보여주지 않는다 (real DB)', () => {
  let read: TournamentsReadService;
  let admin: TournamentsAdminService;
  let adminSvc: AdminService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: 'surface-kind-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.adminId, userId: ids.adminUserId, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({
      data: { id: ids.sportId, code: 'futsal', name: '풋살', sortOrder: 1 },
    });

    // 세 행 모두 **공개 목록에 뜰 수 있는 status** 로 만든다 — status 때문에 빠지면
    // kind 필터가 동작한 것인지 알 수 없다.
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sportId, title: '표면 테스트 대회', status: 'in_progress' },
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.league,
        sportId: ids.sportId,
        title: '표면 테스트 리그 시즌',
        status: 'in_progress',
        kind: 'regular_league',
      },
    });
    // R1 이전 행 재현 — DEFAULT 가 채우지 못한 상태를 명시적으로 만든다.
    await prisma.v1Tournament.create({
      data: {
        id: ids.legacyNullKind,
        sportId: ids.sportId,
        title: '표면 테스트 구행(kind 없음)',
        status: 'in_progress',
        kind: null,
      },
    });

    read = new TournamentsReadService(prisma, new TournamentStaffAccessService(prisma));
    admin = new TournamentsAdminService(
      prisma,
      new AdminContextService(prisma),
      // list() 는 지오코딩·알림을 쓰지 않는다 — 생성자 시그니처만 채운다.
      undefined as never,
      undefined as never,
    );
    adminSvc = new AdminService(prisma);
  });

  afterAll(async () => {
    await prisma.v1Tournament.deleteMany({
      where: { id: { in: [ids.tournament, ids.league, ids.legacyNullKind] } },
    });
    await prisma.v1AdminUser.deleteMany({ where: { id: ids.adminId } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sportId } });
    await prisma.v1User.deleteMany({ where: { id: ids.adminUserId } });
    await prisma.$disconnect();
  });

  it('공개 대회 목록 — 리그는 빠지고, kind 가 없는 구행은 남는다', async () => {
    const res = await read.list({ limit: 100 } as never);
    const listedIds = (res.items as Array<{ id: string }>).map((row) => row.id);

    expect(listedIds).toContain(ids.tournament);
    expect(listedIds).toContain(ids.legacyNullKind);
    expect(listedIds).not.toContain(ids.league);
  });

  it('공개 대회 상세 — 리그 id 로는 열리지 않는다(목록만 막으면 여기가 뚫린다)', async () => {
    await expect(read.get(ids.tournament)).resolves.toEqual(expect.objectContaining({ id: ids.tournament }));
    await expect(read.get(ids.legacyNullKind)).resolves.toEqual(
      expect.objectContaining({ id: ids.legacyNullKind }),
    );
    await expect(read.get(ids.league)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TOURNAMENT_NOT_FOUND' }),
    });
  });

  it('공개 통합 순위 — 리그 id 로는 열리지 않는다', async () => {
    await expect(read.getOverallStandings(ids.league)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TOURNAMENT_NOT_FOUND' }),
    });
    // 대조군: 같은 조건의 대회는 정상 응답한다(리그만 막혔다는 뜻).
    await expect(read.getOverallStandings(ids.tournament)).resolves.toBeDefined();
  });

  it('어드민 대회 목록과 상태 탭 카운트가 같은 조건을 본다', async () => {
    const res = await admin.list({ id: ids.adminUserId } as never, { limit: 100 } as never);
    const listedIds = (res.items as Array<{ id: string }>).map((row) => row.id);

    expect(listedIds).toContain(ids.tournament);
    expect(listedIds).toContain(ids.legacyNullKind);
    expect(listedIds).not.toContain(ids.league);

    // facet 이 목록과 어긋나면 탭 숫자가 행 수보다 크게 나온다. 리그 행의 kind 를
    // 잠깐 대회로 바꿔 **정확히 1 늘어나는지**로 확인한다 — 절대값은 다른 시드에
    // 좌우되지만 증분은 이 행 하나만 반영한다.
    const before = (res.summary as { byStatus: Record<string, number> }).byStatus.in_progress ?? 0;
    await prisma.v1Tournament.update({ where: { id: ids.league }, data: { kind: 'regular_tournament' } });
    const after = await admin.list({ id: ids.adminUserId } as never, { limit: 100 } as never);
    await prisma.v1Tournament.update({ where: { id: ids.league }, data: { kind: 'regular_league' } });
    expect((after.summary as { byStatus: Record<string, number> }).byStatus.in_progress).toBe(before + 1);
  });

  it("대시보드 '진행 중 대회' KPI 가 리그를 세지 않는다", async () => {
    const withLeague = await adminSvc.hubInbox({ id: ids.adminUserId } as never);
    const before = (withLeague as { tournamentsInProgress: number }).tournamentsInProgress;

    // 리그 행을 대회로 바꾸면 카운트가 정확히 1 늘어야 한다 — 그래야 이 KPI 가
    // kind 를 실제로 보고 있다는 뜻이다(숫자가 그대로면 필터가 아니라 우연이다).
    await prisma.v1Tournament.update({ where: { id: ids.league }, data: { kind: 'regular_tournament' } });
    const after = await adminSvc.hubInbox({ id: ids.adminUserId } as never);
    await prisma.v1Tournament.update({ where: { id: ids.league }, data: { kind: 'regular_league' } });

    expect((after as { tournamentsInProgress: number }).tournamentsInProgress).toBe(before + 1);
  });
});
