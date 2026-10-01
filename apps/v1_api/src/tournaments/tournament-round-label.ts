/** 조별리그 대진 생성기(`league_r{n}`)와 조 단계 코드가 남긴 라운드 값을 화면 이름으로. 이미 한국어인 값은 그대로. */
export const TOURNAMENT_PHASE_LABEL: Readonly<Record<string, string>> = {
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
  return TOURNAMENT_PHASE_LABEL[trimmed.toLowerCase()] ?? trimmed;
}
