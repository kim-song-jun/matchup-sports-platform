/** 조별리그 대진 생성기(`league_r{n}`)와 조 단계 코드가 남긴 라운드 값을 화면 이름으로. 이미 한국어인 값은 그대로. */
export const TOURNAMENT_PHASE_LABEL: Readonly<Record<string, string>> = {
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

export function tournamentRoundLabel(round: string): string {
  const trimmed = round.trim();
  const leagueRound = LEAGUE_ROUND.exec(trimmed);
  if (leagueRound !== null) return `조별리그 ${Number(leagueRound[1])}라운드`;
  return TOURNAMENT_PHASE_LABEL[trimmed.toLowerCase()] ?? trimmed;
}

/** 결선 라운드(8강·4강·결승·3·4위전 …)만 조 이름을 붙이지 않는다 — 그 밖(조별·예선·운영자 입력)은 조 이름과 함께 쓴다. */
function isKnockoutRound(round: string): boolean {
  return /^(\d+강|준결승|결승|3·4위전)$/.test(tournamentRoundLabel(round).trim());
}

export interface CompetitionMatchLabelInput {
  groupName?: string | null;
  round: string;
  legNumber?: number | null;
  /** 조 이름이 이미 묶음 머리(조 단위 화면·문구)에 있으면 true — 라운드만 쓴다. */
  withinGroup?: boolean;
}

/**
 * 대회 경기 이름 — "A조 · 조별리그 2라운드"(2026-10-02 사용자 확정). 조가 없거나 결선이면 "4강".
 * `league_r{n}` 은 회전을 넘어 번호가 이어지므로 회전(`legNumber`)을 붙이지 않는다; 결선 2차전만 "4강 2차".
 * 웹 `apps/v1_web/src/lib/tournament-round-label.ts`·`prisma/seed-tournament-round-label.ts` 와 같은 규칙이다 — 바꾸면 셋 다.
 */
export function competitionMatchLabel({ groupName, round, legNumber, withinGroup = false }: CompetitionMatchLabelInput): string {
  const leg = legNumber != null && legNumber > 1 && !LEAGUE_ROUND.test(round.trim()) ? ` ${legNumber}차` : '';
  const roundPart = `${tournamentRoundLabel(round)}${leg}`;
  const group = groupName?.trim() ?? '';
  if (withinGroup || group === '' || isKnockoutRound(round) || group === tournamentRoundLabel(round)) return roundPart;
  return `${group} · ${roundPart}`;
}
