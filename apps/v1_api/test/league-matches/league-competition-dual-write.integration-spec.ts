import { AdminContextService } from '../../src/common/admin-context.service';
import type { GamesService } from '../../src/games/games.service';
import { LeagueMatchAdminService } from '../../src/league-matches/league-match-admin.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * **리그 → 통합 축 dual-write (real DB).**
 *
 * 유닛으로는 증명할 수 없는 것만 여기서 본다:
 *
 * 1. **거울 "행" 이 실재하는가** — 유닛은 "호출됐다" 까지만 단언한다. 그런데 망가지는 모습은
 *    *화면에서 리그가 사라지는 것*이고, 그건 **행이 없는 것**이지 호출이 없는 게 아니다.
 * 2. **같은 트랜잭션인가** — mock 은 롤백하지 않으므로 "리그 쓰기가 롤백되면 거울도 없어야
 *    한다" 를 유닛으로 짤 수 없다. dual-write 가 *있다* 보다 *같은 트랜잭션에 있다* 가 중요하다.
 * 3. **새 FK 와 인덱스가 실재하는가** — 거울에 `regionId` 를 넣는 순간 `v1_tournaments_region_fk`
 *    가 진짜로 걸린다. 이 저장소는 mock 으로 통과한 코드가 FK·인덱스 이름 길이 때문에
 *    CI 3연속·alpha 500 으로 터진 이력이 있다.
 *
 * **리그를 `prisma.v1League.create` 로 직접 만들지 않는다** — 그러면 dual-write 를 한 번도
 * 지나가지 않고, 통과하지만 아무것도 증명하지 않는다. 반드시 서비스 메서드로 만든다.
 */
const ids = {
  adminUserId: '9c000000-0000-4000-8000-000000000001',
  adminId: '9c000000-0000-4000-8000-000000000002',
  sportId: '9c000000-0000-4000-8000-000000000010',
  regionId: '9c000000-0000-4000-8000-000000000020',
  teamA: '9c000000-0000-4000-8000-000000000030',
  teamB: '9c000000-0000-4000-8000-000000000031',
} as const;

const prisma = new PrismaService();

function makeService() {
  // 이 스펙이 부르는 경로(create)는 games·notifications 를 지나가지 않는다.
  // 형제 통합 스펙(`test/jobs/league-result-entry-reminder.integration-spec.ts:217`)의 선례와 같다.
  return new LeagueMatchAdminService(
    prisma,
    new AdminContextService(prisma),
    {} as GamesService,
    {} as NotificationsService,
  );
}

const dto = {
  title: 'dual-write 검증 리그',
  sportId: ids.sportId,
  regionId: ids.regionId,
  startsOn: '2026-09-01T00:00:00.000Z',
  endsOn: '2026-10-01T00:00:00.000Z',
  teamIds: [ids.teamA, ids.teamB],
};

