// apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { resolveGroupRank, summarizeGroupStanding, type GroupRankSource } from './group-rank-preview';

type Result = readonly [home: string, away: string, homeScore: number, awayScore: number];

function sourceOf(
  ids: string[],
  results: Result[],
  options: {
    standingsFrom?: Result[];
    dropStandingFor?: string;
    unofficialIndex?: number;
    officialAt?: Date | null;
    recalculatedAt?: Date | null;
  } = {},
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
    .map((row) => ({ registrationId: row.registrationId, position: row.position, wins: row.wins, draws: row.draws, losses: row.losses, recalculatedAt: options.recalculatedAt ?? null }));
  return {
    registrationIds: ids,
    standings,
    fixtures: results.map(([home, away, homeScore, awayScore], index) => ({
      homeRegistrationId: home,
      awayRegistrationId: away,
      official: index === options.unofficialIndex ? null : { homeScore, awayScore },
      officialAt: options.officialAt ?? null,
    })),
  };
}

const CLEAN: Result[] = [['A', 'B', 2, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]];
const TIE_FIRST_SECOND: Result[] = [['A', 'B', 0, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]];
const TIE_THREE: Result[] = [['A', 'B', 1, 0], ['B', 'C', 1, 0], ['C', 'A', 1, 0]];
// 4팀 조: A·B 가 1·2위 완전 동률(승점 7), C·D 는 뚜렷이 3·4위.
const FOUR_TIE_TOP: Result[] = [['A', 'B', 0, 0], ['A', 'C', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 1, 0], ['B', 'D', 1, 0], ['C', 'D', 1, 0]];
// 4팀 조: A 1위, B·C 가 2·3위 완전 동률, D 4위.
const FOUR_TIE_MIDDLE: Result[] = [['A', 'B', 1, 0], ['A', 'C', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 0, 0], ['B', 'D', 1, 0], ['C', 'D', 1, 0]];
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
      fixtures: [...source.fixtures, { homeRegistrationId: null, awayRegistrationId: 'C', official: null, officialAt: null }],
    };
    expect(resolveGroupRank(withHole, 1)).toEqual({ state: 'group_incomplete' });
  });

  it('저장된 순위표가 마지막 확정 결과를 아직 반영하지 못했으면(소화 경기 합이 모자람) group_incomplete', () => {
    const stale = sourceOf(['A', 'B', 'C'], CLEAN, { standingsFrom: CLEAN.slice(0, 2) });
    expect(resolveGroupRank(stale, 1)).toEqual({ state: 'group_incomplete' });
  });

  describe('정정 뒤 낡은 순위표 — 경기 수는 같아도 공식 리비전이 재계산보다 늦으면 group_incomplete', () => {
    const RECALCULATED = new Date('2026-10-01T10:00:00Z');
    const rank1 = (options: { officialAt: Date | null; recalculatedAt: Date | null }) =>
      resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN, options), 1);

    it('officialAt 이 recalculatedAt 보다 뒤면 낡은 표', () => {
      expect(rank1({ officialAt: new Date('2026-10-01T10:00:01Z'), recalculatedAt: RECALCULATED })).toEqual({ state: 'group_incomplete' });
    });

    it('같은 시각은 최신으로 본다 — 앞서거나 같으면 판정한다(대조)', () => {
      for (const officialAt of [RECALCULATED, new Date('2026-10-01T09:59:59Z')]) {
        expect(rank1({ officialAt, recalculatedAt: RECALCULATED })).toEqual({ state: 'ready', registrationId: 'A' });
      }
    });

    it('재계산 시각이 가장 이른 행을 기준으로 삼는다 — 한 팀 행만 낡아도 낡은 표', () => {
      const source = sourceOf(['A', 'B', 'C'], CLEAN, { officialAt: new Date('2026-10-01T10:00:00Z') });
      const mixed = { ...source, standings: source.standings.map((row, index) => ({ ...row, recalculatedAt: new Date(index === 0 ? '2026-10-01T09:00:00Z' : '2026-10-01T11:00:00Z') })) };
      expect(resolveGroupRank(mixed, 1)).toEqual({ state: 'group_incomplete' });
    });

    it('재계산 시각이 없는 옛 행이 있으면 시각 비교를 건너뛰고 경기 수 검사만 한다', () => {
      expect(rank1({ officialAt: new Date('2030-01-01T00:00:00Z'), recalculatedAt: null })).toEqual({ state: 'ready', registrationId: 'A' });
    });

    it('summarizeGroupStanding 도 같은 판정 — 낡은 표는 null', () => {
      const source = sourceOf(['A', 'B', 'C'], CLEAN, { officialAt: new Date('2026-10-01T10:00:01Z'), recalculatedAt: RECALCULATED });
      expect(summarizeGroupStanding(source, 2, new Set())).toBeNull();
    });
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

    it('진출선 안쪽 동률(4팀 조 1·2위, 상위 2팀 진출): 누가 올라가는지는 정해졌으니 둘 다 진출이고 undecided 가 아니다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_TOP), 2, none);
      expect(summary?.sharedRankByRegistrationId.size).toBe(2);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('진출선에 걸친 동률(4팀 조 2·3위, 상위 2팀 진출): 1위만 진출이고 걸친 팀은 칠하지 않으며 undecided 이다(대조)', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_MIDDLE), 2, none);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A'], undecided: true });
    });

    it('3팀 완전 동률에 상위 2팀 진출이면 진출선에 걸쳐 진출 팀 없이 undecided 를 유지한다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), 2, none);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: [], undecided: true });
    });

    it('안쪽 동률이면 일부만 배정돼도 안쪽 동률은 미정이 아니다 — 배정된 팀만 진출이고 undecided 는 false', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_TOP), 2, new Set(['A']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A'], undecided: false });
    });

    it('걸친 동률이면 일부만 배정됐을 때 undecided 가 남는다(대조)', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_MIDDLE), 2, new Set(['A']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A'], undecided: true });
    });

    it('저장 순위와 §5 가 갈린 두 팀이 모두 진출선 안쪽이면(상위 3팀) 둘 다 진출이고 undecided 가 아니다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE), 3, none);
      expect([...(summary?.qualification?.advancingRegistrationIds ?? [])].sort()).toEqual(['A', 'B', 'D']);
      expect(summary?.qualification?.undecided).toBe(false);
    });

    it('저장 순위와 §5 가 갈린 두 팀 중 하나가 진출선 밖이면(상위 2팀) 걸친 것으로 보고 1위만 진출, undecided 이다(대조)', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE), 2, none);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['D'], undecided: true });
    });

    it('§5 순서로는 진출선 안쪽이어도 저장 순위가 선 밖이면 걸친 것이다 — 저장 position 검사가 이 경우를 가른다', () => {
      // §5: D>A>B>C, 저장 순위: A·B·C·D — 1위 자리의 {A, D} 는 D 가 §5 로는 안쪽(0)이지만 저장 순위 4위라 선(3) 밖이다.
      const base = sourceOf(['A', 'B', 'C', 'D'], [['D', 'A', 1, 0], ['D', 'B', 1, 0], ['D', 'C', 1, 0], ['A', 'B', 1, 0], ['A', 'C', 1, 0], ['B', 'C', 1, 0]]);
      const storedOrder = ['A', 'B', 'C', 'D'];
      const source: GroupRankSource = {
        ...base,
        standings: base.standings.map((row) => ({ ...row, position: storedOrder.indexOf(row.registrationId) + 1 })),
      };
      const summary = summarizeGroupStanding(source, 3, none);
      expect([...(summary?.qualification?.advancingRegistrationIds ?? [])].sort()).toEqual(['A', 'B']);
      expect(summary?.qualification?.undecided).toBe(true);
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
