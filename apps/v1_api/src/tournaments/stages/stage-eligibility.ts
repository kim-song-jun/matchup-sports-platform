import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { loadStageView, type StoredStagePlan } from './stage-view';
export async function assertStageFixtureReady(tx: Prisma.TransactionClient, teamMatchId: string) {
  const detail = await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId }, select: { tournamentId: true, group: { select: { stageKey: true, poolKey: true } } } });
  if (!detail?.group?.stageKey) return;
  const tournament = await tx.v1Tournament.findUnique({ where: { id: detail.tournamentId }, select: { stagePlan: true } });
  if (!tournament?.stagePlan) throw new ConflictException({ code: 'STAGE_PLAN_REQUIRED', message: '단계형 대회 구성을 확인해 주세요.' });
  const config = tournament.stagePlan as unknown as StoredStagePlan;
  const view = await loadStageView(tx, detail.tournamentId, config);
  const pool = view.pools.find(p => p.key === detail.group?.poolKey);
  if (!pool || !pool.assigned || pool.stale || !config.assignments?.[pool.key]) throw new ConflictException({ code: 'STAGE_ASSIGNMENT_REQUIRED', message: '참가팀 배정을 확정해 주세요. 이전 단계 결과가 바뀌었다면 진출팀을 다시 확인해야 해요.' });
}
