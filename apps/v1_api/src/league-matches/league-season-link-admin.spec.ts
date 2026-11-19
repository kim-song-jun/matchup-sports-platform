import {
  linkNextSeason,
  listNextSeasonCandidates,
  previousSeasonChain,
  unlinkNextSeason,
} from './league-season-link-admin';

/**
 * 이미 만든 리그를 사후에 다음 시즌으로 잇고 푸는 판정(2026-11-19). 같은 리그를 동시에 잇거나 전환과 겹치는 경쟁은
 * 통합 스펙(`test/league-matches/league-next-season.integration-spec.ts`)이 실제 DB 로 본다 — 여기는 거절 사유와 쓰는 값만.
 */
type Row = {
  id: string;
  title: string;
  sportId: string;
  seriesId: string | null;
  previousLeagueId: string | null;
  status: string;
  deletedAt?: Date | null;
};

const row = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  title: `리그 ${id}`,
  sportId: 'sport-futsal',
  seriesId: null,
  previousLeagueId: null,
  status: 'completed',
  deletedAt: null,
  ...overrides,
});

function fake(rows: Row[], opts: { converted?: boolean } = {}) {
  const table = new Map(rows.map((entry) => [entry.id, { ...entry }]));
  const findFirst = jest.fn(async (args: { where: { AND: Array<Record<string, unknown>> } }) => {
    const clause = args.where.AND[1] as { id?: string; previousLeagueId?: string; deletedAt?: null };
    const found = [...table.values()].find((entry) => {
      if (clause.id !== undefined && entry.id !== clause.id) return false;
      if (clause.previousLeagueId !== undefined && entry.previousLeagueId !== clause.previousLeagueId) return false;
      if (clause.deletedAt === null && entry.deletedAt) return false;
      return true;
    });
    return found ? { ...found } : null;
  });
  const update = jest.fn(async ({ where, data }: { where: { id: string }; data: { previousLeagueId: string | null } }) => {
    const target = table.get(where.id);
    if (target) target.previousLeagueId = data.previousLeagueId;
    return target;
  });
  const updateMany = jest.fn(async ({ where }: { where: { id?: string } }) => ({
    count: where.id !== undefined && table.has(where.id) ? 1 : 0,
  }));
  const findMany = jest.fn().mockResolvedValue([]);
  const queryRaw = jest.fn().mockResolvedValue([]);
  const tx = {
    $queryRaw: queryRaw,
    v1Tournament: { findFirst, update, updateMany, findMany },
    v1AdminActionLog: {
      findFirst: jest.fn().mockResolvedValue(opts.converted ? { afterJson: { seriesId: 'series-1' } } : null),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    v1Tournament: tx.v1Tournament,
  };
  const admins = {
    getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }),
    getActiveAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }),
    logAdminAction: jest.fn().mockResolvedValue({}),
  };
  return { table, tx, prisma: prisma as never, admins: admins as never, adminsMock: admins, update, queryRaw, findMany };
}

const user = { id: 'user-1' } as never;
const PREVIOUS = 'league-0';
const NEXT = 'league-1';

