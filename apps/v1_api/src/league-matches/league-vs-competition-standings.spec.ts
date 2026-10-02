/**
 * 대회 순위 계산기 ↔ 리그 순위 계산기 **동치성 대조**.
 *
 * 통합 설계(§11 Q3)는 "두 계산기 중 어느 쪽으로 수렴할지"를 아직 정하지 않았고, 그
 * 결정 근거가 이 파일이다. 그래서 이 스펙은 한쪽을 정답으로 두지 않는다 — **같은 입력을
 * 두 엔진에 넣고 순위 순서를 서로 대조**할 뿐이다. 기대값을 한쪽 구현에서 복사해 오면
 * 이 대조는 그 순간 무의미해진다.
 *
 * 읽는 법:
 * - `일치` 로 시작하는 케이스 = 두 엔진이 같은 답을 낸다. 수렴해도 이 축은 안 바뀐다.
 * - `불일치` 로 시작하는 케이스 = 두 엔진이 다른 답을 낸다. 수렴하면 **한쪽 리그·대회의
 *   확정된 순위가 바뀐다.** 그 축이 무엇인지가 케이스 이름에 적혀 있다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠ 수렴 작업을 하러 온 사람에게 — 이 스펙은 **없앨 예정인 차이를 기록한 것이다.**
 *
 * 여기 적힌 `불일치` 단언들은 "이렇게 동작해야 한다"는 요구사항이 **아니다.** 통합
 * 설계가 두 엔진을 하나로 모으기로 했으므로 그 차이들은 의도적으로 제거될 대상이고,
 * 따라서 **이 스펙이 통과한다는 사실은 "정상"의 증거가 아니다** — 아직 수렴이 일어나지
 * 않았다는 사실의 기록일 뿐이다.
 *
 * 그래서 수렴을 구현하다 이 파일이 깨지면 그건 **네가 뭘 잘못한 게 아니라 목표를 달성한
 * 것이다.** 단언을 새 동작에 맞춰 고쳐 통과시키지 마라 — 그렇게 하면 대조라는 이 파일의
 * 목적만 남고 의미가 사라진다. 이 파일은 고치는 게 아니라 **다시 쓰는** 대상이며, 그때
 * 남길 것은 "수렴 후 두 엔진이 같은 입력에 같은 답을 낸다"는 단언 하나다. 수렴 방향이
 * 정해지지 않은 채 깨졌다면 그때는 의도치 않은 회귀이므로 원인을 먼저 찾아라.
 *
 * 근거: 통합 설계 §11 Q3(수렴 방향, 미결) · 이 스펙을 도입한 PR #840.
 * 이 저장소에는 스펙이 결함 동작을 박제해 이후 수정을 "테스트가 깨지니 잘못됐다"로
 * 오판하게 만든 사례가 이미 여러 건 있다 — 그 함정을 여기서 반복하지 않으려고 적는다.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { calculateCompetitionStandings } from '../tournaments/competition-config/competition-standings';
import { FUTSAL_V1_CONFIG } from '../tournaments/competition-config/competition-config.presets';
import { CompetitionConfig } from '../tournaments/competition-config/competition-config.types';
import { calculateLeagueStandings, LeagueTieBreakCriterion } from './league-standings';

/**
 * 실제 리그가 쓰는 tie-break 순서.
 *
 * 리그 생성 시 `tieBreakJson` 에 이 순서가 그대로 저장되고
 * (`league-series-admin.service.ts:290,601`·`league-match-admin.service.ts:105` 의
 * `tieBreakJson: { order: DEFAULT_TIE_BREAK_ORDER }`), 저장값이 비어 있을 때의 조회
 * 폴백도 같은 값이다(`league-match-public.service.ts:432-434`). 그 값을 만드는 리터럴
 * 자체도 세 벌로 복제돼 있다 — 두 서비스의 상수 정의(`:28`·`:35`)와 조회 폴백의 인라인
 * 배열. 그리고 **이 값을 바꾸는 어드민 경로도 화면도 없다** — 즉 현존하는 모든 리그의
 * 실효 순서가 이것 하나다. 대조의 기준선으로 삼는 이유.
 */
const LEAGUE_ORDER_AS_SHIPPED: LeagueTieBreakCriterion[] = [
  'points',
  'goalDifference',
  'goalsFor',
  'headToHead',
];

