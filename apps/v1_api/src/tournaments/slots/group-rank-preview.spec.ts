// apps/v1_api/src/tournaments/slots/group-rank-preview.spec.ts
import { FOOTBALL_V1_CONFIG } from '../competition-config/competition-config';
import { calculateCompetitionStandings } from '../competition-config/competition-standings';
import { resolveGroupRank, type GroupRankSource } from './group-rank-preview';

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
