import { LeagueSeriesAdminService } from './league-series-admin.service';

/**
 * **시리즈 최초 생성(`seedSeason`)의 dual-write.**
 *
 * `docs/ops/read-swap-preflight.md` 9절의 **필수 마감** 자리다 — 안 막히면 그 리그에
 * **거울이 아예 없고**, read-swap 뒤 **화면에서 에러 없이 사라진다.** 운영자는
 * "방금 만든 리그가 안 보인다" 밖에 말할 수 없다.
 *
 * `--apply` 승인을 요청할 때 *"거울은 보호돼 있다"* 고 사실대로 말하려면 이게 있어야 한다.
 */
const SERIES_ID = 'series-1';
const ADMIN_ID = 'admin-1';

function makeHarness() {
  const tournamentCreate = jest.fn(async (args: { data: Record<string, unknown> }) => args.data);
  let seq = 0;
  const tx = {
    v1League: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        seq += 1;
        return {
          id: `league-${seq}`,
          title: args.data.title,
          tier: args.data.tier,
          seasonNo: args.data.seasonNo,
          state: 'draft',
          sportId: args.data.sportId,
          regionId: args.data.regionId,
          startsOn: args.data.startsOn,
          endsOn: args.data.endsOn,
          seriesId: args.data.seriesId,
          sport: { code: 'futsal' },
        };
      }),
    },
    v1Tournament: { create: tournamentCreate },
    v1LeagueSeries: { update: jest.fn() },
  };
  const prisma = {
    v1LeagueSeries: {
      findUnique: jest.fn().mockResolvedValue({
        id: SERIES_ID,
        title: '테스트 시리즈',
        sportId: 'sport-futsal',
        regionId: 'region-1',
        tierCount: 2,
        promotionRuleJson: null,
        state: 'draft',
        createdAt: new Date(),
      }),
    },
    v1League: { count: jest.fn().mockResolvedValue(0) },
    v1Team: {
      findMany: jest.fn().mockResolvedValue(
        ['t1', 't2', 't3', 't4'].map((id) => ({ id, sportId: 'sport-futsal' })),
      ),
    },
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  };
  const adminContext = {
    getMutationAdmin: jest.fn().mockResolvedValue({ id: ADMIN_ID, userId: 'u-1', adminRole: 'owner', status: 'active' }),
    logAdminAction: jest.fn(),
  };
  const service = new LeagueSeriesAdminService(
    prisma as never,
    adminContext as never,
    {} as never,
    {} as never,
  );
  return { service, tx, tournamentCreate };
}

const dto = {
  tiers: [
    { tier: 1, title: '1부', teamIds: ['t1', 't2'] },
    { tier: 2, title: '2부', teamIds: ['t3', 't4'] },
  ],
} as never;

describe('seedSeason — 통합 축 거울 dual-write', () => {
  it('티어마다 리그와 거울을 같은 수만큼 만든다', async () => {
    const { service, tx, tournamentCreate } = makeHarness();

    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    // **개수가 같아야 한다** — 하나라도 빠지면 그 리그가 read-swap 뒤 사라진다.
    expect(tx.v1League.create).toHaveBeenCalledTimes(2);
    expect(tournamentCreate).toHaveBeenCalledTimes(2);
  });

  it('거울이 리그 값을 그대로 받는다 — 행만 있고 값이 비면 화면이 잘못 그려진다', async () => {
    const { service, tournamentCreate } = makeHarness();

    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    const first = tournamentCreate.mock.calls[0][0].data;
    expect(first).toMatchObject({
      id: 'league-1',
      kind: 'regular_league',
      sportId: 'sport-futsal',
      // 새 FK 가 걸리는 자리다 — 비면 목록이 지역을 못 그린다.
      regionId: 'region-1',
      tier: 1,
      seasonNo: 1,
      // 시즌 시작 전이므로 draft 다(리그 state 를 그대로 옮긴 값).
      status: 'draft',
    });
  });

  it('같은 트랜잭션에서 만든다 — 리그만 남고 거울이 빠지는 창이 없다', async () => {
    const { service, tx, tournamentCreate } = makeHarness();

    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    // 거울을 `prisma` 가 아니라 **`tx`** 로 만들었는지가 핵심이다. 밖으로 빠지면 리그만
    // 커밋되고 거울이 없는 창이 열린다 — 그 창에서 만들어진 리그는 영원히 거울이 없다.
    expect(tx.v1Tournament.create).toBe(tournamentCreate);
    expect(tournamentCreate).toHaveBeenCalled();
  });
});