describe('리그 dual-write (real DB)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();

    await prisma.v1User.create({
      data: {
        id: ids.adminUserId,
        email: 'league-dual-write-admin@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.adminId, userId: ids.adminUserId, adminRole: 'owner', status: 'active' },
    });
    // level 2 (시·군·구) 여야 한다 — create 가 그 조건으로 사전 검증한다.
    await prisma.v1Region.create({
      data: { id: ids.regionId, code: 'dual-write-region', name: '검증 지역', level: 2, isActive: true },
    });
    await prisma.v1Sport.create({
      data: { id: ids.sportId, code: 'futsal', name: '풋살', sortOrder: 1 },
    });
    for (const [id, name] of [
      [ids.teamA, '검증 팀 A'],
      [ids.teamB, '검증 팀 B'],
    ] as const) {
      await prisma.v1Team.create({
        data: {
          id,
          name,
          sportId: ids.sportId,
          regionId: ids.regionId,
          status: 'active',
          ownerUserId: ids.adminUserId,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('리그를 만들면 통합 축에 거울 행이 함께 생긴다 — 값까지 리그와 일치한다', async () => {
    const service = makeService();

    const created = await service.create({ id: ids.adminUserId } as never, dto as never);

    const mirror = await prisma.v1Tournament.findUnique({ where: { id: created.leagueId } });
    // **행이 있는가**가 이 테스트의 본론이다 — 호출 여부가 아니라.
    expect(mirror).not.toBeNull();
    expect(mirror).toMatchObject({
      id: created.leagueId,
      kind: 'regular_league',
      title: dto.title,
      sportId: ids.sportId,
      // 새 FK(`v1_tournaments_region_fk`)가 실제로 걸린다 — 여기서만 확인된다.
      regionId: ids.regionId,
      status: 'draft',
    });
    expect(mirror?.scheduledAt?.toISOString()).toBe(dto.startsOn);
    expect(mirror?.scheduledEndAt?.toISOString()).toBe(dto.endsOn);

    // 리그와 거울이 **같은 키**로 묶인다(대응표를 따로 두지 않는 설계).
    const league = await prisma.v1League.findUnique({ where: { id: created.leagueId } });
    expect(league?.regionId).toBe(mirror?.regionId);
  });

  it('리그 쓰기가 롤백되면 거울도 남지 않는다 — **서비스 경로로** 증명한다', async () => {
    // ⚠️ 이 테스트를 처음엔 `tx` 안에서 두 행을 **직접** 만들고 throw 하는 형태로 썼는데,
    // 그건 **Prisma 의 롤백 동작만 재확인**할 뿐 *서비스 코드가 dual-write 를 같은 트랜잭션
    // 경계 안에 두는지* 는 검증하지 않는다(Copilot 이 잡았다). 이 파일 맨 위 주석이
    // "직접 만들지 마라" 고 적어 놓고 정작 이 케이스에서 그걸 어겼다.
    //
    // 대신 **서비스의 트랜잭션 안에서, dual-write 직후에** 실패를 일으킨다.
    // `logAdminAction` 이 그 자리(거울 create 바로 다음, 같은 `tx`)에 있다.
    // dual-write 가 트랜잭션 밖으로 빠지면 **거울만 살아남아** 이 테스트가 red 가 된다.
    const service = makeService();
    const failing = service as unknown as {
      adminContext: { logAdminAction: (...args: unknown[]) => Promise<void> };
    };
    const original = failing.adminContext.logAdminAction.bind(failing.adminContext);
    failing.adminContext.logAdminAction = () => Promise.reject(new Error('강제 실패'));

    const before = await prisma.v1Tournament.count({ where: { kind: 'regular_league' } });
    const leaguesBefore = await prisma.v1League.count();

    try {
      await expect(
        service.create({ id: ids.adminUserId } as never, {
          ...dto,
          title: '롤백될 리그',
        } as never),
      ).rejects.toThrow('강제 실패');
    } finally {
      failing.adminContext.logAdminAction = original;
    }

    // 둘 다 없어야 한다. **거울만 남으면** dual-write 가 트랜잭션 밖에 있다는 뜻이고,
    // 리그 없는 유령 대회가 생긴다.
    expect(await prisma.v1Tournament.count({ where: { kind: 'regular_league' } })).toBe(before);
    expect(await prisma.v1League.count()).toBe(leaguesBefore);
  });

  it('완료를 되돌리면 거울 status 도 함께 되돌아간다 (dual-write)', async () => {
    const service = makeService();
    const created = await service.create({ id: ids.adminUserId } as never, {
      ...dto,
      title: '되돌리기 검증 리그',
    } as never);

    // 되돌리기의 조건부 update 는 `state: 'completed'` 인 행만 잡는다 — 그 상태를 만든다.
    // 거울도 같은 상태로 맞춰 둬야 "되돌아갔다" 가 관측된다.
    await prisma.v1League.update({
      where: { id: created.leagueId },
      data: { state: 'completed' },
    });
    await prisma.v1Tournament.update({
      where: { id: created.leagueId },
      data: { status: 'completed' },
    });

    const admin = {
      id: ids.adminId,
      userId: ids.adminUserId,
      adminRole: 'owner' as const,
      status: 'active' as const,
    };
    await prisma.$transaction(async (tx) => {
      await service.revertCompletionInTx(tx, admin, created.leagueId, '검증');
    });

    const mirror = await prisma.v1Tournament.findUnique({ where: { id: created.leagueId } });
    // 거울이 completed 로 남으면 리그는 진행 중인데 통합 축은 끝난 것으로 보인다 —
    // read-swap 뒤 그 리그가 "종료된 대회" 로 표시된다.
    expect(mirror?.status).toBe('in_progress');
  });

  // ⚠️ **이 케이스는 앞 케이스가 남긴 상태에 기댈 수 있다.**
  //
  // 이 파일에는 `beforeEach` 가 없다(`beforeAll` 뿐이라 케이스 사이에 DB 를 지우지 않는다).
  // 2026-08-31 변이 확인(create dual-write 를 트랜잭션 밖으로) 때 이 케이스가 red 가 됐는데,
  // **스스로 상황을 만들어 검출한 것이 아니라 위 롤백 케이스가 남긴 고아 거울을 본 것**이다.
  //
  // ```
  // 이 red 가 증명하는 것    "그 변이의 피해가 여기까지 번진다"
  // 증명하지 않는 것         이 케이스가 **단독으로** 무엇을 잡는가
  // ```
  //
  // **이 red 를 독립 증거로 읽지 말 것.** 진짜 계약은 바로 위 롤백 케이스이고 이건 보조
  // 지표다. 단독으로 무엇을 잡는지 알려면 **불변식 단언만 겨냥한 변이**를 따로 한 번 돌려
  // 이 케이스만 red 인지 봐야 한다.
  it('거울 수는 리그 수와 같다 — 백필 불변식이 실제 DB 에서도 성립한다', async () => {
    const leagues = await prisma.v1League.count();
    const mirrors = await prisma.v1Tournament.count({ where: { kind: 'regular_league' } });
    // 이 스펙이 만든 리그는 전부 서비스 경로를 지났으므로 1:1 이어야 한다.
    // 어긋나면 dual-write 가 빠진 쓰기 자리가 있다는 뜻이다.
    expect(mirrors).toBe(leagues);
  });
});
