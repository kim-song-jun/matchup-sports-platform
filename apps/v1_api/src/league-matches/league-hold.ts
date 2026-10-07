import type { Prisma } from '@prisma/client';

/**
 * 보류(on_hold) 리그의 경기는 사람에게 알리지 않는다. 보류는 리그를 멈추고 숨기는 것이라, 보류 전에
 * 이미 예약된 리마인더(경기 전날·킥오프·라인업·결과 입력·일정 응답·명단 제출)도 **발화 시점에** 걸러야
 * 한다 — 예약 행을 지우지 않으므로 보류를 풀면 다음 발화부터 다시 나간다. 친선 경기(leagueId null)는
 * 그대로 통과한다.
 */
export const NOT_IN_HELD_LEAGUE_WHERE: Prisma.V1TeamMatchWhereInput = {
  OR: [{ leagueId: null }, { league: { is: { status: { not: 'on_hold' } } } }],
};

/** 이 팀매치가 보류 리그의 경기인가. */
export async function isTeamMatchInHeldLeague(tx: Prisma.TransactionClient, teamMatchId: string): Promise<boolean> {
  return (await tx.v1TeamMatch.count({ where: { id: teamMatchId, league: { is: { status: 'on_hold' } } } })) > 0;
}

/** 이 팀 일정이 보류 리그 경기의 일정인가(리그 경기는 양 팀 일정에 연결된다). */
export async function isScheduleInHeldLeague(tx: Prisma.TransactionClient, scheduleId: string): Promise<boolean> {
  const schedule = await tx.v1TeamSchedule.findUnique({ where: { id: scheduleId }, select: { teamMatchId: true } });
  return schedule?.teamMatchId ? isTeamMatchInHeldLeague(tx, schedule.teamMatchId) : false;
}
