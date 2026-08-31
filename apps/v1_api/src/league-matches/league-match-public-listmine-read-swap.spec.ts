import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
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
 * 5. 불완전한 거울(지역·시작일·종료일)은 **거르지 않고 던진다** — 거르면 조용히 사라진다
 * 6. 그 실패가 **HTTP 응답까지 간다** — `HttpException` 이 아니면 필터가 500 +
 *    "Internal server error" 로 정규화해 리그 id 도 code 도 유실된다
 */
/**
 * **던져진 예외가 아니라 클라이언트가 받는 본문을 단언하기 위한 하네스.**
 *
 * 이 스펙이 두 번 놓친 자리다:
 * ```
 * 1회차  new Error(...)                            필터가 message 를 통째로 덮었다
 * 2회차  InternalServerErrorException({ detail })  필터가 안 읽는 키라 응답에서 사라졌다
 * ```
 * **두 번 다 예외 객체를 단언해서 통과했다.** 예외 객체는 *코드가 만든 중간 산물*이고
 * 클라이언트가 받는 것은 *필터를 통과한 뒤*다 — 그 사이에서 유실되면 단언은 못 본다.
 * 그래서 필터를 실제로 태워 `response.json()` 에 들어간 본문을 본다.
 */
async function bodyAfterFilter(run: () => Promise<unknown>) {
  let thrown: unknown;
  try {
    await run();
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeDefined();

  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) };
  const req = { id: 'req-1', url: '/league-matches/mine', method: 'GET', headers: {} };
  const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as never;
  const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() } as never;
  const errorLogService = { record: jest.fn() } as never;

  new AllExceptionsFilter(logger, errorLogService).catch(thrown, host);

  expect(json).toHaveBeenCalledTimes(1);
  return {
    statusCode: res.status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
}


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

  // 세 필드는 같은 불변식이다 — 하나만 막고 나머지를 `as Date` 로 단언하면 그 둘은
  // 되돌려도 green 이다. 그래서 셋을 각각 돌린다.
  it.each([
    ['region', { region: null }, ['region']],
    ['scheduledAt', { scheduledAt: null }, ['scheduledAt']],
    ['scheduledEndAt', { scheduledEndAt: null }, ['scheduledEndAt']],
    [
      '세 개 동시',
      { region: null, scheduledAt: null, scheduledEndAt: null },
      ['region', 'scheduledAt', 'scheduledEndAt'],
    ],
  ])('불완전한 거울(%s)은 거르지 않고 실패한다', async (_label, broken, missing) => {
    // 거르면 그 리그가 목록에서 사라지고 — 그게 이 작업 전체가 막으려는 실패 모습이다.
    const { prisma } = makePrisma([mirror({ id: 'lg-broken', ...(broken as object) })]);
    const service = new LeagueMatchPublicService(prisma);

    // **클라이언트가 실제로 받는 본문**을 본다. 예외 객체를 단언하면 아래 둘을
    // 원리적으로 못 잡는다 — 둘 다 필터를 지나며 유실되기 때문이다:
    //   plain `Error`      → 필터가 message 를 'Internal server error' 로 덮는다
    //   키가 `detail`(단수) → 필터가 안 읽어 응답에서 사라진다
    const { statusCode, body } = await bodyAfterFilter(() => service.listMine('user-1'));

    expect(statusCode).toBe(500);
    expect(body).toMatchObject({
      code: 'LEAGUE_MIRROR_INCOMPLETE',
      message: '리그 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      details: [{ leagueId: 'lg-broken', missing }],
    });
  });

  it('완전한 거울만 있으면 한 건도 거르지 않는다', async () => {
    // 위 검사가 "전부 던진다" 로 과잉 반응하면 목록이 통째로 죽는다 — 반대 방향도 고정한다.
    //
    // `draft` 를 쓰는 이유: non-draft 는 항목마다 `standings()` 를 부르고, 그건 **아직
    // 리그 축(`v1League.findUnique`)을 읽는다** — R4-a 는 `listMine` 자신의 조회만
    // 옮겼고 `standings()` 는 범위 밖이다. 여기서 검증할 건 "완전한 거울이 살아남는가"
    // 뿐이고 그 검사는 조회 직후에 끝나므로, standings 경로를 끌어들이지 않는다.
    const { prisma } = makePrisma([
      mirror({ id: 'lg-a', status: 'draft' }),
      mirror({ id: 'lg-b', status: 'draft' }),
    ]);
    const service = new LeagueMatchPublicService(prisma);

    const result = await service.listMine('user-1');

    expect(result.items.map((item) => item.leagueId)).toEqual(['lg-a', 'lg-b']);
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
