import { LeagueSeriesAdminService } from './league-series-admin.service';

/**
 * **시리즈 최초 생성(`seedSeason`)이 통합 축에 리그를 만든다.**
 *
 * 예전에는 `V1League` 를 만들고 거울을 함께 쓰는 dual-write 였고, 이 스펙은 "둘의 개수가
 * 같은가" 를 지켰다. BE-5 drop 이 그 테이블을 없애면서 **통합 축 create 하나가 리그 생성
 * 자체**가 됐다 — 이제 지킬 것은 개수 일치가 아니라 **그 한 번이 값을 다 채우고 같은
 * 트랜잭션 안에서 일어나는가** 다.
 *
 * (`docs/ops/read-swap-preflight.md` 9절이 걱정하던 "거울 없는 리그" 는 구조적으로
 * 불가능해졌다 — 거울이 곧 원본이라 빠질 대상이 없다.)
 */
const SERIES_ID = 'series-1';
const ADMIN_ID = 'admin-1';

function makeHarness() {
  const tournamentCreate = jest.fn(async (args: { data: Record<string, unknown> }) => args.data);
  const outboxInsert = jest.fn(async () => 1);
  // upsert 다 — `(tournamentId, teamId)` @@unique 라 무조건 create 면 P2002 다.
  const registrationCreate = jest.fn(async (args: { create: Record<string, unknown> }) => args.create);
  const tx = {
    // BE-5 drop: `v1League` 는 사라졌다 — fake 에도 두지 않는다. 남겨 두면 서비스가 그걸
    // 부르는 회귀가 들어와도 스펙이 통과한다.
    v1Sport: { findUniqueOrThrow: jest.fn(async () => ({ code: 'futsal' })) },
    v1Tournament: { create: tournamentCreate },
    v1LeagueSeries: { update: jest.fn() },
    // 로스터와 짝이 되는 confirmed 등록(BE-3 ⑤). owner 를 못 찾으면 서비스가 422 로
    // 던지므로 fake 도 실제처럼 owner 를 준다.
    // `createLeagueRosterRegistration` 이 `V1Team.ownerUserId` 에서 appliedByUserId 를 읽는다.
    // 팀마다 다른 owner 를 줘서 "전부 같은 값" 으로 통과하는 단언을 못 쓰게 한다.
    v1Team: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => ({
        ownerUserId: `owner-of-${args.where.id}`,
      })),
    },
    v1TournamentRegistration: { upsert: registrationCreate },
    // 거울 생성이 로스터 자동 확정 예약(D10)까지 함께 한다 — 그 예약은 아웃박스 행을
    // `$executeRaw` 로 넣는다. fake 에 없으면 "tx.$executeRaw is not a function" 으로
    // dual-write 단언에 닿기도 전에 죽는다(이 스펙이 재는 건 거울이지 예약이 아니다).
    $executeRaw: outboxInsert,
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
    // BE-5: "이미 시딩됐나" 판정이 통합 축으로 옮겨졌다.
    v1Tournament: { count: jest.fn().mockResolvedValue(0) },
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
  it('티어마다 통합 축 대회 행을 하나씩 만든다', async () => {
    const { service, tournamentCreate } = makeHarness();

    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    expect(tournamentCreate).toHaveBeenCalledTimes(2);
  });

  it('만들어진 행에 값이 다 실린다 — 행만 있고 값이 비면 화면이 잘못 그려진다', async () => {
    const { service, tournamentCreate } = makeHarness();

    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    const first = tournamentCreate.mock.calls[0][0].data;
    // BE-5 drop: id 는 서버가 만든 uuid 다(예전엔 레거시 create 가 돌려준 값이었다).
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(first).toMatchObject({
      kind: 'regular_league',
      sportId: 'sport-futsal',
      // 새 FK 가 걸리는 자리다 — 비면 목록이 지역을 못 그린다.
      regionId: 'region-1',
      tier: 1,
      seasonNo: 1,
      // 시즌 시작 전이므로 draft 다.
      status: 'draft',
    });
  });

  it('같은 트랜잭션에서 만든다 — 리그 생성과 등록이 갈라지는 창이 없다', async () => {
    const { service, tx, tournamentCreate } = makeHarness();

    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    // `prisma` 가 아니라 **`tx`** 로 만들었는지가 핵심이다. 밖으로 빠지면 리그만 커밋되고
    // 로스터 등록이 없는 창이 열린다 — 그 리그는 참가팀 0으로 보인다.
    expect(tx.v1Tournament.create).toBe(tournamentCreate);
    expect(tournamentCreate).toHaveBeenCalled();
  });

  it('응답은 기존 5개 필드만 담는다 — 저장 축이 바뀌었다고 응답이 넓어지면 안 된다', async () => {
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

  it('로스터 팀마다 confirmed 등록을 만든다 — 이제 그게 참가 그 자체다', async () => {
    // 백필은 한 번 돌고 끝났다. 여기서 등록을 안 만들면 이 경로로 만들어진 리그만
    // "로스터엔 있는데 등록엔 없는" 상태가 되고, 아무도 다시 맞춰 주지 않는다.
    const { service, registrationCreate, tournamentCreate } = makeHarness();
    await service.seedSeason({ id: 'u-1' } as never, SERIES_ID, dto);

    const rows = registrationCreate.mock.calls.map(
      (call) =>
        call[0].create as {
          tournamentId: string;
          teamId: string;
          status: string;
          entrySource: string;
          appliedByUserId: string;
        },
    );
    // dto 의 두 티어에 든 팀 전부.
    expect(rows).toHaveLength(4); // 1부 t1·t2 + 2부 t3·t4
    for (const row of rows) {
      expect(row).toMatchObject({
        status: 'confirmed',
        entrySource: 'seeded',
        appliedByUserId: `owner-of-${row.teamId}`,
      });
    }
    // **대회 행 뒤에** 만들어져야 한다 — 등록의 tournamentId 가 그 행을 가리키므로 순서가
    // 바뀌면 실제 DB 에서 FK 로 막힌다(fake 는 안 막아 주니 값으로 고정한다).
    //
    // 고정 문자열 대신 **방금 만든 대회 행의 id** 와 대조한다. id 가 서버 생성 uuid 로
    // 바뀌어서만이 아니라, 그래야 "등록이 그 티어의 행을 가리키는가" 를 실제로 재기
    // 때문이다 — 고정 문자열은 두 값이 함께 틀려도 통과한다.
    const createdIds = tournamentCreate.mock.calls.map((call) => call[0].data.id as string);
    expect(createdIds).toHaveLength(2);
    expect(rows.map((row) => `${row.tournamentId}:${row.teamId}`)).toEqual([
      `${createdIds[0]}:t1`,
      `${createdIds[0]}:t2`,
      `${createdIds[1]}:t3`,
      `${createdIds[1]}:t4`,
    ]);
  });
});