describe('linkNextSeason', () => {
  it('끝난 독립 리그에 다른 독립 리그를 다음 시즌으로 잇고 감사 로그를 남긴다 — 두 행을 id 순서로 잠근다', async () => {
    const { prisma, admins, adminsMock, update, queryRaw, table } = fake([row(PREVIOUS), row(NEXT, { status: 'draft' })]);
    await expect(linkNextSeason(prisma, admins, user, PREVIOUS, { nextLeagueId: NEXT })).resolves.toEqual({
      leagueId: PREVIOUS,
      previousTitle: '리그 league-0',
      nextSeason: { leagueId: NEXT, title: '리그 league-1' },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: NEXT }, data: { previousLeagueId: PREVIOUS } });
    expect(table.get(NEXT)?.previousLeagueId).toBe(PREVIOUS);
    expect(adminsMock.logAdminAction).toHaveBeenCalledWith(
      { id: 'admin-1' },
      {
        action: 'league_match.link_next_season',
        targetType: 'league_match',
        targetId: PREVIOUS,
        afterJson: { previousLeagueId: PREVIOUS, nextLeagueId: NEXT },
      },
      expect.anything(),
    );
    // 잠금은 id 사전순이다 — league-0 다음 league-1.
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual([PREVIOUS, NEXT]);
  });

  it('잠금 순서는 어느 쪽이 지난 리그인지와 무관하게 id 순서다', async () => {
    const { prisma, admins, queryRaw } = fake([row('league-9'), row('league-2', { status: 'draft' })]);
    await linkNextSeason(prisma, admins, user, 'league-9', { nextLeagueId: 'league-2' });
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual(['league-2', 'league-9']);
  });

  it.each([
    ['자기 자신', [row(PREVIOUS)], PREVIOUS, 'LEAGUE_NEXT_SEASON_INVALID'],
    ['없는 리그', [row(PREVIOUS)], NEXT, 'LEAGUE_NEXT_SEASON_INVALID'],
    ['지운 리그', [row(PREVIOUS), row(NEXT, { deletedAt: new Date() })], NEXT, 'LEAGUE_NEXT_SEASON_INVALID'],
    ['리그 체계 안의 리그', [row(PREVIOUS), row(NEXT, { seriesId: 'series-1' })], NEXT, 'LEAGUE_NEXT_SEASON_INVALID'],
    ['취소된 리그', [row(PREVIOUS), row(NEXT, { status: 'cancelled' })], NEXT, 'LEAGUE_NEXT_SEASON_INVALID'],
    ['이미 지난 시즌이 있는 리그', [row(PREVIOUS), row('league-x'), row(NEXT, { previousLeagueId: 'league-x' })], NEXT, 'LEAGUE_PREVIOUS_SEASON_EXISTS'],
    ['다른 종목', [row(PREVIOUS), row(NEXT, { sportId: 'sport-soccer' })], NEXT, 'LEAGUE_PREVIOUS_SEASON_INVALID'],
    ['시작 전 지난 리그', [row(PREVIOUS, { status: 'open' }), row(NEXT)], NEXT, 'LEAGUE_PREVIOUS_SEASON_INVALID'],
    ['이미 다음 시즌이 있는 지난 리그', [row(PREVIOUS), row('league-y', { previousLeagueId: PREVIOUS }), row(NEXT)], NEXT, 'LEAGUE_NEXT_SEASON_EXISTS'],
  ] as const)('%s는 거절하고 아무것도 쓰지 않는다', async (_name, rows, nextLeagueId, code) => {
    const { prisma, admins, adminsMock, update } = fake([...rows]);
    await expect(linkNextSeason(prisma, admins, user, PREVIOUS, { nextLeagueId })).rejects.toMatchObject({ response: { code } });
    expect(update).not.toHaveBeenCalled();
    expect(adminsMock.logAdminAction).not.toHaveBeenCalled();
  });

  it('리그 체계로 전환한 지난 리그는 거절한다', async () => {
    const { prisma, admins, update } = fake([row(PREVIOUS), row(NEXT)], { converted: true });
    await expect(linkNextSeason(prisma, admins, user, PREVIOUS, { nextLeagueId: NEXT })).rejects.toMatchObject({
      response: { code: 'LEAGUE_ALREADY_CONVERTED' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('이 리그의 지난 시즌을 다음 시즌으로 이으면 순환이라 거절한다 — 지운 중간 리그도 따라간다', async () => {
    // league-a ← league-b(지움) ← league-0. league-a 를 league-0 의 다음 시즌으로 이으면 a→b→0→a 가 된다.
    const rows = [row('league-a'), row('league-b', { previousLeagueId: 'league-a', deletedAt: new Date() }), row(PREVIOUS, { previousLeagueId: 'league-b' })];
    const { prisma, admins, update } = fake(rows);
    await expect(linkNextSeason(prisma, admins, user, PREVIOUS, { nextLeagueId: 'league-a' })).rejects.toMatchObject({
      response: { code: 'LEAGUE_NEXT_SEASON_INVALID' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('조회 전용 관리자는 쓰기 권한 검사에서 막힌다', async () => {
    const { prisma, adminsMock } = fake([row(PREVIOUS), row(NEXT)]);
    adminsMock.getMutationAdmin.mockRejectedValue(new Error('forbidden'));
    await expect(linkNextSeason(prisma, adminsMock as never, user, PREVIOUS, { nextLeagueId: NEXT })).rejects.toThrow('forbidden');
  });
});

describe('unlinkNextSeason', () => {
  it('이어진 다음 시즌의 지난 시즌 연결을 풀고 감사 로그를 남긴다', async () => {
    const { prisma, admins, adminsMock, update, table } = fake([row(PREVIOUS), row(NEXT, { previousLeagueId: PREVIOUS })]);
    await expect(unlinkNextSeason(prisma, admins, user, PREVIOUS)).resolves.toEqual({ leagueId: PREVIOUS, unlinkedLeagueId: NEXT });
    expect(update).toHaveBeenCalledWith({ where: { id: NEXT }, data: { previousLeagueId: null } });
    expect(table.get(NEXT)?.previousLeagueId).toBeNull();
    expect(adminsMock.logAdminAction).toHaveBeenCalledWith(
      { id: 'admin-1' },
      {
        action: 'league_match.unlink_next_season',
        targetType: 'league_match',
        targetId: PREVIOUS,
        beforeJson: { previousLeagueId: PREVIOUS, nextLeagueId: NEXT },
      },
      expect.anything(),
    );
  });

  it('이어진 다음 시즌이 없으면 거절한다', async () => {
    const { prisma, admins, update } = fake([row(PREVIOUS)]);
    await expect(unlinkNextSeason(prisma, admins, user, PREVIOUS)).rejects.toMatchObject({ response: { code: 'LEAGUE_NEXT_SEASON_MISSING' } });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('previousSeasonChain', () => {
  it('지난 시즌을 거슬러 올라가며 자기 자신은 넣지 않는다', async () => {
    const { tx } = fake([row('c', { previousLeagueId: 'b' }), row('b', { previousLeagueId: 'a' }), row('a')]);
    await expect(previousSeasonChain(tx as never, 'c')).resolves.toEqual(['b', 'a']);
  });

  it('이미 순환이 있는 데이터에서도 끝난다', async () => {
    const { tx } = fake([row('a', { previousLeagueId: 'b' }), row('b', { previousLeagueId: 'a' })]);
    await expect(previousSeasonChain(tx as never, 'a')).resolves.toEqual(['b']);
  });
});

describe('listNextSeasonCandidates', () => {
  it('같은 종목의 지난 시즌 없는 독립 리그만 최근순으로 고르고, 자기 자신과 지난 시즌들은 뺀다', async () => {
    const { prisma, admins, findMany, table } = fake([row('league-2', { previousLeagueId: 'league-1' }), row('league-1', { previousLeagueId: 'league-0' }), row('league-0')]);
    findMany.mockResolvedValue([
      {
        id: 'league-9',
        title: '겨울 리그',
        status: 'draft',
        scheduledAt: new Date('2027-01-10T00:00:00.000Z'),
        scheduledEndAt: new Date('2027-03-10T00:00:00.000Z'),
        _count: { registrations: 5 },
      },
    ]);
    table.get('league-2')!.sportId = 'sport-futsal';
    const result = await listNextSeasonCandidates(prisma, admins, user, 'league-2');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          kind: 'regular_league',
          deletedAt: null,
          seriesId: null,
          previousLeagueId: null,
          sportId: 'sport-futsal',
          status: { not: 'cancelled' },
          id: { notIn: ['league-2', 'league-1', 'league-0'] },
        },
        orderBy: [{ scheduledAt: 'desc' }, { id: 'asc' }],
      }),
    );
    expect(result).toEqual({
      leagueId: 'league-2',
      hasMore: false,
      candidates: [
        {
          leagueId: 'league-9',
          title: '겨울 리그',
          state: 'draft',
          startsOn: '2027-01-10T00:00:00.000Z',
          endsOn: '2027-03-10T00:00:00.000Z',
          confirmedCount: 5,
        },
      ],
    });
  });

  it('후보가 상한을 넘으면 hasMore 로 알린다', async () => {
    const { prisma, admins, findMany } = fake([row(PREVIOUS)]);
    findMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) => ({
        id: `l-${index}`, title: `리그 ${index}`, status: 'completed', scheduledAt: null, scheduledEndAt: null, _count: { registrations: 0 },
      })),
    );
    const result = await listNextSeasonCandidates(prisma, admins, user, PREVIOUS);
    expect(result.candidates).toHaveLength(100);
    expect(result.hasMore).toBe(true);
    expect(result.candidates[0]).toMatchObject({ startsOn: null, endsOn: null });
  });

  it('없는 리그는 404 다', async () => {
    const { prisma, admins } = fake([]);
    await expect(listNextSeasonCandidates(prisma, admins, user, PREVIOUS)).rejects.toMatchObject({ response: { code: 'LEAGUE_NOT_FOUND' } });
  });
});
