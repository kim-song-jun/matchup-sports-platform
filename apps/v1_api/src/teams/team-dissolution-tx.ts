import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, V1ScheduleState, V1TeamStatus } from '@prisma/client';
import { cascadeCancelTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';
import { classifyTeamMatch, findDissolutionBlockers, loadTeamMatchCandidates } from './team-dissolution';

type Tx = Prisma.TransactionClient;

export type DissolutionActor = { type: 'user'; userId: string } | { type: 'admin'; adminUserId: string };

/** 해체로 취소된 팀 일정에 남기는 사유. 일정 상세에서 팀원에게 그대로 보인다. */
export const TEAM_DISSOLVED_SCHEDULE_REASON = '팀이 해체되어 취소됐어요.';

export type TeamDissolutionOutcome = {
  teamId: string;
  teamName: string;
  dissolvedAt: Date;
  /** 해체 알림을 받을 활성 팀원. 해체한 본인은 뺀다. */
  memberUserIds: string[];
  cancelledTeamMatches: Array<{ teamMatchId: string; title: string; applicantTeamIds: string[] }>;
  withdrawnApplications: Array<{ teamMatchId: string; title: string; hostTeamId: string | null }>;
  expiredJoinApplicantUserIds: string[];
  cancelledInvitationUserIds: string[];
  cancelledScheduleCount: number;
};

function actorFields(actor: DissolutionActor) {
  return actor.type === 'user'
    ? { actorType: 'user' as const, actorUserId: actor.userId }
    : { actorType: 'admin' as const, adminUserId: actor.adminUserId };
}

async function lockTeam(tx: Tx, teamId: string) {
  await tx.$queryRaw`SELECT id FROM v1_teams WHERE id = ${teamId} FOR UPDATE`;
  const team = await tx.v1Team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true, sportId: true, regionId: true, status: true, deletedAt: true },
  });
  if (!team) throw new NotFoundException({ code: 'NOT_FOUND', message: '팀을 찾을 수 없어요.' });
  return team;
}

export function dissolveBlockedError(blockers: Awaited<ReturnType<typeof findDissolutionBlockers>>) {
  return new ConflictException({
    code: 'TEAM_DISSOLVE_BLOCKED',
    message: '끝나지 않은 경기나 대회·리그 참가가 남아 있어 지금은 해체할 수 없어요.',
    details: { blockers },
  });
}

/**
 * 팀을 보관(archived)으로 바꾸고 팀장 혼자 정리할 수 있는 것을 같은 트랜잭션에서 정리한다.
 * 막는 조건은 잠금을 잡은 뒤 다시 본다 — 미리보기와 해체 사이에 상대 팀이 신청을 승인할 수 있다.
 * `logTeamTransition` 은 어드민 경로가 자기 감사 로그로 팀 전이를 남길 때만 끈다.
 */
