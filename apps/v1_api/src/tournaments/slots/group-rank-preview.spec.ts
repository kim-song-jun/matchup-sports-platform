// apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
import { FOOTBALL_V1_CONFIG, REQUIRED_TIE_BREAK_ORDER } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { withTournamentTieBreakOrder } from '../competition-config/tournament-tie-break-order';
import { drawnTieGroups, resolveStoredGroupRank, resolveGroupRank, summarizeGroupStanding, type GroupRankSource } from './group-rank-preview';

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
    fairPlay?: ReadonlyMap<string, number>;
    tieBreakOrder?: typeof REQUIRED_TIE_BREAK_ORDER;
  } = {},
): GroupRankSource {
  const config = withTournamentTieBreakOrder(FOOTBALL_V1_CONFIG, options.tieBreakOrder ?? null);
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
    config,
    fairPlayByRegistration: options.fairPlay,
  })
    .filter((row) => row.registrationId !== options.dropStandingFor)
    .map((row) => ({ registrationId: row.registrationId, position: row.position, wins: row.wins, draws: row.draws, losses: row.losses, fairPlayPoints: row.fairPlayPoints, recalculatedAt: options.recalculatedAt ?? null }));
  return {
    rule: () => ({ tournamentId: 'tournament-1', configVersionId: 'config-1', config }),
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
// 4팀 조: A>B>C>D 동률 없음.
const FOUR_CLEAN: Result[] = [['A', 'B', 1, 0], ['A', 'C', 1, 0], ['A', 'D', 1, 0], ['B', 'C', 1, 0], ['B', 'D', 1, 0], ['C', 'D', 1, 0]];
// 맞대결을 앞세운 순서는 B>A, 득실차를 앞세운 순서는 A>B 로 갈리는 4팀 조.
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

  it('맞대결로 갈린 두 팀은 동률이 아니다 — 득실이 나빠도 저장 순위 그대로 ready', () => {
    const source = sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE);
    expect([1, 2, 3, 4].map((rank) => resolveGroupRank(source, rank))).toEqual([
      { state: 'ready', registrationId: 'D' },
      { state: 'ready', registrationId: 'B' },
      { state: 'ready', registrationId: 'A' },
      { state: 'ready', registrationId: 'C' },
    ]);
  });

  it('경기가 하나라도 OFFICIAL 이 아니면 모든 순위가 group_incomplete — 전부 확정되면 ready(대조)', () => {
    const pending = sourceOf(['A', 'B', 'C'], CLEAN, { unofficialIndex: 2 });
    for (const rank of [1, 2, 3]) expect(resolveGroupRank(pending, rank)).toEqual({ state: 'group_incomplete' });
    expect(resolveGroupRank(sourceOf(['A', 'B', 'C'], CLEAN), 1)).toEqual({ state: 'ready', registrationId: 'A' });
  });

  it('경기가 하나도 없는 조는 group_incomplete', () => {
    expect(resolveGroupRank({ ...sourceOf(['A', 'B'], []), fixtures: [], standings: [] }, 1)).toEqual({ state: 'group_incomplete' });
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
    it('분리 결선은 상위 진출과 하위 실제 배정을 분리하고 qualification 은 상위만 유지한다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_CLEAN), 2, new Set(['C', 'D']), {
        splitBracket: true,
        placedByTrack: new Map([['lower' as const, new Set(['C', 'D'])]]),
      });
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
      expect(summary?.qualificationByTrack).toEqual({
        upper: { advancingRegistrationIds: ['A', 'B'], undecided: false },
        lower: { advancingRegistrationIds: ['C', 'D'], undecided: false },
      });
    });

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

    it('안쪽 동률이면 일부만 배정돼도 안쪽 동률은 미정이 아니다 — 배정된 팀에 나머지 확정 팀을 더해 진출, undecided 는 false', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_TOP), 2, new Set(['A']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('걸친 동률이면 일부만 배정됐을 때 undecided 가 남는다(대조)', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_MIDDLE), 2, new Set(['A']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A'], undecided: true });
    });

    it('걸친 동률에서 어드민이 동률 팀 하나를 골라 배치했으면 나머지 자리는 확정 팀이 채워 미정이 아니다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_TIE_MIDDLE), 2, new Set(['B']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('맞대결과 득실이 갈린 두 팀은 공동이 아니다 — 저장 순위 그대로 상위 2팀이 진출이고 미정이 아니다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE), 2, none);
      expect(summary?.sharedRankByRegistrationId.size).toBe(0);
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['B', 'D'], undecided: false });
    });

    it('수동 조의 진출 수가 없어도 실제 결선에 배정된 소속 팀은 표시한다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), null, new Set(['C', 'OTHER-GROUP']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['C'], undecided: false });
    });

    it('수동 결선의 실제 선택은 동률에서도 보존하고 미배정 팀을 추측하지 않는다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), null, new Set(['B']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['B'], undecided: false });
    });

    it('수동 결선에 배정해도 원천 조별 결과가 미완료면 표시하지 않는다', () => {
      expect(summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN, { unofficialIndex: 0 }), null, new Set(['A']))).toBeNull();
    });

    it('진출 팀 수도 실제 결선 배정도 없으면 qualification 은 null — sharedRank 는 그대로', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], TIE_THREE), null, none);
      expect(summary?.qualification).toBeNull();
      expect(summary?.sharedRankByRegistrationId.size).toBe(3);
    });

    it('동률 없는 조에서 자리가 일부만 채워졌어도 순위로 확정된 나머지 팀까지 진출이고 undecided 가 아니다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, new Set(['A']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('동률 없는 4팀 조·상위 2팀 진출에서 결선에 1팀만 배치돼도 확정 2팀이 진출이다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C', 'D'], FOUR_CLEAN), 2, new Set(['B']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('다른 조 팀만 배치됐으면 이 조는 아무도 안 들어간 것과 같다 — 상위 N팀 진출(대조)', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, new Set(['OTHER-GROUP']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'B'], undecided: false });
    });

    it('어드민이 자리에 순위와 다른 팀을 넣었으면 그 팀이 먼저 들어가고 남은 자리만 순위 순으로 채운다 — 진출 수를 넘지 않는다', () => {
      const summary = summarizeGroupStanding(sourceOf(['A', 'B', 'C'], CLEAN), 2, new Set(['C']));
      expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['A', 'C'], undecided: false });
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

