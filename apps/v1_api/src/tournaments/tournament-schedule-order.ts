import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { competitionStageRank } from './tournament-stage-rank';
import { TOURNAMENT_PHASE_LABEL, tournamentRoundLabel } from './tournament-round-label';

type Tx = Prisma.TransactionClient;

const STAGE_SELECT = { round: true, group: { select: { phase: true } } } as const;

function stageLabel(phase: string | null | undefined, round: string): string {
  return (phase == null ? undefined : TOURNAMENT_PHASE_LABEL[phase]) ?? tournamentRoundLabel(round);
}

type Stage = { phase: string | null | undefined; round: string };

async function assertStartKeepsStageOrder(
  tx: Tx,
  input: { tournamentId: string; excludeTeamMatchId: string | null; stage: Stage; startAt: Date },
): Promise<void> {
  const selfRank = competitionStageRank(input.stage);
  if (selfRank === null) return;
  const others = await tx.v1TeamMatch.findMany({
    where: {
      tournamentId: input.tournamentId, deletedAt: null, startAt: { not: null }, tournamentDetails: { isNot: null },
      ...(input.excludeTeamMatchId === null ? {} : { id: { not: input.excludeTeamMatchId } }),
    },
    select: { startAt: true, tournamentDetails: { select: STAGE_SELECT } },
  });
  for (const other of others) {
    if (other.startAt === null || other.tournamentDetails === null) continue;
    const otherRank = competitionStageRank({ phase: other.tournamentDetails.group?.phase, round: other.tournamentDetails.round });
    if (otherRank === null) continue;
    const startsTooEarly = otherRank < selfRank && input.startAt.getTime() < other.startAt.getTime();
    const startsTooLate = otherRank > selfRank && input.startAt.getTime() > other.startAt.getTime();
    if (startsTooEarly || startsTooLate) {
      const mine = stageLabel(input.stage.phase, input.stage.round);
      const theirs = stageLabel(other.tournamentDetails.group?.phase, other.tournamentDetails.round);
      throw new ConflictException({
        code: 'FIXTURE_SCHEDULE_STAGE_ORDER',
        message: startsTooEarly
          ? `${mine} 경기는 ${theirs} 경기보다 늦게 시작해야 해요. 단계 순서에 맞게 시각을 정해 주세요.`
          : `${mine} 경기는 ${theirs} 경기보다 먼저 시작해야 해요. 단계 순서에 맞게 시각을 정해 주세요.`,
      });
    }
  }
}

/**
 * 새 시작 시각이 대회 단계 순서(조별리그 → 결선)를 뒤집으면 막는다. 이미 저장된 시각을 그대로 두는
 * 요청은 통과시킨다 — 어긋난 일정을 가진 대회도 다른 항목은 고칠 수 있어야 한다.
 * 단계를 알 수 없는 라운드와 시각이 없는 경기는 비교하지 않는다.
 */
export async function assertFixtureScheduleKeepsStageOrder(
  tx: Tx,
  input: { tournamentId: string; teamMatchId: string; startAt: Date | null },
): Promise<void> {
  if (input.startAt === null) return;
  const self = await tx.v1TeamMatch.findFirst({
    where: { id: input.teamMatchId, tournamentId: input.tournamentId },
    select: { startAt: true, tournamentDetails: { select: STAGE_SELECT } },
  });
  if (self === null || self.tournamentDetails === null) return;
  if (self.startAt?.getTime() === input.startAt.getTime()) return;
  await assertStartKeepsStageOrder(tx, {
    tournamentId: input.tournamentId,
    excludeTeamMatchId: input.teamMatchId,
    stage: { phase: self.tournamentDetails.group?.phase, round: self.tournamentDetails.round },
    startAt: input.startAt,
  });
}

/** 새로 만드는 경기용: 아직 저장 전이라 자기 자신을 뺄 필요가 없고 단계는 요청 값에서 온다. */
export async function assertNewFixtureScheduleKeepsStageOrder(
  tx: Tx,
  input: { tournamentId: string; phase: string | null | undefined; round: string; startAt: Date | null },
): Promise<void> {
  if (input.startAt === null) return;
  await assertStartKeepsStageOrder(tx, {
    tournamentId: input.tournamentId, excludeTeamMatchId: null, stage: { phase: input.phase, round: input.round }, startAt: input.startAt,
  });
}
