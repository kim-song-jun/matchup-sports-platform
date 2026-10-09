import { Prisma, V1TournamentStatus } from '@prisma/client';
import { unfilledSlotFixtureWhere } from '../common/competition/unfilled-slot-gate';
import { STATUS_BY_LEAGUE_STATE } from '../tournaments/league-competition-mirror';
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
