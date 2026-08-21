/**
 * league-lifecycle-rules.spec.ts
 *
 * 리그 수명주기 판정 3종의 계약 테스트. 각 케이스는 **alpha 에서 실제로 재현된 결함**을
 * 고정한 것이다 — 조건 한 줄이 되돌아가면 여기서 깨진다.
 *
 *  - shouldCompleteLeague: 마지막 대진을 취소로 끝낸 리그가 영원히 active 로 남던 문제(D-3 구멍)
 *  - findUnfinishedSeasonLeagues: 한 경기도 안 치른 시즌에 승강이 확정되던 문제
 *  - planNextSeasonTiers: 승강 확정이 1팀짜리 리그를 만들던 문제
 *  - resolveStoredForfeit: 몰수 재호출이 DB 와 다른 값을 성공으로 돌려주던 문제
 */
import {
  findUnfinishedSeasonLeagues,
  parseStoredScore,
  planNextSeasonTiers,
  resolveStoredForfeit,
  shouldCompleteLeague,
} from './league-lifecycle-rules';

const HOME = 'team-home';
const AWAY = 'team-away';

describe('shouldCompleteLeague — 자동 종료 판정 (D-3)', () => {
  it('취소 제외 전 대진이 확정되면 종료한다', () => {
    expect(
      shouldCompleteLeague({
        state: 'active',
        fixtures: [
          { status: 'completed', hasOfficialResult: true },
          { status: 'matched', hasOfficialResult: true },
        ],
      }),
    ).toBe(true);
  });

  it('미확정 대진이 하나라도 남으면 종료하지 않는다', () => {
    expect(
      shouldCompleteLeague({
        state: 'active',
        fixtures: [
          { status: 'completed', hasOfficialResult: true },
          { status: 'matched', hasOfficialResult: false },
        ],
      }),
    ).toBe(false);
  });

  it('마지막 미확정 대진이 취소되면 그 시점에 종료한다 — alpha 에서 영원히 active 로 남던 케이스', () => {
    // 취소를 "전부 확정"의 조건에 넣으면 이 리그는 절대 완료되지 않는다.
    expect(
      shouldCompleteLeague({
        state: 'active',
        fixtures: [
          { status: 'completed', hasOfficialResult: true },
          { status: 'cancelled', hasOfficialResult: false },
        ],
      }),
    ).toBe(true);
  });

  it('취소된 대진에 공식 결과가 남아 있어도 판정에 끼어들지 않는다', () => {
    // 취소 후에도 결과 리비전은 보존된다(기록은 지우지 않는 저장소 정책).
    expect(
      shouldCompleteLeague({
        state: 'active',
        fixtures: [
          { status: 'matched', hasOfficialResult: false },
          { status: 'cancelled', hasOfficialResult: true },
        ],
      }),
    ).toBe(false);
  });

  it('대진이 하나도 없는 리그(draft 직후)는 종료 대상이 아니다', () => {
    expect(shouldCompleteLeague({ state: 'active', fixtures: [] })).toBe(false);
  });

  it('전 대진이 취소된 리그도 종료 대상이 아니다 — "모두 확정"의 의미가 없다', () => {
    expect(
      shouldCompleteLeague({
        state: 'active',
        fixtures: [
          { status: 'cancelled', hasOfficialResult: false },
          { status: 'cancelled', hasOfficialResult: true },
        ],
      }),
    ).toBe(false);
  });

  it('active 가 아닌 리그는 건드리지 않는다 (멱등)', () => {
    const fixtures = [{ status: 'completed', hasOfficialResult: true }];
    expect(shouldCompleteLeague({ state: 'completed', fixtures })).toBe(false);
    expect(shouldCompleteLeague({ state: 'draft', fixtures })).toBe(false);
  });
});

