/**
 * 표준 경쟁 순위(1,1,3 — 동점은 같은 등수, 다음 등수는 동점자 수만큼 건너뜀).
 *
 * 원래 리그 순위 화면(league-match-standings-client.tsx)의 로컬 함수였는데, 대회
 * 개인 랭킹(STATS-1)이 같은 규칙을 쓰면서 앱 라우트의 큰 client 컴포넌트를
 * cross-import 하지 않도록 lib으로 올렸다(리뷰 지적 — 프레젠테이셔널 컴포넌트
 * 번들에 라우트 의존이 따라 들어온다). 리그 쪽은 re-export로 기존 소비처를
 * 그대로 유지한다.
 *
 * 배열 인덱스+1을 등수로 쓰면 공동 순위가 사라진다 — 5골인 두 선수가
 * "1위 / 2위"로 갈려 공동 1위가 뒤처진 것처럼 읽힌다. 응답 배열은 값 내림차순
 * 정렬로 온다는 전제(기존 index+1 표기도 같은 전제를 썼다).
 */
export function competitionRanks(values: number[]): number[] {
  const ranks: number[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;
  values.forEach((value, index) => {
    if (previousValue === null || value !== previousValue) {
      previousRank = index + 1;
      previousValue = value;
    }
    ranks.push(previousRank);
  });
  return ranks;
}
