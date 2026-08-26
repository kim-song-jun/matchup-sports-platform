/**
 * 대진 자동 생성 — 순수 페어링 로직 (어드민 대진 빌더에서 사용).
 * mutation/UI와 분리해 단위 테스트 가능하도록 추출.
 *
 * 조별리그 라운드로빈 생성(구 circle-method 순수함수)은 서버 단일 소스로 이관했다
 * (`POST /admin/tournaments/:id/league/fixtures/generate`) — 프론트 순수함수는 삭제.
 */

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
