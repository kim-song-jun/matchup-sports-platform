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
  buildOddTeamCountWarning,
  checkLeagueTeamAddAllowed,
  checkLeagueTeamRemovalAllowed,
  findUnfinishedSeasonLeagues,
  parseStoredScore,
  planNextSeasonTiers,
  resolveStoredForfeit,
  shouldCompleteLeague,
  sortMyLeaguesByState,
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
    expect(plan.undersized).toEqual([]);
  });

  it('팀이 1개뿐인 티어는 undersized 로 표시한다 — 서비스가 이걸 보고 확정을 422 로 막는다', () => {
    // alpha 에 실제로 생긴 1팀 리그: 라운드로빈 대진이 0건이라 영원히 completed 가 되지
    // 않고 regenerateFixtures 도 LEAGUE_TEAM_INVALID 로 막혀 복구가 안 된다.
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'stayed'],
        ['c', 2, 'relegated'],
      ]),
      tierCount: 2,
    });
    expect(plan.tiers).toEqual([{ tier: 1, teamIds: ['a', 'b'] }]);
    expect(plan.undersized).toEqual([{ tier: 2, teamIds: ['c'] }]);
  });

  it('팀이 0개인 티어는 undersized 가 아니다 — 그 티어를 열지 않는 것은 정상 결과다', () => {
    // 예: 최하위 티어 전원이 승격. 막을 이유가 없다.
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'stayed'],
      ]),
      tierCount: 3,
    });
    expect(plan.tiers).toEqual([{ tier: 1, teamIds: ['a', 'b'] }]);
    expect(plan.undersized).toEqual([]);
  });

  it('탈퇴(withdrawn) 팀이 빠져 1팀이 되면 그 티어도 undersized 다', () => {
    const plan = planNextSeasonTiers({
      resolved: rows([
        ['a', 1, 'stayed'],
        ['b', 1, 'withdrawn'],
      ]),
      tierCount: 1,
    });
    expect(plan.tiers).toEqual([]);
    expect(plan.undersized).toEqual([{ tier: 1, teamIds: ['a'] }]);
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

describe('sortMyLeaguesByState — 내 리그 상태 정렬', () => {
  it('진행 중 -> 준비 중 -> 종료 순으로 올린다', () => {
    const sorted = sortMyLeaguesByState([
      { id: 'c', state: 'completed' },
      { id: 'd', state: 'draft' },
      { id: 'a', state: 'active' },
    ]);
    expect(sorted.map((l) => l.id)).toEqual(['a', 'd', 'c']);
  });

  it('Prisma enum 순서(draft->active->completed)를 그대로 쓰면 안 된다 — draft 가 위로 오면 회귀', () => {
    // `orderBy: { state: 'asc' }` 는 선언 순서를 따라 draft 를 맨 위로 올린다.
    // "지금 뛰는 리그"를 찾으러 온 사용자에게는 정확히 반대다.
    const sorted = sortMyLeaguesByState([
      { id: 'draft-1', state: 'draft' },
      { id: 'active-1', state: 'active' },
    ]);
    expect(sorted[0].id).toBe('active-1');
  });

  it('같은 상태 안에서는 입력 순서를 보존한다 (호출부의 createdAt desc 를 그대로 유지)', () => {
    const sorted = sortMyLeaguesByState([
      { id: 'a1', state: 'active' },
      { id: 'a2', state: 'active' },
      { id: 'a3', state: 'active' },
    ]);
    expect(sorted.map((l) => l.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('알 수 없는 상태는 맨 뒤로 보낸다 (enum 이 늘어나도 앞을 어지럽히지 않는다)', () => {
    const sorted = sortMyLeaguesByState([
      { id: 'x', state: 'archived' },
      { id: 'a', state: 'active' },
    ]);
    expect(sorted.map((l) => l.id)).toEqual(['a', 'x']);
  });
});

describe('checkLeagueTeamAddAllowed — 참가팀 추가 판정 (그룹 B 감사 결함 1)', () => {
  const valid = { alreadyInLeague: false, teamActive: true, teamSportId: 'futsal', leagueSportId: 'futsal' };

  it('활성·동일 종목·미등록 팀은 통과한다', () => {
    expect(checkLeagueTeamAddAllowed(valid)).toBeNull();
  });

  it('이미 참가 중인 팀은 ALREADY_IN_LEAGUE로 막는다(@@unique 위반 사전 차단)', () => {
    expect(checkLeagueTeamAddAllowed({ ...valid, alreadyInLeague: true })).toBe('ALREADY_IN_LEAGUE');
  });

  it('비활성 팀은 TEAM_INVALID로 막는다', () => {
    expect(checkLeagueTeamAddAllowed({ ...valid, teamActive: false })).toBe('TEAM_INVALID');
  });

  it('종목이 다른 팀은 TEAM_INVALID로 막는다', () => {
    expect(checkLeagueTeamAddAllowed({ ...valid, teamSportId: 'basketball' })).toBe('TEAM_INVALID');
  });
});

describe('checkLeagueTeamRemovalAllowed — 참가팀 제외 판정 (그룹 B 감사 결함 1)', () => {
  const valid = { remainingTeamCount: 3, hasOfficialResultForTeam: false };

  it('2팀 이상 남고 공식 결과가 없으면 통과한다', () => {
    expect(checkLeagueTeamRemovalAllowed(valid)).toBeNull();
  });

  it('제외 후 팀이 2개 미만이 되면 TEAM_COUNT_BELOW_MINIMUM으로 막는다', () => {
    expect(checkLeagueTeamRemovalAllowed({ ...valid, remainingTeamCount: 1 })).toBe('TEAM_COUNT_BELOW_MINIMUM');
  });

  it('이 팀이 낀 대진에 공식 결과가 있으면 HAS_OFFICIAL_RESULT로 막는다 (standings 데이터 손상 방지)', () => {
    expect(checkLeagueTeamRemovalAllowed({ ...valid, hasOfficialResultForTeam: true })).toBe('HAS_OFFICIAL_RESULT');
  });

  it('카디널리티 위반이 결과 확정보다 먼저 걸린다(우선순위 고정)', () => {
    expect(
      checkLeagueTeamRemovalAllowed({ remainingTeamCount: 1, hasOfficialResultForTeam: true }),
    ).toBe('TEAM_COUNT_BELOW_MINIMUM');
  });
});

describe('buildOddTeamCountWarning — 홀수 팀 bye 경고 (그룹 B 감사 결함 2)', () => {
  it('짝수 팀은 경고가 없다', () => {
    expect(buildOddTeamCountWarning(4)).toEqual([]);
  });

  it('홀수 팀은 ODD_TEAM_COUNT_BYE 경고를 낸다 — tournaments 쪽과 동일 code·message', () => {
    expect(buildOddTeamCountWarning(5)).toEqual([
      { code: 'ODD_TEAM_COUNT_BYE', message: '팀 수가 홀수라 라운드마다 한 팀이 쉬어요.' },
    ]);
  });
});
