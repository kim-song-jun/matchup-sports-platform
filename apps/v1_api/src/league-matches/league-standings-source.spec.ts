import { bucketLeagueFixtures, leagueFixtureProgressInput, type LeagueTeamMatchRow } from './league-standings-source';

/**
 * 이 스펙이 잡는 실제 결함: **무효(VOID) 대진이 `pending` 에 섞이는 것.**
 *
 * fact 유무만으로는 *"아직 결과가 없어 미확정"* 과 *"결과가 있었지만 무효 처리됨"* 이
 * 구분되지 않는다 — 둘 다 fact 가 없다. 구분하지 않으면
 * - 진행률의 `remaining` 이 부풀어 화면에 **틀린 퍼센트**가 뜨고(에러는 안 난다),
 * - 승강 확정 게이트("모든 대진이 확정됐는가")가 영구히 막힌다.
 *
 * 그래서 여기 단언은 "VOID 가 걸러진다" 가 아니라 **"어느 버킷에도 안 들어간다"** 이다 —
 * 한쪽만 확인하면 다른 쪽으로 새는 것을 못 잡는다.
 */

function teamMatch(over: Partial<LeagueTeamMatchRow> & { id: string }): LeagueTeamMatchRow {
  return {
    hostTeamId: 'home',
    approvedApplicantTeamId: 'away',
    startAt: new Date('2026-09-01T00:00:00Z'),
    status: 'matched',
    game: null,
    ...over,
  };
}

/** 공식 결과가 있는 게임 — fact 맵에 넣어야 confirmed 가 된다. */
function playedGame(gameId: string, state = 'OFFICIAL'): LeagueTeamMatchRow['game'] {
  return { id: gameId, currentOfficialRevisionId: `rev-${gameId}`, currentOfficialRevision: { state } };
}

describe('bucketLeagueFixtures', () => {
  it('무효(VOID) 대진은 confirmed 에도 pending 에도 들어가지 않는다', () => {
    const rows = [
      teamMatch({ id: 'tm-void', game: playedGame('g-void', 'VOID') }),
      teamMatch({ id: 'tm-played', game: playedGame('g-played') }),
      teamMatch({ id: 'tm-pending' }),
    ];
    const facts = new Map([
      ['g-void', { homeScore: 3, awayScore: 1 }],
      ['g-played', { homeScore: 2, awayScore: 0 }],
    ]);

    const buckets = bucketLeagueFixtures(rows, facts);

    expect(buckets.voidedCount).toBe(1);
    // ⭐ **개수가 아니라 내용으로** 단언한다. 길이 1 은 *올바른 경기 하나*와 *엉뚱한 경기
    //    하나*를 구분하지 못한다 — 무효가 confirmed 로 새면서 유효 경기가 빠지면 길이는
    //    그대로 1 이다. 남아야 할 경기의 점수까지 못박아 그 경우를 배제한다.
    expect(buckets.confirmed).toEqual([
      { homeTeamId: 'home', awayTeamId: 'away', homeScore: 2, awayScore: 0 },
    ]);
    // 어느 쪽에도 없다 — 한쪽만 보면 다른 쪽으로 새는 것을 못 잡는다.
    expect(buckets.pending.map((fixture) => fixture.teamMatchId)).toEqual(['tm-pending']);
  });

  it('취소된 대진은 공식 결과가 있어도 confirmed 로 세지 않는다 (R8)', () => {
    // 오심·오입력 정정으로 취소한 경기가 순위표에 남으면 "정정이 반영되지 않는다" 로 읽힌다.
    const rows = [teamMatch({ id: 'tm-cancelled', status: 'cancelled', game: playedGame('g-cancelled') })];
    const facts = new Map([['g-cancelled', { homeScore: 5, awayScore: 0 }]]);

    const buckets = bucketLeagueFixtures(rows, facts);

    expect(buckets.cancelledCount).toBe(1);
    expect(buckets.confirmed).toHaveLength(0);
    expect(buckets.pending).toHaveLength(0);
  });

  it('상대 팀이 아직 없으면 결과가 있어도 pending 이다', () => {
    const rows = [teamMatch({ id: 'tm-solo', approvedApplicantTeamId: null, game: playedGame('g-solo') })];
    const facts = new Map([['g-solo', { homeScore: 1, awayScore: 0 }]]);

    const buckets = bucketLeagueFixtures(rows, facts);

    expect(buckets.pending.map((fixture) => fixture.teamMatchId)).toEqual(['tm-solo']);
    expect(buckets.confirmed).toHaveLength(0);
  });
});

describe('leagueFixtureProgressInput', () => {
  it('취소·무효는 분모에서도 빠진다 — played + remaining === total 이 성립한다', () => {
    const rows = [
      teamMatch({ id: 'tm-1', game: playedGame('g-1') }),
      teamMatch({ id: 'tm-2', game: playedGame('g-2') }),
      teamMatch({ id: 'tm-3' }),
      teamMatch({ id: 'tm-cancelled', status: 'cancelled' }),
      teamMatch({ id: 'tm-void', game: playedGame('g-void', 'VOID') }),
    ];
    const facts = new Map([
      ['g-1', { homeScore: 1, awayScore: 0 }],
      ['g-2', { homeScore: 2, awayScore: 2 }],
      ['g-void', { homeScore: 9, awayScore: 9 }],
    ]);

    const input = leagueFixtureProgressInput(bucketLeagueFixtures(rows, facts));

    // 5건 중 취소 1 · 무효 1 을 뺀 3건이 분모다 — 앞으로도 치러지지 않을 경기를 "남은 경기"로
    // 세면 진행률이 영원히 100% 에 못 닿는다.
    expect(input).toHaveLength(3);
    expect(input.filter((fixture) => fixture.hasResult)).toHaveLength(2);
  });
});
