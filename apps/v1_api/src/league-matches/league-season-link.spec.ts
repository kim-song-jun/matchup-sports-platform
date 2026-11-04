import { assertNextSeasonSourceInTx } from './league-season-link';

/**
 * 다음 시즌을 이을 수 있는 지난 리그의 판정(2026-11-03). 같은 지난 리그 경쟁·전환 차단은 통합 스펙
 * (`test/league-matches/league-next-season.integration-spec.ts`)이 실제 DB 로 본다 — 여기는 거절 사유의 순서만.
 */
function fakeTx(previous: Record<string, unknown> | null, opts: { converted?: boolean; nextSeason?: boolean } = {}) {
  const updateMany = jest.fn().mockResolvedValue({ count: previous === null ? 0 : 1 });
  const tx = {
    v1Tournament: {
      updateMany,
      // 지난 리그 조회는 id 로, 이어진 다음 시즌 조회는 previousLeagueId 로 온다.
      findFirst: jest.fn(async (args: { where: unknown }) =>
        JSON.stringify(args.where).includes('previousLeagueId') ? (opts.nextSeason ? { id: 'next', title: '겨울 리그' } : null) : previous),
    },
    v1AdminActionLog: {
      findFirst: jest.fn().mockResolvedValue(opts.converted ? { afterJson: { seriesId: 'series-1' } } : null),
    },
  };
  return { tx: tx as never, updateMany };
}

const league = { id: 'league-0', title: '가을 리그', sportId: 'sport-futsal', seriesId: null, status: 'completed' };
const input = { previousLeagueId: 'league-0', sportId: 'sport-futsal' };

describe('assertNextSeasonSourceInTx', () => {
  it('시작했거나 끝낸 같은 종목 독립 리그면 통과하고, 지운 다음 시즌이 쥔 연결을 푼다', async () => {
    for (const status of ['in_progress', 'completed']) {
      const { tx, updateMany } = fakeTx({ ...league, status });
      await expect(assertNextSeasonSourceInTx(tx, input)).resolves.toEqual({ id: 'league-0', title: '가을 리그' });
      expect(updateMany).toHaveBeenLastCalledWith({
        where: { previousLeagueId: 'league-0', deletedAt: { not: null } },
        data: { previousLeagueId: null },
      });
    }
  });

  it.each([
    ['없는 리그', null, {}, 'LEAGUE_PREVIOUS_SEASON_INVALID'],
    ['리그 체계 안의 리그', { ...league, seriesId: 'series-1' }, {}, 'LEAGUE_PREVIOUS_SEASON_INVALID'],
    ['시작 전 리그', { ...league, status: 'open' }, {}, 'LEAGUE_PREVIOUS_SEASON_INVALID'],
    ['다른 종목', { ...league, sportId: 'sport-soccer' }, {}, 'LEAGUE_PREVIOUS_SEASON_INVALID'],
    ['리그 체계로 전환한 리그', league, { converted: true }, 'LEAGUE_ALREADY_CONVERTED'],
    ['이미 다음 시즌을 이은 리그', league, { nextSeason: true }, 'LEAGUE_NEXT_SEASON_EXISTS'],
  ] as const)('%s는 거절한다', async (_name, previous, opts, code) => {
    const { tx } = fakeTx(previous, opts);
    await expect(assertNextSeasonSourceInTx(tx, input)).rejects.toMatchObject({ response: { code } });
  });
});
