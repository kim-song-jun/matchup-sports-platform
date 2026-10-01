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

const LEAGUE_ROUND = /^league_r(\d+)$/;

export function tournamentRoundLabel(round: string): string {
  const trimmed = round.trim();
  const leagueRound = LEAGUE_ROUND.exec(trimmed);
  if (leagueRound !== null) return `조별리그 ${Number(leagueRound[1])}라운드`;
  return PHASE_LABEL[trimmed.toLowerCase()] ?? trimmed;
}

/** 생성기 키(`league_r{n}`)·시드(`group`)·어드민 직접 입력(`조별 N라운드`). 결선 조("4강" 조)의 라운드는 여기 걸리지 않는다. */
function isGroupStageRound(round: string): boolean {
  const trimmed = round.trim();
  return LEAGUE_ROUND.test(trimmed) || trimmed.toLowerCase() === 'group' || trimmed.startsWith('조별');
}

export type CompetitionMatchLabelInput = {
  groupName?: string | null;
  round: string;
  legNumber?: number | null;
  /** 조 이름이 이미 묶음 머리에 있으면 true — 라운드만 쓴다. */
  withinGroup?: boolean;
};

/**
 * 대회 경기 이름 — "A조 · 조별리그 2라운드"(2026-10-02 사용자 확정). 조가 없거나 결선이면 "4강".
 * `league_r{n}` 은 회전을 넘어 번호가 이어지므로 회전(`legNumber`)을 붙이지 않는다; 결선 2차전만 "4강 2차".
 * 서버 `competitionMatchLabel`·시드 복사본과 같은 규칙이다 — 바꾸면 셋 다.
 */
export function competitionMatchLabel({ groupName, round, legNumber, withinGroup = false }: CompetitionMatchLabelInput): string {
  const leg = legNumber != null && legNumber > 1 && !LEAGUE_ROUND.test(round.trim()) ? ` ${legNumber}차` : '';
  const roundPart = `${tournamentRoundLabel(round)}${leg}`;
  const group = groupName?.trim() ?? '';
  if (withinGroup || group === '' || !isGroupStageRound(round)) return roundPart;
  return `${group} · ${roundPart}`;
}
