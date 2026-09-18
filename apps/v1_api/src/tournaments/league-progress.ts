export interface LeagueProgress {
  total: number;
  played: number;
  remaining: number;
  /** 0~100 정수. 반올림한다. */
  percent: number;
}

export function leagueProgressOf(fixtures: ReadonlyArray<{ hasResult: boolean }>): LeagueProgress {
  const total = fixtures.length;
  const played = fixtures.filter((fixture) => fixture.hasResult).length;
  return {
    total,
    played,
    remaining: total - played,
    percent: total === 0 ? 0 : Math.round((played / total) * 100),
  };
}

export interface MagicNumber {
  registrationId: string;
  /** 우승 확정까지 필요한 승점. 0 이하이면 확정. */
  value: number;
  clinched: boolean;
}

/**
 * 1위가 우승을 확정하기까지 필요한 승점.
 *
 * 2위뿐 아니라 3위 이하 전 팀의 "잔여 경기 전승 시 최대 도달 승점"을 함께 본다 —
 * 소화 경기 수가 팀마다 다른 리그(정규 라운드가 불균등하게 진행 중이거나 다조 리그를
 * 한 표로 합친 경우)에서는 잔여 경기가 많은 하위 팀이 2위보다 높은 최대치를 가질 수
 * 있기 때문이다. 그중 최댓값(challengerMax)을 진짜 도전자로 취급한다.
 *
 * 동점 시 tie-break로 갈리는 경우까지 엄밀히 반영하지 않고 +1 로 보수적으로 계산한다 —
 * "확정"이라고 표시했다가 뒤집히는 것보다 확정을 늦게 표시하는 쪽이 안전하다.
 */
export function magicNumberOf(
  standings: ReadonlyArray<{ registrationId: string; points: number }>,
  remainingByRegistration: ReadonlyMap<string, number>,
  winPoints: number,
): MagicNumber | null {
  if (standings.length < 2) return null;
  const [leader, ...challengers] = standings;
  const challengerMax = Math.max(
    ...challengers.map(
      (challenger) => challenger.points + (remainingByRegistration.get(challenger.registrationId) ?? 0) * winPoints,
    ),
  );
  const value = Math.max(challengerMax - leader.points + 1, 0);
  return { registrationId: leader.registrationId, value, clinched: value === 0 };
}
