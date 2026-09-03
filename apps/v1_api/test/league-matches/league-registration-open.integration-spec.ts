import { AdminContextService } from '../../src/common/admin-context.service';
import type { GamesService } from '../../src/games/games.service';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminRegistrationsService } from '../../src/tournaments/admin-registrations.service';
import { TournamentRegistrationsService } from '../../src/tournaments/tournament-registrations.service';

/**
 * **리그 참가 신청 — 대회 스택 재사용 (real DB, Task 164 BE-3).**
 *
 * 유닛으로는 증명할 수 없는 것만 본다:
 *
 * 1. **거울에 `status='open'` 이 실제로 서고, 등록 스택이 그 행을 본다** — 유닛의 fake 는
 *    `kind` 필터를 코드가 아니라 fake 가 흉내 내므로, 표면 확대가 진짜인지는 DB 만 안다.
 * 2. **정원 8 이 리그에서 실제로 안 걸린다** — 거울의 `teamCount` 는 스키마 기본값이라
 *    fake 를 어떻게 채우느냐에 따라 유닛은 어느 쪽으로도 green 이 된다. 9팀째를 실제로
 *    넣어 봐야 안다.
 * 3. **FK 순서** — 등록의 `tournamentId` 는 `v1_tournaments` 를 가리킨다. 거울보다 먼저
 *    등록을 만들면 실제 DB 만 막는다(fake 는 통과시킨다).
 */
const ids = {
  adminUserId: 'a4000000-0000-4000-8000-000000000001',
  adminId: 'a4000000-0000-4000-8000-000000000002',
  sportId: 'a4000000-0000-4000-8000-000000000010',
  regionId: 'a4000000-0000-4000-8000-000000000020',
} as const;
const teamId = (n: number) => `a4000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const ownerId = (n: number) => `a4000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;

/** 거울 `teamCount` 기본값(8)을 넘겨야 정원이 꺼진 것이 보인다. */
const TEAM_COUNT = 10;

const prisma = new PrismaService();
const auth = { id: ids.adminUserId } as never;

function makeAdminService() {
  return new LeagueMatchAdminService(
    prisma,
    new AdminContextService(prisma),
    {} as GamesService,
    { emitToManyDeferred: jest.fn() } as unknown as NotificationsService,
  );
}

