import { Prisma, V1TournamentStatus } from '@prisma/client';
import { unfilledSlotFixtureWhere } from '../common/competition/unfilled-slot-gate';
import { STATUS_BY_LEAGUE_STATE } from '../tournaments/league-competition-mirror';
import { findTournamentOnSurface } from '../tournaments/tournament-surface-lookup';
import { lockLeagueRowForCompletionInTx } from './league-fixture-generation-guard';
import { LeagueStateValue } from './league-state';

/**
 * Template leagues keep their status until every slot has a team, so a league made only of empty
 * fixtures never shows as in progress. Once no live slot-using fixture has an empty side, promote to
 * the same status `generateFixtures` uses.
 *
 * Only `draft`/`open`/`closed` are promoted; `on_hold`/`completed` are untouched. The status condition
 * on `updateMany` lets only the first committer of concurrent requests win.
 */
const PROMOTABLE_STATUSES: V1TournamentStatus[] = [
  V1TournamentStatus.draft,
  V1TournamentStatus.open,
  V1TournamentStatus.closed,
];

export async function promoteLeagueWhenSlotsFilledInTx(tx: Prisma.TransactionClient, leagueId: string): Promise<boolean> {
  const live = { leagueId, deletedAt: null, status: { not: 'cancelled' as const } };
  const unfilled = await tx.v1TeamMatch.count({ where: { ...live, ...unfilledSlotFixtureWhere() } });
  if (unfilled > 0) return false;
  const slotted = await tx.v1TeamMatch.count({
    where: { ...live, OR: [{ homeSlotId: { not: null } }, { awaySlotId: { not: null } }] },
  });
  if (slotted === 0) return false;

  const result = await tx.v1Tournament.updateMany({
    where: { id: leagueId, kind: 'regular_league', status: { in: PROMOTABLE_STATUSES } },
    data: { status: STATUS_BY_LEAGUE_STATE[LeagueStateValue.active] },
  });
  if (result.count === 0) return false;

  await tx.v1StatusChangeLog.create({
    data: {
      targetType: 'league_match',
      targetId: leagueId,
      fromStatus: LeagueStateValue.draft,
      toStatus: LeagueStateValue.active,
      actorType: 'system',
      reason: 'slots_filled',
    },
  });
  return true;
}

/**
 * 준비 중 리그에서 경기가 시작되거나 결과가 확정되면 진행 중으로 올린다(2026-10-13 사용자 확정). 그대로 두면 공개 화면에
 * '준비 중' 배지와 진행 중·끝난 경기·순위표가 함께 보이고, 그 리그는 자동 종료도 되지 않았다.
 *
 * 상태를 먼저 잠금 없이 읽어 올릴 대상일 때만 리그 행을 기다리지 않고 잠근다 — 호출부가 게임 행을 쥔 채 올 수 있어(경기 →
 * 리그) 리그를 먼저 쥔 재생성·템플릿 교체와 교착하지 않게(잠금이 바쁘면 재시도 가능한 409). 보류·종료 리그는 건드리지 않는다.
 */
export async function promoteLeagueOnGameActivityInTx(
  tx: Prisma.TransactionClient,
  leagueId: string,
  reason: 'game_started' | 'result_confirmed',
): Promise<boolean> {
  const league = await findTournamentOnSurface(tx, ['regular_league'], {
    where: { id: leagueId, deletedAt: null },
    select: { status: true },
  });
  if (league === null || !PROMOTABLE_STATUSES.includes(league.status)) return false;
  await lockLeagueRowForCompletionInTx(tx, leagueId);
  const result = await tx.v1Tournament.updateMany({
    where: { id: leagueId, kind: 'regular_league', status: { in: PROMOTABLE_STATUSES } },
    data: { status: STATUS_BY_LEAGUE_STATE[LeagueStateValue.active] },
  });
  if (result.count === 0) return false;
  await tx.v1StatusChangeLog.create({
    data: {
      targetType: 'league_match',
      targetId: leagueId,
      fromStatus: LeagueStateValue.draft,
      toStatus: LeagueStateValue.active,
      actorType: 'system',
      reason,
    },
  });
  return true;
}
