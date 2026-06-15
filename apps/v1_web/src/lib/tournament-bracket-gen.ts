/**
 * 대진 자동 생성 — 순수 페어링 로직 (어드민 대진 빌더에서 사용).
 * mutation/UI와 분리해 단위 테스트 가능하도록 추출.
 */

/**
 * 조별리그 라운드로빈 일정 (circle method).
 * n팀의 모든 비순서 쌍을 정확히 한 번씩, (n-1 또는 n)개 라운드로 배분한다.
 * 홀수면 null 패딩으로 부전승(bye) 처리 — 부전승 쌍은 결과에서 제외한다.
 * @returns 라운드별 [home, away] 쌍 배열
 */
export function roundRobinRounds<T>(teams: T[]): Array<Array<[T, T]>> {
  if (teams.length < 2) return [];
  const numTeams = teams.length;
  const numRounds = numTeams % 2 === 0 ? numTeams - 1 : numTeams;
  const padded: Array<T | null> = numTeams % 2 !== 0 ? [...teams, null] : [...teams];
  const rotList: Array<T | null> = padded.slice(1);
  const rounds: Array<Array<[T, T]>> = [];

  for (let r = 0; r < numRounds; r++) {
    const current: Array<T | null> = [padded[0], ...rotList];
    const half = Math.floor(current.length / 2);
    const pairs: Array<[T, T]> = [];
    for (let i = 0; i < half; i++) {
      const home = current[i];
      const away = current[current.length - 1 - i];
      if (home != null && away != null) pairs.push([home, away]); // bye(null) 제외
    }
    rounds.push(pairs);
    // 회전: 마지막 원소를 맨 앞(고정팀 다음)으로
    rotList.unshift(rotList.pop()!);
  }
  return rounds;
}

/**
 * 녹아웃 시드 페어링: 1 vs N, 2 vs N-1, … (입력은 시드순 정렬된 배열이어야 함).
 * 팀 수가 홀수면 가운데 팀은 부전승(away=null).
 * @returns { home, away } 쌍 배열 (away=null이면 부전승)
 */
export function knockoutSeedPairs<T>(teams: T[]): Array<{ home: T; away: T | null }> {
  const half = Math.ceil(teams.length / 2);
  const out: Array<{ home: T; away: T | null }> = [];
  for (let i = 0; i < half; i++) {
    const home = teams[i];
    const away = teams[teams.length - 1 - i];
    out.push({ home, away: home === away ? null : away });
  }
  return out;
}
