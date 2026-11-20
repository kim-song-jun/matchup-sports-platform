import type { V1TournamentFixture } from '@/types/api';

/**
 * 3팀 토너먼트(2·3위가 준결승 1경기를 치르고 1위는 부전승으로 결승, 3·4위전 없음)의 3위 — 준결승에서 진 팀.
 * 토너먼트의 결승 이전 경기가 정확히 1개일 때만 3팀 대진이다. 4팀 이상 대진의 준결승 패자는 3·4위전이 가르거나
 * (3·4위전이 없으면) 아직 정한 순위가 없어서 여기서 정하지 않는다.
 * `entries` 는 그 토너먼트의 모든 결선 경기(끝나지 않은 경기 포함)와 소속 단계(phase)다.
 */
export function threeTeamBracketThird(
  entries: ReadonlyArray<{ phase: string; fixture: V1TournamentFixture }>,
): string | null {
  if (entries.some((entry) => entry.phase === 'third_place')) return null;
  const beforeFinal = entries.filter((entry) => entry.phase !== 'final');
  if (beforeFinal.length !== 1) return null;
  const { fixture } = beforeFinal[0];
  const result = fixture.result;
  if (fixture.status !== 'completed' || result === null) return null;
  const { homeScore, awayScore, hasPenalty, homePenaltyScore, awayPenaltyScore } = result;
  const [home, away] = hasPenalty && homePenaltyScore !== null && awayPenaltyScore !== null
    ? [homePenaltyScore, awayPenaltyScore]
    : [homeScore, awayScore];
  if (home === away) return null;
  return (home > away ? fixture.awayTeamName : fixture.homeTeamName) ?? null;
}
