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
  const registrationCreate = jest.fn(async (args: { data: Record<string, unknown> }) => args.data);
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
    // 로스터와 짝이 되는 confirmed 등록(BE-3 ⑤). owner 를 못 찾으면 서비스가 422 로
    // 던지므로 fake 도 실제처럼 owner 를 준다.
    v1TeamMembership: { findFirst: jest.fn().mockResolvedValue({ userId: 'owner-1' }) },
    v1TournamentRegistration: { create: registrationCreate },
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
  return { service, tx, tournamentCreate, registrationCreate };
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

  it('응답은 기존 5개 필드만 담는다 — dual-write 때문에 넓힌 읽기가 새면 안 된다', async () => {
    // 거울에 `sport.code` 가 필요해서 `create` 를 `select` → `include` 로 넓혔다.
    // 그 행을 그대로 반환하면 **이 엔드포인트가 줄 생각이 없던 컬럼이 전부 나간다** —
    // 쓰기를 고치려다 읽기 계약이 조용히 커지는 모양이다(Copilot 이 잡았다).
    const { service } = makeHarness();

    const result = await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    expect(result.leagues).toHaveLength(2);
    for (const league of result.leagues) {
      // **키 집합을 통째로 비교한다.** 하나라도 늘면 여기서 걸린다 —
      // "포함하는가" 만 보면 넓어지는 방향을 못 잡는다.
      expect(Object.keys(league).sort()).toEqual(['id', 'seasonNo', 'state', 'tier', 'title']);
    }
  });

  it('로스터 팀마다 confirmed 등록을 함께 만든다 — 백필이 세운 짝 불변식을 잇는다', async () => {
    // 백필은 한 번 돌고 끝났다. 여기서 등록을 안 만들면 이 경로로 만들어진 리그만
    // "로스터엔 있는데 등록엔 없는" 상태가 되고, 아무도 다시 맞춰 주지 않는다.
    const { service, registrationCreate } = makeHarness();
    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    const rows = registrationCreate.mock.calls.map(
      (call) => call[0].data as { tournamentId: string; teamId: string; status: string; entrySource: string },
    );
    // dto 의 두 티어에 든 팀 전부.
    expect(rows).toHaveLength(4); // 1부 t1·t2 + 2부 t3·t4
    for (const row of rows) {
      expect(row).toMatchObject({ status: 'confirmed', entrySource: 'seeded', appliedByUserId: 'owner-1' });
    }
    // **거울 뒤에** 만들어져야 한다 — 등록의 tournamentId 가 거울 행을 가리키므로
    // 순서가 바뀌면 실제 DB 에서 FK 로 막힌다(fake 는 안 막아 주니 순서로 고정한다).
    expect(rows.map((row) => `${row.tournamentId}:${row.teamId}`)).toEqual([
      'league-1:t1',
      'league-1:t2',
      'league-2:t3',
      'league-2:t4',
    ]);
  });
});
