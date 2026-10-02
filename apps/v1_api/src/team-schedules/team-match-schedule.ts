import { Prisma, V1ScheduleState, V1ScheduleType, V1ScheduleVisibility } from '@prisma/client';

export const MATCH_SCHEDULE_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1_000;

/** Transaction-only entry point; must not import Nest services or GamesService. */
export async function createTeamMatchScheduleInTx(
  tx: Prisma.TransactionClient,
  teamId: string,
  teamMatchId: string,
  title: string,
  startAt: Date,
  endAt: Date | null,
): Promise<void> {
  await tx.v1TeamSchedule.create({ data: {
    teamId, teamMatchId, title, type: V1ScheduleType.MATCH,
    startAt, endAt: endAt ?? new Date(startAt.getTime() + MATCH_SCHEDULE_DEFAULT_DURATION_MS),
    timezone: 'Asia/Seoul', visibility: V1ScheduleVisibility.TEAM,
    state: V1ScheduleState.SCHEDULED, version: 0,
  } });
}