export async function dissolveTeamInTx(
  tx: Tx,
  input: { teamId: string; actor: DissolutionActor; reason: string; now: Date; logTeamTransition: boolean },
): Promise<TeamDissolutionOutcome> {
  const { teamId, actor, reason, now } = input;
  const team = await lockTeam(tx, teamId);
  if (team.status === 'archived') {
    throw new ConflictException({ code: 'TEAM_ALREADY_DISSOLVED', message: '이미 해체된 팀이에요.' });
  }
  const blockers = await findDissolutionBlockers(tx, teamId, now);
  if (blockers.length > 0) throw dissolveBlockedError(blockers);
  const logActor = actorFields(actor);
  const reviewerUserId = actor.type === 'user' ? actor.userId : null;

  const cancelledTeamMatches: TeamDissolutionOutcome['cancelledTeamMatches'] = [];
  const candidates = await loadTeamMatchCandidates(tx, teamId);
  for (const match of candidates.filter((candidate) => classifyTeamMatch(candidate, teamId, now) === 'auto_cancel')) {
    // 결과 확정과 같은 Game -> TeamMatch 잠금 순서를 지킨다(team-matches.service.ts cancel()).
    await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${match.id} FOR UPDATE`;
    const transition = await tx.v1TeamMatch.updateMany({
      where: { id: match.id, status: { in: ['recruiting', 'closed'] }, deletedAt: null },
      data: { status: 'cancelled', cancelledAt: now },
    });
    if (transition.count !== 1) continue;
    const applicants = await tx.v1TeamMatchApplication.findMany({
      where: { teamMatchId: match.id, status: 'requested' },
      select: { applicantTeamId: true },
    });
    await tx.v1TeamMatchApplication.updateMany({
      where: { teamMatchId: match.id, status: 'requested' },
      data: { status: 'rejected', reviewedByUserId: reviewerUserId, reviewedAt: now },
    });
    await cascadeCancelTeamMatchSchedulesInTx(tx, match.id, TEAM_DISSOLVED_SCHEDULE_REASON);
    await tx.v1StatusChangeLog.create({
      data: { targetType: 'team_match', targetId: match.id, fromStatus: match.status, toStatus: 'cancelled', ...logActor, reason },
    });
    cancelledTeamMatches.push({
      teamMatchId: match.id,
      title: match.title,
      applicantTeamIds: [...new Set(applicants.map((application) => application.applicantTeamId))],
    });
  }

  // 이 팀이 다른 팀매치에 보낸 신청. 남겨 두면 상대가 보관된 팀을 상대로 확정할 수 있다.
  const outgoing = await tx.v1TeamMatchApplication.findMany({
    where: { applicantTeamId: teamId, status: 'requested' },
    select: { id: true, teamMatchId: true, teamMatch: { select: { title: true, hostTeamId: true } } },
  });
  if (outgoing.length > 0) {
    await tx.v1TeamMatchApplication.updateMany({
      where: { id: { in: outgoing.map((application) => application.id) }, status: 'requested' },
      data: { status: 'withdrawn', withdrawnAt: now },
    });
    await tx.v1StatusChangeLog.createMany({
      data: outgoing.map((application) => ({
        targetType: 'team_match_application', targetId: application.id, fromStatus: 'requested', toStatus: 'withdrawn', ...logActor, reason,
      })),
    });
  }

  const joinApplications = await tx.v1TeamJoinApplication.findMany({
    where: { teamId, status: 'requested' },
    select: { id: true, applicantUserId: true },
  });
  if (joinApplications.length > 0) {
    await tx.v1TeamJoinApplication.updateMany({
      where: { id: { in: joinApplications.map((application) => application.id) }, status: 'requested' },
      data: { status: 'expired', reviewedByUserId: reviewerUserId, reviewedAt: now },
    });
    await tx.v1StatusChangeLog.createMany({
      data: joinApplications.map((application) => ({
        targetType: 'team_join_application', targetId: application.id, fromStatus: 'requested', toStatus: 'expired', ...logActor, reason,
      })),
    });
  }

  const invitations = await tx.v1TeamInvitation.findMany({ where: { teamId, status: 'pending' }, select: { id: true, invitedUserId: true } });
  if (invitations.length > 0) {
    await tx.v1TeamInvitation.updateMany({
      where: { id: { in: invitations.map((invitation) => invitation.id) }, status: 'pending' },
      data: { status: 'cancelled' },
    });
  }

  const cancelledScheduleCount = await cancelUpcomingTeamSchedulesInTx(tx, teamId, now);
  await tx.v1ChatRoom.updateMany({ where: { teamId }, data: { status: 'archived' } });
  await tx.v1Team.update({ where: { id: teamId }, data: { status: 'archived', deletedAt: now } });
  if (input.logTeamTransition) {
    await tx.v1StatusChangeLog.create({
      data: { targetType: 'team', targetId: teamId, fromStatus: team.status, toStatus: 'archived', ...logActor, reason },
    });
  }

  const members = await tx.v1TeamMembership.findMany({ where: { teamId, status: 'active' }, select: { userId: true } });
  return {
    teamId,
    teamName: team.name,
    dissolvedAt: now,
    memberUserIds: members.map((member) => member.userId).filter((userId) => actor.type !== 'user' || userId !== actor.userId),
    cancelledTeamMatches,
    withdrawnApplications: outgoing.map((application) => ({
      teamMatchId: application.teamMatchId,
      title: application.teamMatch.title,
      hostTeamId: application.teamMatch.hostTeamId,
    })),
    expiredJoinApplicantUserIds: joinApplications.map((application) => application.applicantUserId),
    cancelledInvitationUserIds: invitations.map((invitation) => invitation.invitedUserId),
    cancelledScheduleCount,
  };
}

/**
 * 앞으로 있을 팀 일정을 취소한다. 팀매치에 묶인 일정은 위에서 팀매치와 함께 이미 취소됐고,
 * 지난 일정은 기록이라 건드리지 않는다. 열린 용병 모집은 일정 취소(cancel())와 같이 닫는다.
 */
async function cancelUpcomingTeamSchedulesInTx(tx: Tx, teamId: string, now: Date): Promise<number> {
  const schedules = await tx.v1TeamSchedule.findMany({
    where: { teamId, state: V1ScheduleState.SCHEDULED, startAt: { gt: now } },
    select: { id: true },
  });
  if (schedules.length === 0) return 0;
  const scheduleIds = schedules.map((schedule) => schedule.id);
  const cancelled = await tx.v1TeamSchedule.updateMany({
    where: { id: { in: scheduleIds }, state: V1ScheduleState.SCHEDULED },
    data: { state: V1ScheduleState.CANCELLED, cancelReason: TEAM_DISSOLVED_SCHEDULE_REASON, version: { increment: 1 } },
  });
  await tx.v1ScheduleGuestRecruitment.updateMany({
    where: { scheduleId: { in: scheduleIds }, state: 'OPEN' },
    data: { state: 'CLOSED', version: { increment: 1 } },
  });
  return cancelled.count;
}

/**
 * 보관된 팀을 되살린다. 해체 때 취소한 경기·일정·신청은 되살리지 않고(상대 팀과 신청자에게 이미
 * 알림이 갔다) 팀 채팅방만 다시 연다. 기간·권한 판정은 호출부(팀장 셀프 / 어드민) 몫이다.
 */
export async function restoreTeamInTx(
  tx: Tx,
  input: {
    teamId: string;
    toStatus: Exclude<V1TeamStatus, 'archived'>;
    guard?: (team: Awaited<ReturnType<typeof lockTeam>>) => void | Promise<void>;
  },
) {
  const team = await lockTeam(tx, input.teamId);
  if (team.status !== 'archived') {
    throw new ConflictException({ code: 'TEAM_NOT_DISSOLVED', message: '해체된 팀이 아니에요.' });
  }
  await input.guard?.(team);
  await tx.v1Team.update({ where: { id: team.id }, data: { status: input.toStatus, deletedAt: null } });
  await tx.v1ChatRoom.updateMany({ where: { teamId: team.id }, data: { status: 'active' } });
  return team;
}

export type DissolutionCleanupPreview = {
  recruitingTeamMatchCount: number;
  outgoingApplicationCount: number;
  joinApplicationCount: number;
  invitationCount: number;
  upcomingSchedules: Array<{ scheduleId: string; title: string; startAt: Date }>;
  notifyMemberCount: number;
};

/** 해체하면 함께 정리될 것의 개수. dissolveTeamInTx 가 실제로 정리하는 범위와 같아야 한다. */
export async function loadDissolutionCleanupPreview(
  db: Tx,
  input: { teamId: string; actorUserId: string; now: Date },
): Promise<DissolutionCleanupPreview> {
  const { teamId, actorUserId, now } = input;
  const [candidates, outgoingApplicationCount, joinApplicationCount, invitationCount, schedules, notifyMemberCount] = await Promise.all([
    loadTeamMatchCandidates(db, teamId),
    db.v1TeamMatchApplication.count({ where: { applicantTeamId: teamId, status: 'requested' } }),
    db.v1TeamJoinApplication.count({ where: { teamId, status: 'requested' } }),
    db.v1TeamInvitation.count({ where: { teamId, status: 'pending' } }),
    db.v1TeamSchedule.findMany({
      where: { teamId, state: V1ScheduleState.SCHEDULED, startAt: { gt: now } },
      select: { id: true, title: true, startAt: true, teamMatchId: true },
      orderBy: { startAt: 'asc' },
    }),
    db.v1TeamMembership.count({ where: { teamId, status: 'active', userId: { not: actorUserId } } }),
  ]);
  const autoCancelIds = new Set(
    candidates.filter((match) => classifyTeamMatch(match, teamId, now) === 'auto_cancel').map((match) => match.id),
  );
  return {
    recruitingTeamMatchCount: autoCancelIds.size,
    outgoingApplicationCount,
    joinApplicationCount,
    invitationCount,
    // 모집 중 팀매치에 묶인 일정은 그 팀매치 취소 한 줄에 이미 들어 있다.
    upcomingSchedules: schedules
      .filter((schedule) => schedule.teamMatchId === null || !autoCancelIds.has(schedule.teamMatchId))
      .map((schedule) => ({ scheduleId: schedule.id, title: schedule.title, startAt: schedule.startAt })),
    notifyMemberCount,
  };
}
