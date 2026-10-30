import { V1CompetitionKind, type Prisma, type V1TournamentGroupPhase } from '@prisma/client';
import { competitionStagePhase } from '../tournament-stage-rank';

export type FixturePeriodSource = {
  source: 'group' | 'stage' | 'default';
  phase: V1TournamentGroupPhase | null;
  groupName: string | null;
  competitionConfigVersionId: string;
};

/**
 * 경기가 이어받을 피리어드 설정 — 조 재정의 → 단계 재정의 → 대회 기본값 순서다. 경기별 재정의는 이 위에 따로
 * 얹히므로(V1TeamMatch.periodOverride) 여기서 보지 않는다. 단계를 판별할 수 없으면 대회 기본값이다.
 */
export async function resolveTournamentFixturePeriodSource(
  tx: Prisma.TransactionClient,
  input: {
    tournamentId: string;
    groupId: string | null;
    round: string;
    defaultCompetitionConfigVersionId: string;
  },
): Promise<FixturePeriodSource> {
  const group = input.groupId === null
    ? null
    : await tx.v1TournamentGroup.findFirst({
        where: { id: input.groupId, tournamentId: input.tournamentId },
        select: { name: true, phase: true, competitionConfigVersionId: true },
      });
  const phase = competitionStagePhase({ phase: group?.phase, round: input.round });
  const groupName = group?.name ?? null;
  if (group?.competitionConfigVersionId) {
    return { source: 'group', phase, groupName, competitionConfigVersionId: group.competitionConfigVersionId };
  }
  if (phase !== null) {
    const setting = await tx.v1TournamentStagePeriodSetting.findUnique({
      where: { tournamentId_phase: { tournamentId: input.tournamentId, phase } },
      select: { competitionConfigVersionId: true },
    });
    if (setting) return { source: 'stage', phase, groupName, competitionConfigVersionId: setting.competitionConfigVersionId };
  }
  return { source: 'default', phase, groupName, competitionConfigVersionId: input.defaultCompetitionConfigVersionId };
}

export async function resolveTournamentStageCompetitionConfigVersionId(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof resolveTournamentFixturePeriodSource>[1],
): Promise<string> {
  return (await resolveTournamentFixturePeriodSource(tx, input)).competitionConfigVersionId;
}

/** 피리어드를 정하는 위 설정 하나. 그 설정이 바뀌면 이 범위의 시작 전 경기만 따라간다. */
export type PeriodScope =
  | { kind: 'default' }
  | { kind: 'stage'; phase: V1TournamentGroupPhase }
  | { kind: 'group'; groupId: string };

export type FixturePeriodRow = {
  teamMatchId: string;
  phase: V1TournamentGroupPhase | null;
  groupId: string | null;
  groupOverridden: boolean;
  matchOverridden: boolean;
};

/** 대회·리그 경기마다 피리어드를 어디서 받는지 판단할 재료를 읽는다. 리그 경기는 조·단계가 없다. */
export async function loadFixturePeriodRows(
  tx: Prisma.TransactionClient,
  input: { tournamentId: string; kind: V1CompetitionKind | null; ownership: Prisma.V1TeamMatchWhereInput },
): Promise<FixturePeriodRow[]> {
  if (input.kind === V1CompetitionKind.regular_league) {
    const matches = await tx.v1TeamMatch.findMany({ where: input.ownership, select: { id: true, periodOverride: true } });
    return matches.map((match) => ({
      teamMatchId: match.id, phase: null, groupId: null, groupOverridden: false, matchOverridden: match.periodOverride,
    }));
  }
  const details = await tx.v1TournamentMatchDetails.findMany({
    where: { tournamentId: input.tournamentId, teamMatch: { deletedAt: null } },
    select: {
      teamMatchId: true, round: true, groupId: true,
      group: { select: { phase: true, competitionConfigVersionId: true } },
      teamMatch: { select: { periodOverride: true } },
    },
  });
  return details.map((detail) => ({
    teamMatchId: detail.teamMatchId,
    phase: competitionStagePhase({ phase: detail.group?.phase, round: detail.round }),
    groupId: detail.groupId,
    groupOverridden: Boolean(detail.group?.competitionConfigVersionId),
    matchOverridden: detail.teamMatch.periodOverride,
  }));
}

/** 이 위 설정을 따르는 경기인가. 더 좁은 설정(경기 > 조 > 단계)을 가진 경기는 넓은 설정을 따라가지 않는다. */
export function inPeriodScope(row: FixturePeriodRow, scope: PeriodScope, stagePhases: ReadonlySet<V1TournamentGroupPhase>) {
  if (row.matchOverridden) return false;
  if (scope.kind === 'group') return row.groupId === scope.groupId;
  if (row.groupOverridden) return false;
  if (scope.kind === 'stage') return row.phase === scope.phase;
  return row.phase === null || !stagePhases.has(row.phase);
}
