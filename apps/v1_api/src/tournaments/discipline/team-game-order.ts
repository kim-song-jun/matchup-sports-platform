import type { Prisma } from '@prisma/client';
import { leagueFixtureListOrder, leagueFixtureListWhere } from '../../league-matches/league-fixture-list-source';
import { competitionStageRank } from '../tournament-stage-rank';
import type { OrderedCompetitionGame } from './suspension-verdicts';

type Tx = Prisma.TransactionClient;

export interface CompetitionMatchOrderRow {
  readonly id: string;
  readonly hostTeamId: string | null;
  readonly approvedApplicantTeamId: string | null;
  readonly game: { readonly id: string } | null;
  readonly tournamentDetails?: {
    readonly round: string;
    readonly group: { readonly phase: string } | null;
  } | null;
}

/**
 * 대회 경기를 단계 순서(조별리그 → 결선)로 안정 정렬한다. 같은 단계 안에서는 받은 순서(시각 순)를 유지한다.
 * 정지는 실제 진행 순서에서 소진돼야 하는데 예정 시각은 단계와 어긋나게 저장될 수 있다 —
 * 단계를 먼저 보지 않으면 일찍 잡힌 결승이 조별 경기보다 "다음 경기"가 된다.
 * 단계를 알 수 없는 라운드는 조별 단계와 같은 칸에 둔다.
 */
export function sortByCompetitionStage<T extends CompetitionMatchOrderRow>(rows: readonly T[]): T[] {
  const rank = (row: T) => competitionStageRank({
    phase: row.tournamentDetails?.group?.phase,
    round: row.tournamentDetails?.round ?? '',
  }) ?? 0;
  return rows.map((row) => ({ row, rank: rank(row) })).sort((a, b) => a.rank - b.rank).map(({ row }) => row);
}

/**
 * 대회·리그 전체 경기 순서에서 **그 팀이 뛰는 경기만** 남긴다(Task 179 S1).
 *
 * 정지는 "그 선수 팀의 다음 경기"에서 소진돼야 한다. 전체 순서를 그대로 넘기면 같은 날
 * 다른 팀 경기가 사이에 끼는 순간 정지가 그 경기에서 소진돼 정작 팀의 다음 경기에서
 * 안 걸린다. 팀이 정해지지 않은 사이드(`teamId === null`)는 셀 경기가 없다.
 */
export function narrowToTeamGames(
  rows: readonly CompetitionMatchOrderRow[],
  teamId: string | null,
): OrderedCompetitionGame[] {
  if (teamId === null) return [];
  return rows
    .filter((row) => row.hostTeamId === teamId || row.approvedApplicantTeamId === teamId)
    .map((row) => ({ key: row.id, gameId: row.game?.id ?? null }));
}

const ORDER_SELECT = {
  id: true,
  hostTeamId: true,
  approvedApplicantTeamId: true,
  game: { select: { id: true } },
  tournamentDetails: { select: { round: true, group: { select: { phase: true } } } },
} as const;

/**
 * 출전정지 판정에 넘길 `orderedGames`(key = teamMatchId). 정렬은 각 축의 목록 화면 순서다 —
 * 리그는 `leagueFixtureListOrder`, 대회는 단계(조별리그 → 결선) → 시각 → 라운드 → 대진 번호 → 레그 → id.
 */
export async function loadTeamCompetitionGameOrder(
  tx: Tx,
  input: { competitionId: string; isLeague: boolean; teamId: string | null },
): Promise<OrderedCompetitionGame[]> {
  if (input.teamId === null) return [];
  const rows = input.isLeague
    ? await tx.v1TeamMatch.findMany({
        where: leagueFixtureListWhere(input.competitionId),
        orderBy: leagueFixtureListOrder(),
        select: ORDER_SELECT,
      })
    : await tx.v1TeamMatch.findMany({
        where: { tournamentId: input.competitionId, deletedAt: null },
        orderBy: [
          { startAt: { sort: 'asc', nulls: 'last' } },
          { tournamentDetails: { round: 'asc' } },
          { tournamentDetails: { fixtureNumber: 'asc' } },
          { tournamentDetails: { legNumber: 'asc' } },
          { id: 'asc' },
        ],
        select: ORDER_SELECT,
      });
  return narrowToTeamGames(input.isLeague ? rows : sortByCompetitionStage(rows), input.teamId);
}
