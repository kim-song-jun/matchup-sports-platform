import { LeagueMatchPublicService } from './league-match-public.service';

/**
 * **R4-a read-swap: `listMine` 이 통합 축에서 읽는가.**
 *
 * 전환한 뒤 기존 스펙 231개를 돌렸더니 **전부 통과했다** — 즉 리그 축과 통합 축을
 * 구분하는 테스트가 **하나도 없었다.** 되돌리는 변이가 red 를 못 내면 안 막힌 것이다.
 *
 * 여기서 고정하는 것:
 * 1. `v1Tournament` 를 읽는다(`v1League` 가 아니라) — 축 자체
 * 2. `kind` 와 **`status: 'confirmed'`** 로 좁힌다 — 확정 등록만 참가로 센다
 * 3. `_count` 도 `confirmed` 로 거른다 — 안 거르면 신청제(D7) 뒤 pending 이 섞인다
 * 4. `status → state` 역매핑 — 웹이 `LEAGUE_STATE_META[state]` 로 **인덱싱**한다
 * 5. 지역 없는 거울은 **거르지 않고 던진다** — 거르면 그 리그가 조용히 사라진다
 */
function makePrisma(mirrors: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(mirrors);
  const leagueFindMany = jest.fn().mockResolvedValue([]);
  return {
    findMany,
    leagueFindMany,
    prisma: {
      v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ teamId: 'team-1' }]) },
      v1Tournament: { findMany },
      // 리그 축을 읽으면 이 mock 이 호출된다 — 되돌리기 변이를 잡는 축이다.
      v1League: { findMany: leagueFindMany },
    } as never,
  };
}

/**
 * `standings()` 를 스텁한다. draft 가 아닌 리그는 `computable` 경로로 들어가 순위를
 * 계산하는데, 그건 **이 스펙의 검증 대상이 아니다**(대진·결과는 아직 리그 축이다).
 * 스텁하지 않으면 순위 조회 mock 이 없어 터지고, 그 실패가 축 전환 검증을 가린다.
 */
function withStubbedStandings(service: LeagueMatchPublicService): LeagueMatchPublicService {
  (service as unknown as { standings: (id: string) => Promise<unknown> }).standings = () =>
    Promise.resolve({ standings: [], pendingFixtures: [] });
  return service;
}

function mirror(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lg-1',
    title: '리그 A',
    status: 'in_progress',
    scheduledAt: new Date('2026-03-01T00:00:00.000Z'),
    scheduledEndAt: new Date('2026-06-30T00:00:00.000Z'),
    tier: null,
    seasonNo: null,
    sport: { id: 'sport-1', code: 'futsal', name: '풋살' },
    region: { id: 'region-1', name: '강남구' },
    series: null,
    registrations: [{ teamId: 'team-1', team: { name: '내 팀' } }],
    _count: { registrations: 2 },
    ...overrides,
  };
}

describe('listMine — 통합 축 읽기 (R4-a)', () => {
  it('리그 축이 아니라 통합 축을 읽는다', async () => {
    const { prisma, findMany, leagueFindMany } = makePrisma([mirror({ status: 'draft' })]);
    const service = new LeagueMatchPublicService(prisma);

    await service.listMine('user-1');

    expect(findMany).toHaveBeenCalledTimes(1);
    // 되돌리기 변이(리그 축으로) 를 잡는 단언이다.
    expect(leagueFindMany).not.toHaveBeenCalled();
  });

  it('확정 등록만 참가로 센다 — where 와 _count 양쪽에서', async () => {
    const { prisma, findMany } = makePrisma([mirror({ status: 'draft' })]);
    const service = new LeagueMatchPublicService(prisma);

    await service.listMine('user-1');

    const args = findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      kind: 'regular_league',
      deletedAt: null,
      registrations: { some: { teamId: { in: ['team-1'] }, status: 'confirmed' } },
    });
    // **`_count` 를 안 거르면** 신청제(D7) 뒤 pending 이 섞여 참가팀 수가 부풀어 오른다.
    expect(args.select._count).toEqual({
      select: { registrations: { where: { status: 'confirmed' } } },
    });
  });

  it.each([
    ['draft', 'draft'],
    ['in_progress', 'active'],
    ['completed', 'completed'],
    // 아래 셋은 오늘 리그 거울에 나올 수 없다. 그래도 매핑을 비우면 **웹이 죽는다** —
    // `LEAGUE_STATE_META[undefined]` 를 역참조하기 때문이다.
    ['open', 'draft'],
    ['closed', 'draft'],
    ['cancelled', 'completed'],
  ])('거울 status %s 를 리그 state %s 로 되돌린다', async (status, expected) => {
    const { prisma } = makePrisma([mirror({ status })]);
    const service = withStubbedStandings(new LeagueMatchPublicService(prisma));

    const result = await service.listMine('user-1');

    expect(result.items[0].state).toBe(expected);
  });

  it('지역 없는 거울은 조용히 거르지 않고 어느 리그인지 대며 실패한다', async () => {
    // 거르면 그 리그가 목록에서 사라지고 — 그게 이 작업 전체가 막으려는 실패 모습이다.
    const { prisma } = makePrisma([mirror({ id: 'lg-broken', region: null })]);
    const service = new LeagueMatchPublicService(prisma);

    await expect(service.listMine('user-1')).rejects.toThrow(/lg-broken/);
  });

  it('소속 팀이 없으면 통합 축을 조회하지도 않는다', async () => {
    const { prisma, findMany } = makePrisma([]);
    (prisma as unknown as { v1TeamMembership: { findMany: jest.Mock } }).v1TeamMembership.findMany =
      jest.fn().mockResolvedValue([]);
    const service = new LeagueMatchPublicService(prisma);

    const result = await service.listMine('user-1');

    expect(result).toEqual({ items: [] });
    expect(findMany).not.toHaveBeenCalled();
  });
});
