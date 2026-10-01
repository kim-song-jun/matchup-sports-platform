/**
 * 대회 대진의 `round` 원값을 화면 이름으로 — 조별리그 대진 생성기가 남기는 `league_r{n}` 과 단계 코드.
 * 운영자가 한국어로 넣은 값과 모르는 값은 그대로 둔다.
 * 서버 `apps/v1_api/src/tournaments/tournament-round-label.ts`(알림·할 일 문구)와 같은 규칙이다 — 바꾸면 둘 다.
 */
const PHASE_LABEL: Readonly<Record<string, string>> = {
  group: '조별리그',
  quarter: '8강',
  semi: '4강',
  semifinal: '4강',
  final: '결승',
  third_place: '3·4위전',
};

export function tournamentRoundLabel(round: string): string {
  const trimmed = round.trim();
  const leagueRound = /^league_r(\d+)$/.exec(trimmed);
  if (leagueRound !== null) return `조별리그 ${Number(leagueRound[1])}라운드`;
  return PHASE_LABEL[trimmed.toLowerCase()] ?? trimmed;
}
