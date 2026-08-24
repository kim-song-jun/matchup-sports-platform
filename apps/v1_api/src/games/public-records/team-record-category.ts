/**
 * D4-a -- 팀 전적 한 건을 리그/대회/친선으로 분류하는 순수 함수.
 *
 * `league-result-stage.ts`의 선례를 따라 판정 로직을 별도 모듈로 뽑아 스펙으로
 * 값 단위 고정한다 -- 서비스 코드에 인라인 삼항으로 흩어지면 SQL의 CASE 식과
 * TS의 분기가 갈릴 위험이 있다(집계 쿼리와 아이템 매핑 양쪽에서 이 판정을 쓴다).
 *
 * 분류 기준(사용자 확정):
 * - `tournamentId` 가 있으면 `tournament` -- 대회의 "리그 방식" 포맷도 이 축에서는
 *   여전히 `tournament` 로 친다(리그 명칭 정책 확정: "정규 리그" ≠ "리그 방식 대회").
 * - `tournamentId` 가 없고 `leagueId` 가 있으면 `league`.
 * - 둘 다 없으면 `friendly`(단발 팀 매치).
 *
 * 스키마상 `V1TeamRecordFact`는 `tournamentId`/`teamMatchId` 중 정확히 하나만
 * 채워진다(`exactly-one-source`, `public-team-records.service.ts` 참조) -- 즉 실제
 * 데이터에서 tournamentId 와 leagueId 가 동시에 채워지는 행은 없다. 그래도 판정
 * 우선순위를 tournamentId 우선으로 고정해 두는 것은, 이 함수가 "두 값이 항상
 * 상호배타적"이라는 스키마 불변식에 몰래 기대지 않고 그 자체로 방어적이게 하기
 * 위함이다.
 */
export type TeamRecordCategory = 'league' | 'tournament' | 'friendly';

export interface TeamRecordCategorySource {
  readonly tournamentId: string | null;
  readonly leagueId: string | null;
}

export function classifyTeamRecordCategory(source: TeamRecordCategorySource): TeamRecordCategory {
  if (source.tournamentId !== null) return 'tournament';
  if (source.leagueId !== null) return 'league';
  return 'friendly';
}