describe('N개 토너먼트의 공식 저장 순위 추천', () => {
  it('승자승과 득실차 기준이 갈려도 공식 순위와 같은 팀을 반환한다', () => {
    const source = sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE);
    for (const row of source.standings) {
      expect(resolveStoredGroupRank(source, row.position!, [])).toEqual({ state: 'ready', registrationId: row.registrationId });
    }
  });
  it('완전 동률의 저장 시드 순위도 다른 계산기로 재해석하지 않는다', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_THREE);
    const row = source.standings.find(row => row.position === 1)!;
    expect(resolveStoredGroupRank(source, 1, [])).toEqual({ state: 'ready', registrationId: row.registrationId });
  });
  it('공식 결과 미완료·낡은 표·없는 순위는 추측하지 않는다', () => {
    expect(resolveStoredGroupRank(sourceOf(['A', 'B', 'C'], CLEAN, { unofficialIndex: 0 }), 1, [])).toEqual({ state: 'group_incomplete' });
    expect(resolveStoredGroupRank(sourceOf(['A', 'B', 'C'], CLEAN), 4, [])).toEqual({ state: 'group_incomplete' });
    expect(resolveStoredGroupRank(sourceOf(['A', 'B', 'C'], CLEAN, { officialAt: new Date('2026-11-06T01:00:00Z'), recalculatedAt: new Date('2026-11-06T00:00:00Z') }), 1, [])).toEqual({ state: 'group_incomplete' });
  });
});

describe('저장 순위가 추첨으로만 갈린 묶음', () => {
  const bundles = (source: GroupRankSource) => drawnTieGroups(source).map((group) => [...group].sort());

  it('A·B 가 승점·맞대결·득실·득점·페어플레이까지 같으면 한 묶음이고, 그 자리는 tied 로 돌려준다', () => {
    const source = sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND);
    const ties = drawnTieGroups(source);
    expect(bundles(source)).toEqual([['A', 'B']]);
    for (const rank of [1, 2]) {
      const resolution = resolveStoredGroupRank(source, rank, ties);
      expect(resolution.state).toBe('tied');
      expect(resolution.state === 'tied' && [...resolution.tiedRegistrationIds].sort()).toEqual(['A', 'B']);
    }
    expect(resolveStoredGroupRank(source, 3, ties)).toEqual({ state: 'ready', registrationId: 'C' });
  });

  it('동률이 없는 조는 묶음이 없고 모든 자리가 ready 다', () => {
    const source = sourceOf(['A', 'B', 'C'], CLEAN);
    expect(drawnTieGroups(source)).toEqual([]);
    expect(resolveStoredGroupRank(source, 1, [])).toEqual({ state: 'ready', registrationId: 'A' });
  });

  it('페어플레이 벌점이 저장 순위를 갈랐다면 묶음이 아니다 — 같은 경기 결과에서 벌점 유무만 다르다', () => {
    expect(bundles(sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND))).toEqual([['A', 'B']]);
    expect(bundles(sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND, { fairPlay: new Map([['A', 0], ['B', 3]]) }))).toEqual([]);
  });

  it('리그 계산기가 동률로 읽는 순환(맞대결 승자승이 같은 3팀)도 저장 비교기가 완전히 같다고 본 만큼만 묶는다', () => {
    expect(bundles(sourceOf(['A', 'B', 'C'], TIE_THREE))).toEqual([['A', 'B', 'C']]);
    // The league calculator calls these tied, but the stored order separated them by head-to-head.
    expect(bundles(sourceOf(['A', 'B', 'C', 'D'], RULES_DISAGREE))).toEqual([]);
  });

  it('결과가 덜 끝났거나 순위표가 낡았으면 묶음을 만들지 않고 대회 규칙도 읽지 않는다', () => {
    const pending = sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND, { unofficialIndex: 0 });
    const readRule = jest.fn(pending.rule);
    expect(drawnTieGroups({ ...pending, rule: readRule })).toEqual([]);
    expect(readRule).not.toHaveBeenCalled();
    expect(drawnTieGroups(sourceOf(['A', 'B', 'C'], TIE_FIRST_SECOND, { officialAt: new Date('2026-11-06T01:00:00Z'), recalculatedAt: new Date('2026-11-06T00:00:00Z') }))).toEqual([]);
  });
});

