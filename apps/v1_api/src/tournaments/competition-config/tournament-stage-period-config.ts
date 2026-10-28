import type { Prisma, V1TournamentGroupPhase } from '@prisma/client';
import { competitionStagePhase } from '../tournament-stage-rank';

export async function resolveTournamentFixturePhase(
  tx: Prisma.TransactionClient,
  input: { tournamentId: string; groupId: string | null; round: string },
): Promise<V1TournamentGroupPhase | null> {
  const group = input.groupId === null
    ? null
    : await tx.v1TournamentGroup.findFirst({
        where: { id: input.groupId, tournamentId: input.tournamentId },
        select: { phase: true },
      });
  return competitionStagePhase({ phase: group?.phase, round: input.round });
}

/** 단계 재정의가 없거나 단계를 판별할 수 없으면 대회의 기본 설정을 그대로 쓴다. */
export async function resolveTournamentStageCompetitionConfigVersionId(
  tx: Prisma.TransactionClient,
  input: {
    tournamentId: string;
    groupId: string | null;
    round: string;
    defaultCompetitionConfigVersionId: string;
  },
): Promise<string> {
  const phase = await resolveTournamentFixturePhase(tx, input);
  if (phase === null) return input.defaultCompetitionConfigVersionId;
  const setting = await tx.v1TournamentStagePeriodSetting.findUnique({
    where: { tournamentId_phase: { tournamentId: input.tournamentId, phase } },
    select: { competitionConfigVersionId: true },
  });
  return setting?.competitionConfigVersionId ?? input.defaultCompetitionConfigVersionId;
}