describe('findUnfinishedSeasonLeagues — 승강 게이트', () => {
  it('전 티어가 completed 면 통과한다', () => {
    expect(
      findUnfinishedSeasonLeagues([
        { id: 'l1', tier: 1, state: 'completed' },
        { id: 'l2', tier: 2, state: 'completed' },
      ]),
    ).toEqual([]);
  });

  it('대진이 없어 draft 인 티어를 막는다 — 한 경기도 안 치른 시즌에 승강이 확정되던 케이스', () => {
    // 게이트가 pendingFixtures > 0 이었을 때 alpha 에서 3티어 전부 draft·대진 0건인
    // 시리즈가 그대로 통과해 UUID 사전순 강등안을 만들어 냈다.
    const unfinished = findUnfinishedSeasonLeagues([
      { id: 'l1', tier: 1, state: 'draft' },
      { id: 'l2', tier: 2, state: 'draft' },
      { id: 'l3', tier: 3, state: 'draft' },
    ]);
    expect(unfinished.map((league) => league.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('한 티어만 진행 중이어도 막고, 그 티어를 그대로 알려준다', () => {
    const unfinished = findUnfinishedSeasonLeagues([
      { id: 'l1', tier: 1, state: 'completed' },
      { id: 'l2', tier: 2, state: 'active' },
    ]);
    expect(unfinished).toEqual([{ id: 'l2', tier: 2, state: 'active' }]);
  });
});

describe('planNextSeasonTiers — 다음 시즌 편성', () => {
  const rows = (spec: Array<[string, number, string]>) =>
    spec.map(([teamId, toTier, kind]) => ({ teamId, toTier, kind }));

  it('티어별로 팀을 모아 다음 시즌 편성을 만든다', () => {
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'promoted'],
        ['c', 2, 'relegated'],
        ['d', 2, 'stayed'],
      ]),
      tierCount: 2,
    });
    expect(plan.tiers).toEqual([
      { tier: 1, teamIds: ['a', 'b'] },
      { tier: 2, teamIds: ['c', 'd'] },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('팀이 1개뿐인 티어는 만들지 않고 skipped 로 알린다 — alpha 에 실제로 생긴 1팀 리그', () => {
    // 1팀 리그는 라운드로빈 대진이 0건이라 영원히 completed 가 되지 않고,
    // regenerateFixtures 도 LEAGUE_TEAM_INVALID 로 막혀 복구가 안 된다.
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'stayed'],
        ['c', 2, 'relegated'],
      ]),
      tierCount: 2,
    });
    expect(plan.tiers).toEqual([{ tier: 1, teamIds: ['a', 'b'] }]);
    expect(plan.skipped).toEqual([{ tier: 2, teamIds: ['c'] }]);
  });

  it('팀이 0개인 티어는 skipped 에도 넣지 않는다 — 알릴 것이 없다', () => {
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'stayed'],
      ]),
      tierCount: 3,
    });
    expect(plan.tiers).toEqual([{ tier: 1, teamIds: ['a', 'b'] }]);
    expect(plan.skipped).toEqual([]);
  });

  it('탈퇴(withdrawn) 팀은 다음 시즌에서 빠지고, 그 결과 1팀이 되면 그 티어도 빠진다', () => {
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'withdrawn'],
      ]),
      tierCount: 1,
    });
    expect(plan.tiers).toEqual([]);
    expect(plan.skipped).toEqual([{ tier: 1, teamIds: ['a'] }]);
  });
});

describe('resolveStoredForfeit — 몰수 멱등 응답', () => {
  const base = {
    hostTeamId: HOME,
    awayTeamId: AWAY,
    fallback: { homeScore: 1, awayScore: 0 },
  };

  it('저장된 1:0 은 원정팀이 몰수한 것으로 읽는다', () => {
    expect(
      resolveStoredForfeit({ ...base, storedScore: { home: 1, away: 0 }, requestedNoShowTeamId: AWAY }),
    ).toEqual({
      noShowTeamId: AWAY,
      winningTeamId: HOME,
      homeScore: 1,
      awayScore: 0,
      requestMatchesStored: true,
    });
  });

  it('반대 팀으로 재요청해도 저장된 값을 그대로 돌려주고 불일치를 알린다 — alpha 에서 거짓 성공을 내던 케이스', () => {
    // 요청 dto 로 계산해 돌려주면 "0:1 · 홈팀 몰수, 처리 완료"라는 응답이 나가는데
    // DB 는 여전히 1:0 · 원정팀 몰수다. 운영자가 정정됐다고 착각한다.
    const outcome = resolveStoredForfeit({
      ...base,
      storedScore: { home: 1, away: 0 },
      requestedNoShowTeamId: HOME,
    });
    expect(outcome.noShowTeamId).toBe(AWAY);
    expect(outcome.winningTeamId).toBe(HOME);
    expect(outcome.homeScore).toBe(1);
    expect(outcome.awayScore).toBe(0);
    expect(outcome.requestMatchesStored).toBe(false);
  });

  it('저장된 0:1 은 홈팀이 몰수한 것으로 읽는다', () => {
    const outcome = resolveStoredForfeit({
      ...base,
      storedScore: { home: 0, away: 1 },
      requestedNoShowTeamId: HOME,
    });
    expect(outcome.noShowTeamId).toBe(HOME);
    expect(outcome.winningTeamId).toBe(AWAY);
    expect(outcome.requestMatchesStored).toBe(true);
  });

  it('score 를 읽을 수 없으면 요청값으로 폴백한다 (500 으로 새지 않는다)', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { home: '1', away: 0 }]) {
      const outcome = resolveStoredForfeit({
        ...base,
        storedScore: bad,
        requestedNoShowTeamId: AWAY,
      });
      expect(outcome).toEqual({
        noShowTeamId: AWAY,
        winningTeamId: HOME,
        homeScore: 1,
        awayScore: 0,
        requestMatchesStored: true,
      });
    }
  });
});

describe('parseStoredScore', () => {
  it('숫자 쌍만 통과시킨다', () => {
    expect(parseStoredScore({ home: 3, away: 1 })).toEqual({ home: 3, away: 1 });
    expect(parseStoredScore({ home: 0, away: 0 })).toEqual({ home: 0, away: 0 });
  });

  it('형태가 다르면 null 이다', () => {
    expect(parseStoredScore(null)).toBeNull();
    expect(parseStoredScore(undefined)).toBeNull();
    expect(parseStoredScore('1:0')).toBeNull();
    expect(parseStoredScore({ home: 1 })).toBeNull();
    expect(parseStoredScore({ home: null, away: 0 })).toBeNull();
  });
});