describe('대회가 고른 동점 순서와 공개 공동 순위·동률 판정', () => {
  // P, X and Y finish level on 6 points. P lost to both X and Y but won 6-0 twice, so head-to-head puts X and Y
  // above P while goal difference puts P first. X and Y are level on every criterion (a drawn bundle); F1 and F2 are
  // another drawn bundle that sits at 4th–5th under either order.
  const LEVEL_TRIO: Result[] = [
    ['X', 'P', 1, 0], ['Y', 'P', 1, 0], ['X', 'Y', 0, 0],
    ['P', 'F1', 6, 0], ['P', 'F2', 6, 0], ['X', 'F1', 0, 0], ['X', 'F2', 0, 0], ['Y', 'F1', 0, 0], ['Y', 'F2', 0, 0], ['F1', 'F2', 1, 1],
  ];
  const IDS = ['P', 'X', 'Y', 'F1', 'F2'];
  const GOAL_DIFFERENCE_FIRST = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'] as typeof REQUIRED_TIE_BREAK_ORDER;
  const shared = (source: GroupRankSource) => Object.fromEntries([...(summarizeGroupStanding(source, null, new Set())?.sharedRankByRegistrationId ?? [])].sort());
  const positionOf = (source: GroupRankSource, id: string) => source.standings.find((row) => row.registrationId === id)?.position;

  it('기본 순서에서는 맞대결이 앞서 X·Y 가 1~2위, P 가 3위이고 공동 1위는 X·Y 다 — 기존 대회 표시 그대로', () => {
    const source = sourceOf(IDS, LEVEL_TRIO);
    expect(positionOf(source, 'P')).toBe(3);
    expect(shared(source)).toEqual({ F1: 4, F2: 4, X: 1, Y: 1 });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'ready', registrationId: 'P' });
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'tied', tiedRegistrationIds: ['X', 'Y'] });
  });

  it('득실차를 앞세운 대회에서는 P 가 1위가 되고 X·Y 의 공동 순위는 2위로 옮겨 간다 — 공개 표와 어드민 판정이 같은 순서를 쓴다', () => {
    const source = sourceOf(IDS, LEVEL_TRIO, { tieBreakOrder: GOAL_DIFFERENCE_FIRST });
    expect(positionOf(source, 'P')).toBe(1);
    expect(shared(source)).toEqual({ F1: 4, F2: 4, X: 2, Y: 2 });
    expect(resolveGroupRank(source, 1)).toEqual({ state: 'ready', registrationId: 'P' });
    expect(resolveGroupRank(source, 2)).toEqual({ state: 'tied', tiedRegistrationIds: ['X', 'Y'] });
    expect(resolveGroupRank(source, 3)).toEqual({ state: 'tied', tiedRegistrationIds: ['X', 'Y'] });
    expect(drawnTieGroups(source).map((group) => [...group].sort()).sort()).toEqual([['F1', 'F2'], ['X', 'Y']]);
  });

  it('득실차를 앞세운 대회에서 진출선(상위 1팀)은 P 를 확정하고 동률인 X·Y 는 칠하지 않는다', () => {
    const summary = summarizeGroupStanding(sourceOf(IDS, LEVEL_TRIO, { tieBreakOrder: GOAL_DIFFERENCE_FIRST }), 1, new Set());
    expect(summary?.qualification).toEqual({ advancingRegistrationIds: ['P'], undecided: false });
  });
});
