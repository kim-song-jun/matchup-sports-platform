// apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { resolveGroupRank, summarizeGroupStanding, type GroupRankSource } from './group-rank-preview';

type Result = readonly [home: string, away: string, homeScore: number, awayScore: number];

function sourceOf(
  ids: string[],
  results: Result[],
  options: { standingsFrom?: Result[]; dropStandingFor?: string; unofficialIndex?: number } = {},
): GroupRankSource {
  const standings = calculateCompetitionStandings({
    tournamentId: 'tournament-1',
    configVersionId: 'config-1',
    registrationIds: ids,
    fixtures: (options.standingsFrom ?? results).map(([home, away, homeScore, awayScore]) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      homeScore,
      awayScore,
    })),
    config: FOOTBALL_V1_CONFIG,
  })
    .filter((row) => row.registrationId !== options.dropStandingFor)
    .map((row) => ({ registrationId: row.registrationId, position: row.position, wins: row.wins, draws: row.draws, losses: row.losses }));
  return {
    registrationIds: ids,
    standings,
    fixtures: results.map(([home, away, homeScore, awayScore], index) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      official: index === options.unofficialIndex ? null : { homeScore, awayScore },
    })),
  };
}

const CLEAN: Result[] = [['A', 'B', 2, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]];
const TIE_FIRST_SECOND: Result[] = [['A', 'B', 0, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]];
const TIE_THREE: Result[] = [['A', 'B', 1, 0], ['B', 'C', 1, 0], ['C', 'A', 1, 0]];
const TIE_SECOND_THIRD: Result[] = [['A', 'B', 1, 0], ['A', 'C', 1, 0], ['B', 'C', 0, 0]];
// 저장 순위(설정: 승점 → 맞대결)는 B>A, §5(승점 → 득실)는 A>B 로 갈리는 4팀 조.
const RULES_DISAGREE: Result[] = [
  ['B', 'A', 1, 0], ['A', 'C', 4, 0], ['A', 'D', 0, 0], ['B', 'C', 0, 0], ['D', 'B', 1, 0], ['C', 'D', 0, 1],
];