describe('리그 참가 신청 — 대회 스택 재사용', () => {
  let leagueId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: 'league-registration-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.adminId, userId: ids.adminUserId, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Region.create({
      data: { id: ids.regionId, code: 'league-reg-region', name: '검증 지역', level: 2, isActive: true },
    });
    // `V1Sport.code` 는 @unique 다 — 시드가 쓰는 'futsal' 을 그대로 쓰면 시드가 돈 DB 에서 깨진다.
    await prisma.v1Sport.create({
      data: { id: ids.sportId, code: 'futsal-task164-be3', name: '풋살', sortOrder: 1 },
    });
    for (let n = 1; n <= TEAM_COUNT; n += 1) {
      await prisma.v1User.create({
        data: {
          id: ownerId(n),
          email: `league-reg-owner-${n}@example.test`,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
      await prisma.v1Team.create({
        data: {
          id: teamId(n),
          name: `검증 팀 ${n}`,
          sportId: ids.sportId,
          regionId: ids.regionId,
          status: 'active',
          ownerUserId: ownerId(n),
        },
      });
      // `createLeagueRosterRegistration` 이 owner 멤버십에서 appliedByUserId 를 찾는다.
      await prisma.v1TeamMembership.create({
        data: { teamId: teamId(n), userId: ownerId(n), role: 'owner', status: 'active' },
      });
    }

    // 리그는 반드시 서비스로 만든다 — 직접 create 하면 거울 dual-write 를 안 지나
    // 통과하지만 아무것도 증명하지 않는다.
    const created = await makeAdminService().create(auth, {
      title: '참가 신청 검증 리그',
      sportId: ids.sportId,
      regionId: ids.regionId,
      startsOn: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      endsOn: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      teamIds: [teamId(1), teamId(2)],
    } as never);
    leagueId = created.leagueId;
  });

  afterAll(async () => {
    await prisma.v1TournamentRegistration.deleteMany({ where: { tournamentId: leagueId } });
    await prisma.v1Tournament.deleteMany({ where: { id: leagueId } });
    await prisma.v1TeamMembership.deleteMany({ where: { userId: { startsWith: 'a4000000' } } });
    await prisma.v1Team.deleteMany({ where: { sportId: ids.sportId } });
    await prisma.v1Sport.deleteMany({ where: { id: ids.sportId } });
    await prisma.v1Region.deleteMany({ where: { id: ids.regionId } });
    // 감사로그가 admin 행을 참조한다(`v1_admin_action_logs_admin_user_id_fkey`) — 먼저 지운다.
    await prisma.v1AdminActionLog.deleteMany({ where: { adminUserId: ids.adminId } });
    await prisma.v1AdminUser.deleteMany({ where: { id: ids.adminId } });
    await prisma.v1User.deleteMany({ where: { id: { startsWith: 'a4000000' } } });
    await prisma.$disconnect();
  });

  it('리그를 만들면 로스터 팀마다 confirmed 등록이 함께 생긴다 — FK 순서가 실제로 성립한다', async () => {
    const rows = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: leagueId },
      select: { teamId: true, status: true, entrySource: true, appliedByUserId: true },
      orderBy: { teamId: 'asc' },
    });
    expect(rows).toEqual([
      { teamId: teamId(1), status: 'confirmed', entrySource: 'seeded', appliedByUserId: ownerId(1) },
      { teamId: teamId(2), status: 'confirmed', entrySource: 'seeded', appliedByUserId: ownerId(2) },
    ]);
  });

  it('openRegistration 이 거울에 open + 마감을 놓고, 리그 축 state 는 draft 로 남는다', async () => {
    const deadline = new Date(Date.now() + 7 * 86_400_000);
    await makeAdminService().openRegistration(auth, leagueId, {
      registrationDeadlineAt: deadline.toISOString(),
    });

    const mirror = await prisma.v1Tournament.findUnique({
      where: { id: leagueId },
      select: { status: true, registrationDeadlineAt: true, kind: true, teamCount: true },
    });
    expect(mirror).toMatchObject({ status: 'open', kind: 'regular_league' });
    expect(mirror?.registrationDeadlineAt?.toISOString()).toBe(deadline.toISOString());
    // 거울의 teamCount 는 아무도 정한 적 없는 기본값이다 — 다음 케이스가 이걸 정원으로
    // 쓰지 않는다는 것을 증명한다.
    expect(mirror?.teamCount).toBe(8);

    // BE-5 drop: 리그 축이 따로 없다. "신청 접수는 시작이 아니다" 는 이제 거울의 status 가
    // `open` 이고 `in_progress` 가 아니라는 것으로 나타난다(위 단언). 응답의 `state` 는
    // `LEAGUE_STATE_BY_STATUS[open] = draft` 로 파생된다.
  });

  it('지난 마감으로는 열 수 없다 — 열자마자 닫힌 리그를 만들지 않는다', async () => {
    await expect(
      makeAdminService().openRegistration(auth, leagueId, {
        registrationDeadlineAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'LEAGUE_REGISTRATION_DEADLINE_PAST' } });
  });

  it('거울 teamCount(8)를 넘겨도 신청·확정이 통과한다 — 리그엔 정원이 없다', async () => {
    const registrations = new TournamentRegistrationsService(
      prisma,
      { emitNotification: jest.fn() } as never,
      { resolveDecisions: jest.fn().mockResolvedValue({ acceptedCodes: new Set() }) } as never,
    );
    const adminRegistrations = new AdminRegistrationsService(
      prisma,
      new AdminContextService(prisma),
      { emitNotification: jest.fn() } as never,
    );

    // 이미 2팀이 confirmed 다. 8번째·9번째·10번째를 신청 → 확정까지 태운다.
    for (let n = 3; n <= TEAM_COUNT; n += 1) {
      const created = await registrations.create({ id: ownerId(n) } as never, leagueId, {
        teamId: teamId(n),
      } as never);
      const registrationId = (created as { id: string }).id;
      await prisma.v1TournamentRegistration.update({
        where: { id: registrationId },
        data: { status: 'paid' },
      });
      await adminRegistrations.confirm(auth, registrationId, { decision: 'confirm' } as never);
    }

    const confirmed = await prisma.v1TournamentRegistration.count({
      where: { tournamentId: leagueId, status: 'confirmed' },
    });
    // 정원이 살아 있으면 9번째에서 409 로 멈춰 8 이 나온다.
    expect(confirmed).toBe(TEAM_COUNT);

    // 확정이 리그 축 로스터도 만들었는지 — 등록만 confirmed 이고 로스터가 비면
    // 순위·대진이 그 팀을 못 본다.
    const roster = await prisma.v1TournamentRegistration.count({
      where: { tournamentId: leagueId, status: 'confirmed' },
    });
    expect(roster).toBe(TEAM_COUNT);
  });

  it('먼저 신청한 팀을 운영자가 addTeam 해도 500 이 아니라 등록 1건이 confirmed 로 남는다', async () => {
    // `(tournamentId, teamId)` 는 @@unique 다. 무조건 create 하면 **P2002 -> 500** 이다.
    // 운영자가 "신청은 들어왔는데 확정 절차 대신 그냥 넣자" 로 addTeam 하는 것은 정상 운영이다.
    const registrations = new TournamentRegistrationsService(
      prisma,
      { emitNotification: jest.fn() } as never,
      { resolveDecisions: jest.fn().mockResolvedValue({ acceptedCodes: new Set() }) } as never,
    );
    const n = TEAM_COUNT; // 이미 확정된 팀들과 겹치지 않게 새 팀을 하나 더 만든다
    const extraTeam = `a4000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;
    const extraOwner = `a4000000-0000-4000-8000-0000000004${String(n).padStart(2, '0')}`;
    await prisma.v1User.create({
      data: {
        id: extraOwner,
        email: `league-reg-extra-${n}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Team.create({
      data: {
        id: extraTeam,
        name: `검증 팀 추가${n}`,
        sportId: ids.sportId,
        regionId: ids.regionId,
        status: 'active',
        ownerUserId: extraOwner,
      },
    });
    await prisma.v1TeamMembership.create({
      data: { teamId: extraTeam, userId: extraOwner, role: 'owner', status: 'active' },
    });

    // 1) 팀이 먼저 신청한다 → draft 등록 row 가 생긴다.
    await registrations.create({ id: extraOwner } as never, leagueId, { teamId: extraTeam } as never);
    const before = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: leagueId, teamId: extraTeam },
      select: { status: true },
    });
    expect(before).toEqual([{ status: 'draft' }]);

    // 2) 운영자가 addTeam 한다 → 예전엔 여기서 P2002.
    await makeAdminService().addTeam(auth, leagueId, { teamId: extraTeam } as never);

    const after = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: leagueId, teamId: extraTeam },
      select: { status: true, entrySource: true },
    });
    // 새로 만들지 않고 **기존 행을 confirmed 로 올린다** — 두 행이 되면 unique 가 막는다.
    // `entrySource` 는 **`applied` 그대로 둔다.** 팀이 스스로 신청한 사실이 더 정확하고,
    // 나중에 운영자가 눌렀다고 `seeded` 로 덮으면 감사에서 사실이 뒤집힌다.
    expect(after).toEqual([{ status: 'confirmed', entrySource: 'applied' }]);
    // BE-5 drop: 로스터 = confirmed 등록 하나뿐이다(위 `after` 가 곧 로스터다).
  });

  it('제외한 팀을 다시 넣으면 취소된 등록이 confirmed 로 되살아난다 — 행은 하나뿐이고 이력은 남는다', async () => {
    // BE-5 drop 이 `removeTeam` 을 "로스터 행 삭제" 에서 "등록을 cancelled 로" 로 바꿨다.
    // `(tournamentId, teamId)` 가 unique 라, 재추가 경로가 `create` 였다면 여기서 P2002 다.
    const admin = makeAdminService();
    const [seedTeam] = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: leagueId, status: 'confirmed' },
      orderBy: { createdAt: 'asc' },
      select: { teamId: true, appliedByUserId: true, createdAt: true },
      take: 1,
    });

    await admin.removeTeam(auth, leagueId, seedTeam.teamId);
    const afterRemove = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: leagueId, teamId: seedTeam.teamId },
      select: { status: true },
    });
    expect(afterRemove).toEqual([{ status: 'cancelled' }]);

    await admin.addTeam(auth, leagueId, { teamId: seedTeam.teamId } as never);

    const afterReadd = await prisma.v1TournamentRegistration.findMany({
      where: { tournamentId: leagueId, teamId: seedTeam.teamId },
      select: { status: true, appliedByUserId: true, createdAt: true },
    });
    // 행은 **하나**다 — 두 행이 되면 unique 가 막는다.
    expect(afterReadd).toHaveLength(1);
    expect(afterReadd[0].status).toBe('confirmed');
    // 신청 이력이 살아 있다 — 누가 언제 넣었는지가 재추가로 덮이지 않는다.
    expect(afterReadd[0].appliedByUserId).toBe(seedTeam.appliedByUserId);
    expect(afterReadd[0].createdAt.toISOString()).toBe(seedTeam.createdAt.toISOString());
  });

  it('소프트 삭제된 거울은 열리지 않는다 — 200 을 주고 신청은 404 인 상태를 만들지 않는다', async () => {
    // 오늘 `V1Tournament.deletedAt` 을 non-null 로 쓰는 코드 경로는 **0건**이다(전수 확인).
    // 그래서 이 상황은 프로덕션 흐름으로는 아직 만들 수 없고, 여기서 직접 만든다 —
    // 가드의 계약을 고정하는 것이지 오늘의 버그를 재현하는 것이 아니다.
    //
    // 이 자리에 가드가 없으면 `updateMany` 가 1행을 맞춰 **200 이 나가는데**, 등록 스택은
    // 전부 `deletedAt: null` 로 조회하므로 **신청은 계속 404** 다. 운영자에게는
    // "열었는데 안 열림" 이고, 화면 어디에도 이유가 안 나온다.
    await prisma.v1Tournament.update({
      where: { id: leagueId },
      data: { deletedAt: new Date() },
    });
    try {
      await expect(
        makeAdminService().openRegistration(auth, leagueId, {
          registrationDeadlineAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        }),
      ).rejects.toMatchObject({ response: { code: 'LEAGUE_MIRROR_MISSING' } });
    } finally {
      await prisma.v1Tournament.update({ where: { id: leagueId }, data: { deletedAt: null } });
    }
  });
});
