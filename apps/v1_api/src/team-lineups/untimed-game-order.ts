import { competitionStageRank } from '../tournaments/tournament-stage-rank';

export interface OrderableTeamMatch {
  readonly id: string;
  readonly tournamentDetails: {
    readonly round: string;
    readonly fixtureNumber: number;
    readonly legNumber: number;
    readonly group: { readonly phase: string } | null;
  } | null;
}

const LEAGUE_ROUND = /^league_r(\d+)$/;

/**
 * 시각이 아직 없는 대회 경기를 대회 안의 진행 순서(단계 → 라운드 → 대진 번호 → 차수 → id)로 놓는다.
 *
 * 단계는 `competitionStageRank` 로 읽고, 단계를 알 수 없는 라운드는 조별 단계와 같은 칸에 둔다
 * (`sortByCompetitionStage` 와 같다). 조별 라운드는 `league_r10` 이 `league_r2` 보다 앞서지 않도록 숫자로 비교한다.
 */
export function orderUntimedByProgress<T extends OrderableTeamMatch>(matches: readonly T[]): T[] {
  return [...matches].sort(compareUntimed);
}

/** 시각 오름차순, 시각 없는 경기는 맨 뒤. 둘 다 없으면 같은 자리라 받은 순서를 지킨다. */
export function compareScheduledAtNullLast(a: Date | null, b: Date | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a.getTime() - b.getTime();
}

function compareUntimed(a: OrderableTeamMatch, b: OrderableTeamMatch): number {
  return (
    stageRank(a) - stageRank(b) ||
    leagueRoundNumber(a) - leagueRoundNumber(b) ||
    (a.tournamentDetails?.round ?? '').localeCompare(b.tournamentDetails?.round ?? '') ||
    (a.tournamentDetails?.fixtureNumber ?? 0) - (b.tournamentDetails?.fixtureNumber ?? 0) ||
    (a.tournamentDetails?.legNumber ?? 0) - (b.tournamentDetails?.legNumber ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

function stageRank(match: OrderableTeamMatch): number {
  const details = match.tournamentDetails;
  return details === null ? 0 : (competitionStageRank({ phase: details.group?.phase, round: details.round }) ?? 0);
}

function leagueRoundNumber(match: OrderableTeamMatch): number {
  const round = LEAGUE_ROUND.exec(match.tournamentDetails?.round.trim() ?? '');
  return round === null ? 0 : Number(round[1]);
}