describe('resolveGroupRank', () => {
  it('동률이 없으면 순위별로 ready — 1위 A, 2위 B, 3위 C', () => {
    const source = sourceOf(['A', 'B', 'C'], CLEAN);
    expect([1, 2, 3].map((rank) => resolveGroupRank(source, rank))).toEqual([
      { state: 'ready', registrationId: 'A' },
      { state: 'ready', registrationId: 'B' },
      { state: 'ready', registrationId: 'C' },
    ]);
  });

  it('1·2위 완전 동률: 두 자리 모두 tied(A,B), 구간 밖 3위는 ready 로 남는다(대조)', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND);
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'ready', registrationId: 'C' });
  });

  it('3팀 완전 동률: 세 순위 모두 tied(A,B,C)', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_THREE);
    for (const rank of [1, 2, 3]) {
      expect(resolveGroupRank(source, rank)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B', 'C'] });
    }
  });

  it('2·3위 동률: 1위는 ready, 2위·3위는 tied(B,C) — 진출선(2팀)에 걸친 동률도 자동 배정하지 않는다', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_SECOND_THIRD);
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'ready', registrationId: 'A' });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['B', 'C'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'tied', tiedRegistrationIds: ['B', 'C'] });
  });

  it('저장 순위와 §5 순위가 어긋나면 임의로 믿지 않고 두 팀을 tied 로 넘긴다 — 어긋나지 않는 1·4위는 ready', () => {
    const source = sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE);
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'ready', registrationId: 'D' });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'tied', tiedRegistrationIds: ['A', 'B'] });
    expect(resolveGroupRank(source, 4)).toEqual({ state: 'ready', registrationId: 'C' });
  });

  it('경기가 하나라도 OFFICIAL 이 아니면 모든 순위가 group_incomplete — 전부 확정되면 ready(대조)', () => {
    const pending = sourceOf(['A', 'B', 'C'], CLEAN, { unofficialIndex: 2 });
    for (const rank of [1, 2, 3]) expect(resolveGroupRank(pending, rank)).toEqual({ state: 'group_incomplete' });
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN), 1)).toEqual({ state: 'ready', registrationId: 'A' });
  });

  it('경기가 하나도 없는 조는 group_incomplete', () => {
    expect(resolveGroupRank({ registrationIds: ['A', 'B'], fixtures: [], standings: [] }, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('팀 미정 경기가 섞여 있으면 group_incomplete', () => {
    const source = sourceOf(['A', 'B', 'C'], CLEAN);
    const withHole: GroupRankSource = {
      ...source,
      fixtures: [...source.fixtures, { homeRegistrationId: null, awayRegistrationId: 'C', official: null }],
    };
    expect(resolveGroupRank(withHole, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('저장된 순위표가 마지막 확정 결과를 아직 반영하지 못했으면(소화 경기 합이 모자람) group_incomplete', () => {
    const stale = sourceOf(['A', 'B', 'C'], CLEAN, { standingsFrom: CLEAN.slice(0, 2) });
    expect(resolveGroupRank(stale, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('조 팀 중 순위 행이 없는 팀이 있으면 group_incomplete', () => {
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN, { dropStandingFor: 'C' }), 1)).toEqual({ state: 'group_incomplete' });
  });

  it('조 팀 수보다 큰 순위는 group_incomplete', () => {
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN), 4)).toEqual({ state: 'group_incomplete' });
  });
});

describe('summarizeGroupStanding', () => {
  const none: ReadonlySet<string> = new Set();

  it('3팀 완전 동률: 전원이 같은 sharedRank(묶음 최소 position) 를 가진다', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_THREE);
    const summary = summarizeGroupStanding(source, 2, none);
    expect([...(summary?.sharedRankByRegistrationId ?? [])].sort()).toEqual([['A', 1], ['B', 1], ['C', 1]]);
  });

  it('2·3위만 동률: 그 둘만 공동 2위이고 1위는 맵에 없다(대조)', () => {
    const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_SECOND_THIRD), 2, none);
    expect([...(summary?.sharedRankByRegistrationId ?? [])].sort()).toEqual([['B', 2], ['C', 2]]);
  });

  it('동률이 없으면 sharedRank 맵이 비어 있다', () => {
    expect(summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, none)?.sharedRankByRegistrationId.size).toBe(0);
  });

  it('조가 덜 끝났거나 순위표가 낡았으면 null', () => {
    expect(summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN, { unofficialIndex: 2 }), 2, none)).toBeNull();
    expect(summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN, { standingsFrom: CLEAN.slice(0, 2) }), 2, none)).toBeNull();
  });

  describe('qualification', () => {
    it('결선에 들어간 팀이 있으면 순위와 무관하게 그 팀들이 진출 팀이다 — 다른 조 팀은 무시한다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), 2, new Set(['C', 'B', 'OTHER-GROUP']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['B', 'C'], undecided: false });
    });

    it('동률인데 자리가 일부만 채워졌으면 채운 팀만 진출이고 undecided 이다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), 2, new Set(['B']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['B'], undecided: true });
    });

    it('동률 없는 조도 결선에 들어간 팀을 그대로 따른다(어드민이 직접 고른 경우) — undecided 아님', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, new Set(['A', 'C']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'C'], undecided: false });
    });

    it('아무도 안 들어갔고 경계에 동률이 있으면 순위로 정해진 팀만 진출이고 undecided 이다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_SECOND_THIRD), 2, none);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A'], undecided: true });
    });

    it('아무도 안 들어갔고 동률이 없으면 상위 N팀이 진출이다(지금과 같음)', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, none);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('진출 팀 수가 정해지지 않았으면(advanceCount null) qualification 은 null — sharedRank 는 그대로', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), null, none);
      expect(summary?.qualification).toBeNull();
      expect(summary?.sharedRankByRegistrationId.size).toBe(3);
    });

    it('동률 없는 조에서 자리가 일부만 채워졌으면 채운 팀만 진출이고 undecided 가 아니다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, new Set(['A']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A'], undecided: false });
    });

    it('advanceCount 가 조 팀 수 이상이면 완전 동률이어도 조 전체가 진출이고 undecided 가 아니다', () => {
      for (const placed of [none, new Set(['A'])]) {
        const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), 5, placed);
        expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B', 'C'], undecided: false });
      }
      expect(summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), 3, none)?.qualification?.undecided).toBe(false);
    });

    it('advanceCount 가 조 팀 수보다 크면 조 전체가 진출이다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 5, none);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B', 'C'], undecided: false });
    });
  });
});