/** 맞대결을 앞으로 당긴 가상 순서 — "설정만 바꾸면 대회와 같아지나"를 확인하는 데 쓴다. */
const LEAGUE_ORDER_H2H_FIRST: LeagueTieBreakCriterion[] = [
  'points',
  'headToHead',
  'goalDifference',
  'goalsFor',
];

type Fixture = { home: string; away: string; homeScore: number; awayScore: number };

function competitionOrder(input: {
  teamIds: string[];
  fixtures: Fixture[];
  config?: CompetitionConfig;
  tournamentId?: string;
  fairPlay?: ReadonlyMap<string, number>;
}): string[] {
  return calculateCompetitionStandings({
    tournamentId: input.tournamentId ?? 'tournament-fixed',
    configVersionId: 'config-fixed',
    registrationIds: input.teamIds,
    fixtures: input.fixtures.map((fixture) => ({
      homeRegistrationId: fixture.home,
      awayRegistrationId: fixture.away,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    })),
    config: input.config ?? FUTSAL_V1_CONFIG,
    fairPlayByRegistration: input.fairPlay,
  }).map((standing) => standing.registrationId);
}

function leagueOrder(input: {
  teamIds: string[];
  fixtures: Fixture[];
  tieBreakOrder?: LeagueTieBreakCriterion[];
}): string[] {
  return calculateLeagueStandings({
    teamIds: input.teamIds,
    fixtures: input.fixtures.map((fixture) => ({
      homeTeamId: fixture.home,
      awayTeamId: fixture.away,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    })),
    tieBreakOrder: input.tieBreakOrder ?? LEAGUE_ORDER_AS_SHIPPED,
  }).map((standing) => standing.teamId);
}

