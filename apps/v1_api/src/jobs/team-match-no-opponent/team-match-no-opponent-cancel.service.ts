import type { Prisma } from '@prisma/client';
import { isQuietHour } from '../../common/quiet-hours';
import { notificationCopyFor } from '../../notifications/notifications.service';
import type { WebPushService } from '../../notifications/web-push.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { cascadeCancelTeamMatchSchedulesInTx } from '../../team-schedules/team-schedules.service';
import type { ReminderRow } from '../lineup-reminders/game-attendee-reminders';
import { deliverReminderRows } from '../lineup-reminders/lineup-reminder.service';
import type { GameOperationClaim, GameOperationHandler } from '../v1-game-operations-worker.service';

export const TEAM_MATCH_NO_OPPONENT_SCAN_TYPE = 'TEAM_MATCH_NO_OPPONENT_SCAN';

const SCAN_INTERVAL_MS = 5 * 60 * 1000;
/** 한 스캔에서 취소하는 최대 건수. 남은 건은 다음 스캔이 이어서 한다(워커 트랜잭션 시간 한도 안에 끝내려고). */
const SCAN_BATCH_SIZE = 30;
/**
 * 경기 시작이 지났고 이보다 오래전에 끝난 매치는 알림 없이 취소만 한다 — 배포 직후 쌓여 있던 옛 매치 알림이 한꺼번에
 * 나가지 않게. 경기 전인 매치는 마감이 오래전이어도 알린다(팀은 아직 그날을 기다린다).
 */
export const NO_OPPONENT_NOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;
const CANCEL_REASON = 'no_opponent_auto_cancelled';

type MatchState = {
  status: string;
  startAt: Date | null;
  deadlineAt: Date | null;
  approvedApplicantTeamId: string | null;
  leagueId: string | null;
  tournamentId: string | null;
  deletedAt: Date | null;
};

export type NoOpponentVerdict = { cancel: false } | { cancel: true; endedAt: Date; notify: boolean };

/**
 * 상대 팀이 정해지지 않은 채 끝난 일반 팀매치인가(2026-10-21 사용자 결정).
 *
 * 팀매치는 두 팀이 있어야 열린다. 상대가 없는 매치는
 * - 신청 마감 시각이 지났고 대기 중인 신청이 없으면 그때,
 * - 대기 신청이 남아 있으면 팀장이 승인할 수 있게 경기 시작 시각까지 기다렸다가(승인은 시작 전까지 된다)
 * 취소한다. 리그·대회 대진과 이미 상대가 정해진 매치는 대상이 아니다.
 */
export function noOpponentCancelVerdict(match: MatchState, pendingApplications: number, now: Date): NoOpponentVerdict {
  if (match.leagueId !== null || match.tournamentId !== null || match.deletedAt !== null) return { cancel: false };
  if ((match.status !== 'recruiting' && match.status !== 'closed') || match.approvedApplicantTeamId !== null) {
    return { cancel: false };
  }
  const ends = [
    match.deadlineAt !== null && match.deadlineAt <= now && pendingApplications === 0 ? match.deadlineAt : null,
    match.startAt !== null && match.startAt <= now ? match.startAt : null,
  ].filter((at): at is Date => at !== null);
  if (ends.length === 0) return { cancel: false };
  const endedAt = new Date(Math.min(...ends.map((at) => at.getTime())));
  // 창을 마감 시각으로만 재면 배포·워커 장기 중단 뒤 "마감은 오래전·경기는 며칠 뒤"인 매치가 조용히 사라진다.
  const upcoming = match.startAt !== null && match.startAt > now;
  return { cancel: true, endedAt, notify: upcoming || now.getTime() - endedAt.getTime() <= NO_OPPONENT_NOTIFY_WINDOW_MS };
}

/**
 * 상대 없이 끝난 팀매치를 취소한다. 행은 지우지 않고 상태만 `cancelled` 로 바꿔 공개 목록에서 빠지게 한다.
 *
 * - 1팀(일반 팀매치의 만든 팀, 플랫폼 주관 매치의 먼저 승인된 팀): 그 팀 팀장·매니저에게 취소를, 대기 중이던
 *   신청 팀 팀장·매니저에게 신청 종료를 알린다.
 * - 0팀(아무 팀도 승인되지 않은 플랫폼 주관 매치): 알릴 팀이 없어 취소만 한다.
 *
 * 마감 시각은 매치마다 달라 예약보다 주기 스캔이 맞다 — 라인업 리마인더처럼 스캔이 끝날 때 다음 스캔을 outbox 행으로
 * 예약한다(`scheduleNextNoOpponentScan`). 일정·마감을 바꾸는 경로가 예약을 다시 걸 필요가 없다.
 */
export class TeamMatchNoOpponentCancelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush?: WebPushService,
  ) {}

  /** 다음 스캔 예약을 스캔과 다른 트랜잭션으로 먼저 커밋한다 — 스캔이 실패해도 체인이 끊기지 않는다(lineup-reminder 와 같은 이유). */
  readonly scanHandler: GameOperationHandler = async (claim, tx) => {
    const now = new Date();
    await this.prisma.$transaction((scheduleTx) => scheduleNextNoOpponentScan(scheduleTx, now));
    const candidates = await tx.v1TeamMatch.findMany({
      where: {
        leagueId: null,
        tournamentId: null,
        deletedAt: null,
        approvedApplicantTeamId: null,
        status: { in: ['recruiting', 'closed'] },
        // 대기 신청이 남은 매치는 시작 시각 전까지 후보가 아니다 — 매 스캔 자리를 차지하지 않게 쿼리에서 거른다.
        OR: [{ startAt: { lte: now } }, { deadlineAt: { lte: now }, applications: { none: { status: 'requested' } } }],
      },
      select: { id: true },
      orderBy: [{ deadlineAt: 'asc' }, { id: 'asc' }],
      take: SCAN_BATCH_SIZE,
    });
    for (const { id } of candidates) {
      await this.cancelIfNoOpponent(tx, id, now, claim);
    }
  };

  private async cancelIfNoOpponent(tx: Prisma.TransactionClient, teamMatchId: string, now: Date, claim: GameOperationClaim) {
    // 팀장 취소·삭제와 같은 잠금 순서(게임 → 팀매치). 승인도 팀매치 행을 잠그므로 승인과 겹치면 하나만 이긴다.
    await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${teamMatchId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${teamMatchId} FOR UPDATE`;
    const match = await tx.v1TeamMatch.findUnique({
      where: { id: teamMatchId },
      select: {
        title: true,
        status: true,
        startAt: true,
        deadlineAt: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        leagueId: true,
        tournamentId: true,
        deletedAt: true,
      },
    });
    if (match === null) return;
    const pending = await tx.v1TeamMatchApplication.findMany({
      where: { teamMatchId, status: 'requested' },
      select: { applicantTeamId: true },
    });
    const verdict = noOpponentCancelVerdict(match, pending.length, now);
    if (!verdict.cancel) return;

    await tx.v1TeamMatch.update({ where: { id: teamMatchId }, data: { status: 'cancelled', cancelledAt: now } });
    await tx.v1TeamMatchApplication.updateMany({
      where: { teamMatchId, status: 'requested' },
      data: { status: 'expired', reviewedAt: now },
    });
    await cascadeCancelTeamMatchSchedulesInTx(tx, teamMatchId, CANCEL_REASON);
    await tx.v1Game.updateMany({ where: { teamMatchId, state: 'SCHEDULED' }, data: { state: 'CANCELLED', version: { increment: 1 } } });
    await tx.v1StatusChangeLog.create({
      data: {
        targetType: 'team_match',
        targetId: teamMatchId,
        fromStatus: match.status,
        toStatus: 'cancelled',
        actorType: 'system',
        reason: CANCEL_REASON,
      },
    });

    // 0팀(승인된 팀이 없는 플랫폼 주관 매치)은 알릴 팀이 없다. 오래전에 끝난 매치도 알리지 않는다.
    if (!verdict.notify || match.hostTeamId === null) return;
    const rows = [
      ...(await this.managerRows(tx, [match.hostTeamId], teamMatchId, `상대 팀이 정해지지 않아 "${match.title}" 팀매치가 취소됐어요.`)),
      ...(await this.managerRows(
        tx,
        pending.map((application) => application.applicantTeamId),
        teamMatchId,
        `"${match.title}" 팀매치가 취소되어 대기 중이던 신청이 종료됐어요.`,
      )),
    ];
    await deliverReminderRows(tx, rows, { prefField: 'teamMatchEnabled', webPush: this.webPush, claim, push: !isQuietHour(now) });
  }

  private async managerRows(tx: Prisma.TransactionClient, teamIds: string[], teamMatchId: string, body: string): Promise<ReminderRow[]> {
    if (teamIds.length === 0) return [];
    const copy = notificationCopyFor('team_match_cancelled', 'team_match', teamMatchId);
    const managers = await tx.v1TeamMembership.findMany({
      where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    return managers.map(({ userId }) => ({
      userId,
      targetType: 'team_match',
      targetId: teamMatchId,
      title: copy.title,
      body,
      deepLink: copy.deepLink,
      businessKey: `team-match-no-opponent:${teamMatchId}:${userId}`,
    }));
  }
}

/** 다음 스캔을 5분 슬롯 경계에 예약한다. 슬롯 키가 같으면 행이 하나만 생겨 재시도·워커 다중화에도 안전하다. */
export async function scheduleNextNoOpponentScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const nextSlot = new Date(Math.floor(now.getTime() / SCAN_INTERVAL_MS) * SCAN_INTERVAL_MS + SCAN_INTERVAL_MS);
  await tx.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `team-match-no-opponent-scan:${nextSlot.toISOString()}`,
        aggregateType: 'TEAM_MATCH',
        aggregateId: 'no-opponent-scan',
        type: TEAM_MATCH_NO_OPPONENT_SCAN_TYPE,
        payload: { scheduledFor: nextSlot.toISOString() },
        availableAt: nextSlot,
      },
    ],
    skipDuplicates: true,
  });
}
