// src/tournaments/tournament-round-label.ts 의 복사본이다. 리그 QA 시드는 배포 이미지 안에서 ts-node 로
// 돌며 seed-alpha-tournament-qa.ts 를 거쳐 이 파일을 읽는데, 그 이미지에는 src/ 가 없다.
// 두 구현이 같은지는 src/tournaments/seed-alpha-tournament-qa.spec.ts 가 단언한다.
export const SEED_TOURNAMENT_PHASE_LABEL: Readonly<Record<string, string>> = {
  group: '조별리그',
  round16: '16강',
  round12: '12강',
  quarter: '8강',
  semi: '4강',
  semifinal: '4강',
  final: '결승',
  third_place: '3·4위전',
};

const LEAGUE_ROUND = /^league_r(\d+)$/;

export function seedTournamentRoundLabel(round: string): string {
  const trimmed = round.trim();
  const leagueRound = LEAGUE_ROUND.exec(trimmed);
  if (leagueRound !== null) return `조별리그 ${Number(leagueRound[1])}라운드`;
  return SEED_TOURNAMENT_PHASE_LABEL[trimmed.toLowerCase()] ?? trimmed;
}

/** 결선 라운드(8강·4강·결승·3·4위전 …)만 조 이름을 붙이지 않는다 — 그 밖(조별·예선·운영자 입력)은 조 이름과 함께 쓴다. */
function isKnockoutRound(round: string): boolean {
  return /^(\d+강|준결승|결승|3·4위전)$/.test(seedTournamentRoundLabel(round).trim());
}

/** src/tournaments/tournament-round-label.ts 의 competitionMatchLabel 복사본. */
export function seedCompetitionMatchLabel({
  groupName,
  round,
  legNumber,
  withinGroup = false,
}: {
  groupName?: string | null;
  round: string;
  legNumber?: number | null;
  withinGroup?: boolean;
}): string {
  const leg = legNumber != null && legNumber > 1 && !LEAGUE_ROUND.test(round.trim()) ? ` ${legNumber}차` : '';
  const roundPart = `${seedTournamentRoundLabel(round)}${leg}`;
  const group = groupName?.trim() ?? '';
  if (withinGroup || group === '' || isKnockoutRound(round) || group === seedTournamentRoundLabel(round)) return roundPart;
  return `${group} · ${roundPart}`;
}