describe('대회 ↔ 리그 순위 계산기 동치성 (§11 Q3 결정 근거)', () => {
  describe('일치하는 축', () => {
    it('일치 — 승점이 서로 다르면 두 엔진의 순서가 같다', () => {
      const teamIds = ['alpha', 'bravo', 'charlie'];
      const fixtures: Fixture[] = [
        { home: 'alpha', away: 'bravo', homeScore: 2, awayScore: 0 },
        { home: 'alpha', away: 'charlie', homeScore: 1, awayScore: 0 },
        { home: 'bravo', away: 'charlie', homeScore: 1, awayScore: 0 },
      ];
      const competition = competitionOrder({ teamIds, fixtures });
      const league = leagueOrder({ teamIds, fixtures });
      expect(competition).toEqual(league);
      expect(competition).toEqual(['alpha', 'bravo', 'charlie']);
    });

    it('일치 — 팀마다 치른 경기 수가 달라도 두 엔진이 같은 답을 낸다 (둘 다 경기당 평균이 아니라 누적으로 센다)', () => {
      const teamIds = ['three-games', 'two-games', 'one-game'];
      const fixtures: Fixture[] = [
        { home: 'three-games', away: 'two-games', homeScore: 1, awayScore: 0 },
        { home: 'three-games', away: 'two-games', homeScore: 3, awayScore: 3 },
        { home: 'three-games', away: 'one-game', homeScore: 0, awayScore: 0 },
      ];
      expect(competitionOrder({ teamIds, fixtures })).toEqual(leagueOrder({ teamIds, fixtures }));
    });

    it('일치 — 몰수 스코어(예: 3-0)는 두 엔진 모두 평범한 결과로 취급한다', () => {
      // 몰수·무효 판정은 두 엔진 **바깥**에 있다. 대회는
      // resolveTournamentFixtureOfficialScore 가 OFFICIAL 이 아닌 리비전(VOID 포함)을
      // null 로 떨어뜨려 픽스처를 아예 빼고, 리그는 league-match-public.service.ts 가
      // VOID 리비전과 cancelled 팀매치를 같은 자리에서 뺀다. 계산기에 도달한 시점에는
      // 양쪽 다 "확정된 스코어 목록"뿐이라 몰수는 일반 승패와 구분되지 않는다.
      const teamIds = ['showed-up', 'no-show'];
      const forfeit: Fixture[] = [{ home: 'showed-up', away: 'no-show', homeScore: 3, awayScore: 0 }];
      expect(competitionOrder({ teamIds, fixtures: forfeit })).toEqual(
        leagueOrder({ teamIds, fixtures: forfeit }),
      );
      expect(competitionOrder({ teamIds, fixtures: forfeit })[0]).toBe('showed-up');
    });
  });

  describe('불일치하는 축 — 수렴하면 확정된 순위가 바뀐다', () => {
    it('불일치 ① 맞대결 우선순위 — 대회는 승점 다음이 맞대결, 리그는 맞대결이 맨 뒤다', () => {
      // alpha 와 bravo 가 승점 4로 동률. 맞대결은 alpha 승(1-0), 전체 골득실은 bravo 우위(+3 vs 0).
      const teamIds = ['alpha', 'bravo', 'charlie', 'delta'];
      const fixtures: Fixture[] = [
        { home: 'alpha', away: 'bravo', homeScore: 1, awayScore: 0 },
        { home: 'alpha', away: 'charlie', homeScore: 0, awayScore: 1 },
        { home: 'alpha', away: 'delta', homeScore: 1, awayScore: 1 },
        { home: 'bravo', away: 'charlie', homeScore: 1, awayScore: 1 },
        { home: 'bravo', away: 'delta', homeScore: 4, awayScore: 0 },
        { home: 'charlie', away: 'delta', homeScore: 2, awayScore: 0 },
      ];

      const competition = competitionOrder({ teamIds, fixtures });
      const league = leagueOrder({ teamIds, fixtures });

      expect(competition).toEqual(['charlie', 'alpha', 'bravo', 'delta']);
      expect(league).toEqual(['charlie', 'bravo', 'alpha', 'delta']);
      expect(competition).not.toEqual(league);

      // 이 축 하나만 보면 리그 설정으로 따라잡을 수 있다 — 맞대결을 앞으로 당기면 같아진다.
      expect(leagueOrder({ teamIds, fixtures, tieBreakOrder: LEAGUE_ORDER_H2H_FIRST })).toEqual(
        competition,
      );
    });

    it('불일치 ② 맞대결 내부 깊이 — 대회는 맞대결 안에서 골득실까지 보고, 리그는 맞대결 승점만 본다', () => {
      // alpha·bravo 승점 3 동률. 맞대결은 1승 1패(승점 동률)지만 맞대결 골득실은 alpha 우위(+1),
      // 전체 골득실은 bravo 우위(-2 vs -3).
      const teamIds = ['alpha', 'bravo', 'charlie'];
      const fixtures: Fixture[] = [
        { home: 'alpha', away: 'bravo', homeScore: 3, awayScore: 1 },
        { home: 'bravo', away: 'alpha', homeScore: 2, awayScore: 1 },
        { home: 'alpha', away: 'charlie', homeScore: 0, awayScore: 4 },
        { home: 'bravo', away: 'charlie', homeScore: 0, awayScore: 1 },
      ];

      const competition = competitionOrder({ teamIds, fixtures });
      expect(competition).toEqual(['charlie', 'alpha', 'bravo']);

      // **설정으로 따라잡을 수 없다.** 리그의 headToHead 는 맞대결 승점 하나만 비교하고
      // 동률이면 곧바로 다음 기준(전체 골득실)으로 넘어간다 — 대회처럼 맞대결 골득실을
      // 보는 단계가 리그 엔진에 아예 없다. 순서를 어떻게 바꿔도 alpha 를 앞세울 수 없다.
      for (const order of [LEAGUE_ORDER_AS_SHIPPED, LEAGUE_ORDER_H2H_FIRST]) {
        expect(leagueOrder({ teamIds, fixtures, tieBreakOrder: order })).toEqual([
          'charlie',
          'bravo',
          'alpha',
        ]);
      }
    });

    it('불일치 ③ 완전 동률 폴백 — 리그는 팀ID 사전순, 대회는 대회마다 달라지는 시드 회전이다', () => {
      const teamIds = ['aaa', 'bbb', 'ccc'];
      const fixtures: Fixture[] = [];

      // 리그: 입력이 같으면 언제나 사전순 하나뿐이다.
      expect(leagueOrder({ teamIds, fixtures })).toEqual(['aaa', 'bbb', 'ccc']);

      // 대회: 같은 입력이라도 tournamentId 가 다르면 순서가 달라진다
      // (sha256(tournamentId:configVersionId:정렬된ID들) 로 사전순 배열을 회전시킨다).
      const ordersBySeed = new Set(
        ['t-0', 't-1', 't-2', 't-3', 't-4', 't-5'].map((tournamentId) =>
          competitionOrder({ teamIds, fixtures, tournamentId }).join(','),
        ),
      );
      expect(ordersBySeed.size).toBeGreaterThan(1);

      // 그리고 최소 한 대회에서는 사전순과 다른 순서가 나온다 = 리그와 불일치.
      expect([...ordersBySeed].some((order) => order !== 'aaa,bbb,ccc')).toBe(true);
    });

    it('불일치 ④ 페어플레이 — 대회에만 있는 기준이라 완전 동률에서 갈림이 다르다', () => {
      const teamIds = ['dirty-team', 'clean-team'];
      const fixtures: Fixture[] = [
        { home: 'dirty-team', away: 'clean-team', homeScore: 1, awayScore: 1 },
      ];
      const fairPlay = new Map([
        ['dirty-team', 9],
        ['clean-team', 0],
      ]);

      // 대회: 벌점이 적은 clean-team 이 앞선다.
      expect(competitionOrder({ teamIds, fixtures, fairPlay })).toEqual(['clean-team', 'dirty-team']);

      // 리그: 페어플레이라는 개념 자체가 없어 사전순 폴백으로 갈린다 — 입력에 벌점을 줄
      // 자리도 없다. 여기서는 사전순이 우연히 같은 답을 주지만, 이름이 반대였다면 갈렸다.
      expect(leagueOrder({ teamIds, fixtures })).toEqual(['clean-team', 'dirty-team']);

      const swapped = ['zz-clean', 'aa-dirty'];
      const swappedFixtures: Fixture[] = [
        { home: 'zz-clean', away: 'aa-dirty', homeScore: 1, awayScore: 1 },
      ];
      const swappedFairPlay = new Map([
        ['zz-clean', 0],
        ['aa-dirty', 9],
      ]);
      expect(
        competitionOrder({ teamIds: swapped, fixtures: swappedFixtures, fairPlay: swappedFairPlay }),
      ).toEqual(['zz-clean', 'aa-dirty']);
      expect(leagueOrder({ teamIds: swapped, fixtures: swappedFixtures })).toEqual([
        'aa-dirty',
        'zz-clean',
      ]);
    });

    it('불일치 ⑤ 승점 규칙 — 대회는 설정값, 리그는 3/1/0 하드코딩이라 리그가 표현하지 못한다', () => {
      // 현재 배포된 대회 설정(FOOTBALL_V1/FUTSAL_V1)은 둘 다 3/1/0 이라 지금 당장은
      // 갈리지 않는다. 하지만 대회 쪽은 승점이 **설정 컬럼**이고 리그 쪽은 상수다 —
      // 리그 엔진으로 수렴하면 이 설정 능력이 사라진다.
      const teamIds = ['three-wins', 'two-wins-three-draws', 'punching-bag'];
      const fixtures: Fixture[] = [
        { home: 'three-wins', away: 'punching-bag', homeScore: 1, awayScore: 0 },
        { home: 'three-wins', away: 'punching-bag', homeScore: 1, awayScore: 0 },
        { home: 'three-wins', away: 'punching-bag', homeScore: 1, awayScore: 0 },
        { home: 'two-wins-three-draws', away: 'punching-bag', homeScore: 1, awayScore: 0 },
        { home: 'two-wins-three-draws', away: 'punching-bag', homeScore: 1, awayScore: 0 },
        { home: 'two-wins-three-draws', away: 'punching-bag', homeScore: 0, awayScore: 0 },
        { home: 'two-wins-three-draws', away: 'punching-bag', homeScore: 0, awayScore: 0 },
        { home: 'two-wins-three-draws', away: 'punching-bag', homeScore: 0, awayScore: 0 },
      ];

      const twoPointWin: CompetitionConfig = {
        ...FUTSAL_V1_CONFIG,
        tieBreak: { ...FUTSAL_V1_CONFIG.tieBreak, points: { win: 2, draw: 1, loss: 0 } },
      };

      // 3/1/0: 두 팀 다 9점 → 골득실로 갈린다(three-wins +3, two-wins-three-draws +2).
      expect(competitionOrder({ teamIds, fixtures })[0]).toBe('three-wins');
      expect(leagueOrder({ teamIds, fixtures })[0]).toBe('three-wins');

      // 2/1/0: three-wins 6점 < two-wins-three-draws 7점 → 대회만 순서가 뒤집힌다.
      expect(competitionOrder({ teamIds, fixtures, config: twoPointWin })[0]).toBe(
        'two-wins-three-draws',
      );
      // 리그는 같은 입력에 대해 승점 규칙을 바꿀 수단이 없어 그대로다.
      expect(leagueOrder({ teamIds, fixtures })[0]).toBe('three-wins');
    });
  });

  describe('수렴 방향을 정할 때 알아야 할 사실', () => {
    it('대회의 tie-break 순서는 설정 가능한 값이 아니다 — 검증기가 정확히 한 배열만 허용한다', () => {
      // competition-config.validator.ts:201-203 이 tieBreak.order 를
      // REQUIRED_TIE_BREAK_ORDER 와 원소 단위로 일치하지 않으면 거부한다. 그리고
      // calculateCompetitionStandings 는 그 배열을 아예 읽지 않고 같은 순서를 코드에
      // 고정해 두고 있다. 즉 순서를 바꿔 넣어도 결과가 달라지지 않는다 — 대회 엔진으로
      // 수렴하면 리그가 지금 갖고 있는 "리그마다 다른 tie-break" 능력이 사라진다.
      const teamIds = ['alpha', 'bravo', 'charlie', 'delta'];
      const fixtures: Fixture[] = [
        { home: 'alpha', away: 'bravo', homeScore: 1, awayScore: 0 },
        { home: 'alpha', away: 'charlie', homeScore: 0, awayScore: 1 },
        { home: 'alpha', away: 'delta', homeScore: 1, awayScore: 1 },
        { home: 'bravo', away: 'charlie', homeScore: 1, awayScore: 1 },
        { home: 'bravo', away: 'delta', homeScore: 4, awayScore: 0 },
        { home: 'charlie', away: 'delta', homeScore: 2, awayScore: 0 },
      ];
      const reordered: CompetitionConfig = {
        ...FUTSAL_V1_CONFIG,
        tieBreak: {
          ...FUTSAL_V1_CONFIG.tieBreak,
          order: ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'],
        },
      };
      expect(competitionOrder({ teamIds, fixtures, config: reordered })).toEqual(
        competitionOrder({ teamIds, fixtures }),
      );
    });

    it('리그 엔진은 played 를, 대회 엔진은 fairPlayPoints 를 각각 상대가 갖지 않은 필드로 낸다', () => {
      // 순위 순서와 무관하지만 화면·API 계약에 영향이 있다. 수렴 시 한쪽 소비처가
      // 참조하던 필드가 사라지지 않도록 여기 못박아 둔다.
      const teamIds = ['alpha', 'bravo'];
      const fixtures: Fixture[] = [{ home: 'alpha', away: 'bravo', homeScore: 1, awayScore: 0 }];

      const competitionRows = calculateCompetitionStandings({
        tournamentId: 'tournament-fixed',
        configVersionId: 'config-fixed',
        registrationIds: teamIds,
        fixtures: fixtures.map((fixture) => ({
          homeRegistrationId: fixture.home,
          awayRegistrationId: fixture.away,
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
        })),
        config: FUTSAL_V1_CONFIG,
      });
      const leagueRows = calculateLeagueStandings({
        teamIds,
        fixtures: fixtures.map((fixture) => ({
          homeTeamId: fixture.home,
          awayTeamId: fixture.away,
          homeScore: fixture.homeScore,
          awayScore: fixture.awayScore,
        })),
        tieBreakOrder: LEAGUE_ORDER_AS_SHIPPED,
      });

      expect(Object.keys(competitionRows[0]).sort()).toEqual([
        'draws',
        'fairPlayPoints',
        'goalsAgainst',
        'goalsFor',
        'losses',
        'points',
        'position',
        'registrationId',
        'wins',
      ]);
      expect(Object.keys(leagueRows[0]).sort()).toEqual([
        'draws',
        'goalsAgainst',
        'goalsFor',
        'losses',
        'played',
        'points',
        'position',
        'teamId',
        'wins',
      ]);
    });
  });
});
