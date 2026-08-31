import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminService } from '../../src/admin/admin.service';
import { TournamentsReadService } from '../../src/tournaments/tournaments-read.service';
import { TournamentsAdminService } from '../../src/tournaments/tournaments-admin.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';

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
  let records: PublicTournamentRecordsService;

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
        title: '표면 테스트 R1 이전 행(kind 없음)',
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
    records = new PublicTournamentRecordsService(prisma, new TournamentStaffAccessService(prisma));
  });

  // 심은 행을 지우지 않는다 — `isolated-integration-environment` 가 **파일마다 DB 를
  // 클론해서 주고 teardown 에서 통째로 DROP** 한다(같은 파일 :38 CREATE ... TEMPLATE,
  // :89 DROP DATABASE). 직접 지우면 쿼리만 늘고, 그 정리가 실패하면 afterAll 에러가
  // 진짜 실패 원인을 가린다.
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // **id 로 찍는 단건 조회도 막아야 한다.** #856 은 목록·집계 6곳만 걸었고 `findUnique({where:{id}})`
  // 계열은 "어드민 가드 뒤라 안전"으로 넘겼는데, 그 판단이 틀렸다 — 가드는 **권한**을 막지
  // **잘못된 id** 를 막지 않는다. 백필(R3)로 리그 id 가 `v1_tournaments` 에 실재하게 되자
  // alpha 에서 `/tournaments/:리그id/schedule` 이 **리그 제목을 실은 200** 을 줬다(실측).
  it.each([
    ['getSchedule', (id: string) => records.getSchedule(id, {} as never, undefined)],
    ['getPlayerRecords', (id: string) => records.getPlayerRecords(id)],
    ['getPlayerRecordsForAdmin', (id: string) => records.getPlayerRecordsForAdmin(id)],
    ['getMatch', (id: string) => records.getMatch(id, ids.legacyNullKind, undefined)],
  ])('공개 대회 기록 %s — 리그 id 로는 열리지 않는다', async (_name, call) => {
    // 코드를 하드코딩하지 않는다 — 이 서비스는 경로마다 다른 코드를 쓴다
    // (`TOURNAMENT_MATCH_NOT_FOUND` / `TOURNAMENT_NOT_FOUND`). 중요한 것은 **404 로 막히는 것**이고,
    // 어떤 코드인지가 아니다. 코드를 추측해 박았다가 이 테스트가 3건 red 였다.
    await expect(call(ids.league)).rejects.toMatchObject({ status: 404 });
  });

  it('같은 경로가 대회 id 와 kind=null 구행에는 여전히 열린다', async () => {
    // 막는 것만 확인하면 **전부 404 로 만들어도 통과**한다. 통과해야 할 것이 통과하는지도 본다.
    await expect(records.getSchedule(ids.tournament, {} as never, undefined)).resolves.toBeDefined();
    await expect(records.getSchedule(ids.legacyNullKind, {} as never, undefined)).resolves.toBeDefined();
  });

  it('공개 대회 목록 — 리그는 빠지고, kind 가 없는 R1 이전 행은 남는다', async () => {
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
