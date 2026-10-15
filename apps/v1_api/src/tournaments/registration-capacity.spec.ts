import { V1CompetitionKind } from '@prisma/client';
import { capacityLimitOf, isCapacityFull } from './registration-capacity';

const league = {
  kind: V1CompetitionKind.regular_league,
  teamCount: 8,
  minPlayers: 1,
  maxPlayers: 20,
};

describe('MD-QA #145 — 참가팀 정원과 선수 정원 분리', () => {
  it.each([null, undefined])('미설정 참가팀 정원 %s은 기존 teamCount와 관계없이 무제한이다', maxTeams => {
    // Given: the historical mirror default and an independent player roster limit.
    const competition = { ...league, maxTeams };
    // When: the real capacity engine evaluates many registered teams.
    const result = { limit: capacityLimitOf(competition), full: isCapacityFull(competition, 25) };
    // Then: neither the historical default nor the player limit becomes a team cap.
    expect(result).toEqual({ limit: null, full: false });
  });

  it.each([
    [2, false],
    [3, true],
    [4, true],
  ] as const)('참가팀 정원 3에서 점유 %i팀의 full 판정은 %s이다', (reservedCount, full) => {
    // Given: a configured participant-team cap.
    const competition = { ...league, maxTeams: 3 };
    // When: the real engine compares the reservation count with that cap.
    const result = { limit: capacityLimitOf(competition), full: isCapacityFull(competition, reservedCount) };
    // Then: exactly the configured boundary closes capacity.
    expect(result).toEqual({ limit: 3, full });
  });

  it.each([1, 50, null])('선수 상한 %s을 바꿔도 참가팀 상한은 바뀌지 않는다', maxPlayers => {
    // Given: the same three-team league with different per-team player limits.
    const competition = { ...league, maxTeams: 3, maxPlayers };
    // When: the real engine reads the participant limit.
    const limit = capacityLimitOf(competition);
    // Then: maxPlayers remains an independent roster contract.
    expect(limit).toBe(3);
  });

  it.each([V1CompetitionKind.regular_tournament, null])('대회 kind=%s은 기존 teamCount 정원을 유지한다', kind => {
    // Given: a tournament or historical pre-kind tournament.
    const competition = { ...league, kind, teamCount: 8, maxTeams: 3 };
    // When: the real engine evaluates its existing capacity contract.
    const result = { limit: capacityLimitOf(competition), full: isCapacityFull(competition, 7) };
    // Then: the new league field does not change tournament capacity.
    expect(result).toEqual({ limit: 8, full: false });
  });
});
