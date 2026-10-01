import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CompetitionRosterCheck, LineupTodo, LineupTodoService } from '../../team-lineups/lineup-todo.service';
import type { WebPushService } from '../../notifications/web-push.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GameOperationClaim, GameOperationHandler } from '../v1-game-operations-worker.service';
import {
  collectAttendeeReminderRows,
  KICKOFF_REMINDER_LEAD_MS,
  kickoffReminderKey,
  type ReminderRow,
} from './game-attendee-reminders';
import { formatKstMonthDayTime } from '../../common/kst-datetime';
import {
  isEveningCutoffScan,
  isQuietHour,
  kstMidnight,
  kstParts,
  nightPushAllowed,
  quietHoursEndAfter,
} from '../../common/quiet-hours';
import { notificationCopyFor } from '../../notifications/notifications.service';

const deliveryLogger = new Logger('LineupReminderDelivery');

/** 스캔 주기. 슬롯 경계로 정규화해 재예약 키를 만들기 때문에, 재시도가 겹쳐도 같은
 * 슬롯에는 outbox 행이 하나만 생긴다. */
const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** 최종 확인 알림을 보내는 창 — 킥오프 2시간 전부터 킥오프까지. */
const FINAL_REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;

/** 킥오프가 지난 미제출 안내(Task 180 H5) 창 — 스캔이 15분 주기라 30분이면 스캔 하나를 놓쳐도 다음 스캔이 보낸다. */
const KICKOFF_MISSING_WINDOW_MS = 30 * 60 * 1000;

export const LINEUP_REMINDER_SCAN_TYPE = 'LINEUP_REMINDER_SCAN';

type ReminderMessage = {
  targetId: string;
  title: string;
  body: string;
  deepLink: string;
  /** 이 알림을 유일하게 식별하는 접두사. 수신자 id를 붙여 최종 businessKey가 된다. */
  keyPrefix: string;
};

/**
 * 친선 팀매치 참석명단을 아직 넣지 않은 팀에게 알리고, 대회·리그 경기는 전날 양 팀
 * owner·manager 에게 "명단 확인"을 한 번 보낸다(Task 179 R1 — 대회·리그 명단은 계산되므로
 * 제출 재촉이 없다). 출전자에게는 전날 일정과 킥오프 2시간 전 알림을 보낸다(Task 180 G7,
 * `game-attendee-reminders.ts`).
 *
 * **왜 예약이 아니라 주기 스캔인가.** 대회 일정은 운영 중에 바뀐다(경기 시간 조정, 대진
 * 확정 지연). 미리 T-24h 같은 시점에 발송을 예약해두면 일정이 바뀔 때마다 예약을
 * 취소·재생성해야 하고, 일정을 바꾸는 경로 중 하나라도 그걸 빠뜨리면 알림이 엉뚱한
 * 시간에 간다. 스캔은 언제나 **지금의** 일정을 보고 판단하므로 그런 동기화가 아예
 * 필요 없다.
 *
 * **하루 한 번을 어떻게 보장하는가.** 발송 이력 테이블을 따로 두지 않는다. 알림의
 * `businessKey`에 한국 날짜(명단 확인은 경기·팀)를 박는다(`V1Notification.businessKey`는
 * unique) — 같은 키로 두 번째 행을 만드는 일이 DB 수준에서 불가능하다.
 * 스캔이 15분마다 돌아도, 워커가 여러 대여도, 재시도가 겹쳐도 결과는 같다.
 */
export class LineupReminderService {
  private readonly logger = new Logger(LineupReminderService.name);

  constructor(
    private readonly todoService: LineupTodoService,
    private readonly prisma: PrismaService,
    private readonly webPush?: WebPushService,
  ) {}

  /**
   * 워커가 claim할 때마다 한 번 도는 스캔. 처리 결과와 무관하게 **항상 다음 스캔을
   * 예약**한다 — 한 번의 실패로 리마인더가 영구히 멈추면 안 되고, 그 예약은 슬롯 키로
   * 중복이 막혀 있어 재시도가 겹쳐도 안전하다.
   *
   * **예약을 스캔과 분리된 독립 트랜잭션으로 먼저 커밋한다 (2026-08-27 감사 45).**
   * 예전에는 `finally { await scheduleNextScan(tx, now) }`처럼 스캔과 **같은** `tx`를
   * 썼는데, `tx`는 워커의 `$transaction(...)` 콜백이라 스캔이 15초 데드라인을 넘기거나
   * 도중 DB 오류로 throw하면 그 예외가 `finally`를 통과해 콜백 밖으로 나가 트랜잭션
   * 전체가 롤백된다 — 방금 `finally`에서 넣은 다음 슬롯 INSERT까지 함께 사라진다.
   * 알림을 못 받은 팀은 todo가 줄지 않으니 재시도(최대 6회, ~13분)도 매번 같은 이유로
   * 실패하고, 끝내 POISONED가 되면 체인을 다시 심는 지점이 워커 부팅(main.ts) 뿐이라
   * 다음 배포까지 플랫폼 전체 라인업 리마인더가 멈춘다. 예약을 스캔 실행 **전에** 별도
   * 트랜잭션(`this.prisma.$transaction`)으로 먼저 커밋해 두면, 그 뒤 스캔이 어떻게
   * 실패하든 다음 슬롯은 이미 확정돼 있다 — 슬롯 키가 같으면 `skipDuplicates`가 중복도
   * 막아 준다.
   */
  readonly scanHandler: GameOperationHandler = async (claim, tx) => {
    const now = new Date();
    await this.prisma.$transaction((scheduleTx) => scheduleNextScan(scheduleTx, now));
    await this.runScan(tx, now, claim);
  };

  private async runScan(tx: Prisma.TransactionClient, now: Date, claim: GameOperationClaim): Promise<void> {
    const quiet = isQuietHour(now);
    // 킥오프가 막 지난 경기까지 모은다 — 킥오프 시각 미제출 안내가 그 경기를 본다.
    const todos = await this.todoService.listAllPending(new Date(now.getTime() - KICKOFF_MISSING_WINDOW_MS));
    const upcoming = todos.filter((todo) => todo.scheduledAt === null || todo.scheduledAt >= now);
    const started = todos.filter((todo) => todo.scheduledAt !== null && todo.scheduledAt < now);

    // 킥오프가 코앞인 미제출 안내는 밤에도 알림함에 남기고 푸시만 낮에 한다(L35). 2시간 전 시각이 밤에 걸리는 경기는
    // 밤이 시작되기 전 마지막 스캔이 앞당겨 푸시한다 — 이후 밤 스캔은 같은 키라 다시 만들지 않는다.
    const finals = [
      ...buildFinalMessages(upcoming, now),
      ...(isEveningCutoffScan(now) ? buildOvernightFinalMessages(upcoming, now) : []),
    ];
    const urgent = [...finals, ...buildKickoffMissingMessages(started, now)];
    for (const message of urgent) {
      await this.deliver(tx, message, claim, !quiet);
    }
    // 나머지는 야간에 보내지 않는다. 다음 스캔 예약은 scanHandler에서 스캔 전에 이미
    // 커밋됐으므로 아침 9시 이후 첫 스캔이 그날치를 보낸다.
    if (quiet) return;

    const rosterChecks = await this.todoService.listCompetitionRosterChecks(kstMidnight(now, 1), kstMidnight(now, 2));
    const { dateKey } = kstParts(now);
    // 이 스캔이 킥오프 안내를 내는(이미 냈으면 키 중복으로 건너뛰는) 경기는 일일 알림에서 뺀다 — 한 사건에 카드 한 장(W4-V11).
    const finalKeys = new Set(finals.map((message) => message.keyPrefix));
    const daily = buildDailyMessages(upcoming.filter((todo) => !finalKeys.has(finalReminderKeyPrefix(todo))), dateKey);
    for (const message of [...daily, ...buildRosterCheckMessages(rosterChecks)]) {
      await this.deliver(tx, message, claim, true);
    }
    // 경기 알림은 "경기·대회" 수신 설정(teamMatchEnabled)을 따른다 — 위 팀 운영 알림(teamEnabled)과 축이 다르다.
    await deliverReminderRows(tx, await collectAttendeeReminderRows(tx, now), {
      prefField: 'teamMatchEnabled',
      webPush: this.webPush,
      claim,
    });
  }

  /** 한 건의 팀 알림을 그 팀의 owner·manager 전원에게 보낸다(팀 운영 알림이라 teamEnabled 축). */
  private async deliver(
    tx: Prisma.TransactionClient,
    message: ReminderMessage & { teamId: string },
    claim: GameOperationClaim,
    push: boolean,
  ): Promise<void> {
    const managers = await tx.v1TeamMembership.findMany({
      where: { teamId: message.teamId, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    const rows: ReminderRow[] = managers.map(({ userId }) => ({
      userId,
      targetType: 'team',
      targetId: message.targetId,
      title: message.title,
      body: message.body,
      deepLink: message.deepLink,
      businessKey: `${message.keyPrefix}:${userId}`,
    }));
    await deliverReminderRows(tx, rows, { prefField: 'teamEnabled', webPush: this.webPush, claim, push });
  }

  /**
   * 친선 참석명단 제출(H1-lineup-included) — 제출된 리비전의 선수 중 지금도 팀 활성 멤버인 사람에게 '참석명단에 올랐어요'.
   * 경기·사람당 한 번이라 다시 제출하면 새로 오른 사람만 받고, 빠진 사람에게는 보내지 않는다. 킥오프 2시간 안의
   * 제출은 킥오프 알림의 키로 써서 뒤이은 스캔이 같은 사람에게 킥오프 알림을 또 보내지 않는다(한 건만).
   * payload 에 userId 가 있으면(첫 기록 뒤 늦게 추가 — H5) 그 사람만 본다.
   */
  readonly lineupIncludedHandler: GameOperationHandler = async (claim, tx) => {
    const { lineupId, addedUserId } = lineupNoticeOf(claim.payload);
    const lineup = await tx.v1GameLineup.findUnique({
      where: { id: lineupId },
      select: { id: true, gameId: true, sideId: true, state: true, invalidatedAt: true },
    });
    if (lineup === null || lineup.state === 'DRAFT' || lineup.invalidatedAt !== null) return;
    const side = await tx.v1GameSide.findUnique({ where: { id: lineup.sideId }, select: { teamId: true } });
    const match = await tx.v1TeamMatch.findFirst({
      where: { game: { is: { id: lineup.gameId } }, status: 'matched', deletedAt: null, leagueId: null, tournamentId: null },
      select: {
        id: true,
        startAt: true,
        placeName: true,
        hostTeamId: true,
        hostTeam: { select: { name: true } },
        approvedApplicantTeam: { select: { name: true } },
      },
    });
    const teamId = side?.teamId ?? null;
    if (match === null || match.startAt === null || teamId === null || match.hostTeam === null || match.approvedApplicantTeam === null) return;
    const [ownTeam, opponent] = teamId === match.hostTeamId ? [match.hostTeam, match.approvedApplicantTeam] : [match.approvedApplicantTeam, match.hostTeam];

    const listed = await tx.v1GameParticipant.findMany({ where: { lineupId, userId: addedUserId ?? { not: null } }, select: { userId: true } });
    const members = await tx.v1TeamMembership.findMany({
      where: { teamId, status: 'active', userId: { in: listed.flatMap((row) => (row.userId === null ? [] : [row.userId])) } },
      select: { userId: true },
    });
    const now = new Date();
    const startAt = match.startAt;
    const includedKey = (userId: string) => `lineup-included:${lineup.gameId}:${userId}`;
    const alreadyNotified = new Set(
      (
        await tx.v1Notification.findMany({
          where: { businessKey: { in: members.flatMap(({ userId }) => [includedKey(userId), kickoffReminderKey(lineup.gameId, startAt, userId)]) } },
          select: { businessKey: true },
        })
      ).map((row) => row.businessKey),
    );
    const withinKickoffLead = now.getTime() >= startAt.getTime() - KICKOFF_REMINDER_LEAD_MS;
    const place = match.placeName === null ? '' : ` · ${match.placeName}`;
    const copy = notificationCopyFor('team_match_lineup_included', 'team_match', match.id, {
      team: ownTeam.name,
      matchup: `vs ${opponent.name} · ${formatKstMonthDayTime(startAt)}${place}`,
    });
    const rows: ReminderRow[] = members
      .filter(({ userId }) => !alreadyNotified.has(includedKey(userId)) && !alreadyNotified.has(kickoffReminderKey(lineup.gameId, startAt, userId)))
      .map(({ userId }) => ({
        userId,
        targetType: 'team_match',
        targetId: match.id,
        title: copy.title,
        body: copy.defaultBody,
        deepLink: copy.deepLink,
        businessKey: withinKickoffLead ? kickoffReminderKey(lineup.gameId, startAt, userId) : includedKey(userId),
      }));
    await deliverReminderRows(tx, rows, {
      prefField: 'teamMatchEnabled',
      webPush: this.webPush,
      claim,
      push: nightPushAllowed(now, startAt),
    });
  };
}

function lineupNoticeOf(payload: unknown): { lineupId: string; addedUserId: string | undefined } {
  const value = typeof payload === 'object' && payload !== null ? (payload as { lineupId?: unknown; userId?: unknown }) : {};
  if (typeof value.lineupId !== 'string' || value.lineupId.length === 0) throw new Error('Lineup included notice payload requires lineupId');
  if (value.userId !== undefined && (typeof value.userId !== 'string' || value.userId.length === 0)) {
    throw new Error('Lineup included notice payload userId must be a non-empty string');
  }
  return { lineupId: value.lineupId, addedUserId: value.userId };
}

/**
 * 알림 행을 워커 트랜잭션으로 쓴다. 전달 순서는 schedule-reminder.service.ts 와 같다: 수신 설정을 거르고,
 * 이미 받은 사람을 먼저 조회한 뒤 행을 만들고(businessKey unique + skipDuplicates), **이번에 새로 만든
 * 사람에게만** 웹 푸시를 보낸다. 푸시는 `claim.afterCommit` 으로 커밋 뒤에만 나간다(2026-08-27 감사 41/44 —
 * 뒤이은 처리가 실패해 트랜잭션이 롤백되면 이미 나간 푸시를 되돌릴 수 없다).
 */
export async function deliverReminderRows(
  tx: Prisma.TransactionClient,
  rows: readonly ReminderRow[],
  options: { prefField: 'teamEnabled' | 'teamMatchEnabled'; webPush?: WebPushService; claim?: GameOperationClaim; push?: boolean },
): Promise<void> {
  if (rows.length === 0) return;
  const preferences = await tx.v1NotificationPreference.findMany({
    where: { userId: { in: [...new Set(rows.map((row) => row.userId))] } },
    select: { userId: true, teamEnabled: true, teamMatchEnabled: true },
  });
  const optedOut = new Set(preferences.filter((preference) => preference[options.prefField] === false).map((preference) => preference.userId));
  const enabled = rows.filter((row) => !optedOut.has(row.userId));
  if (enabled.length === 0) return;

  const alreadyDelivered = await tx.v1Notification.findMany({
    where: { businessKey: { in: enabled.map((row) => row.businessKey) } },
    select: { businessKey: true },
  });
  const deliveredKeys = new Set(alreadyDelivered.map((notification) => notification.businessKey));

  await tx.v1Notification.createMany({
    data: enabled.map((row) => ({
      recipientUserId: row.userId,
      targetType: row.targetType,
      targetId: row.targetId,
      title: row.title,
      body: row.body,
      deepLink: row.deepLink,
      businessKey: row.businessKey,
    })),
    skipDuplicates: true,
  });

  // push=false 는 밤에 보류한 알림 — 알림함 행은 위에서 이미 남겼다(H1-night).
  if (options.push === false) return;
  for (const row of enabled.filter((candidate) => !deliveredKeys.has(candidate.businessKey))) {
    const send = () =>
      void options.webPush
        ?.sendToUser(row.userId, { title: row.title, body: row.body, url: row.deepLink ?? undefined })
        .catch((error: unknown) => {
          // 알림 행은 이미 durable 하다 — 푸시 실패가 그걸 되돌리거나 잡을 실패시키지 않는다.
          deliveryLogger.warn(`web push failed for reminder ${row.businessKey}: ${String(error)}`);
        });
    if (options.claim?.afterCommit === undefined) {
      send();
    } else {
      options.claim.afterCommit.push(send);
    }
  }
}

/**
 * 매일 한 번 가는 "아직 참석명단이 비어 있어요" 알림. 할 일은 친선 팀매치뿐이라 매치가 곧
 * 한 경기이므로 경기마다 한 건이다.
 */
export function buildDailyMessages(
  todos: LineupTodo[],
  dateKey: string,
): Array<ReminderMessage & { teamId: string }> {
  return todos.map((todo) => ({
    teamId: todo.teamId,
    targetId: todo.teamId,
    title: '팀 매치 참석명단을 확인해 주세요',
    body: describeDailyBody(todo),
    deepLink: todo.deepLink,
    keyPrefix: `lineup-daily:game:${todo.gameId}:${todo.teamId}:${dateKey}`,
  }));
}

function describeDailyBody(todo: LineupTodo): string {
  const status = todo.state === 'MISSING' ? '1경기는 참석명단이 비어 있고' : '1경기는 아직 제출 전이에요';
  const opponent = todo.opponentName !== null ? ` vs ${todo.opponentName}` : '';
  return `${todo.teamName} · ${status}. 가장 가까운 경기는 ${todo.title}${opponent}예요.`;
}

/**
 * 킥오프 2시간 전 최종 확인. 하루치 알림과 달리 이 시점에는 "어느 경기"가 곧 "지금 당장"이다.
 */
export function buildFinalMessages(
  todos: LineupTodo[],
  now: Date,
): Array<ReminderMessage & { teamId: string }> {
  return todos
    .filter((todo) => {
      if (todo.scheduledAt === null) return false;
      const remaining = todo.scheduledAt.getTime() - now.getTime();
      return remaining > 0 && remaining <= FINAL_REMINDER_WINDOW_MS;
    })
    .map((todo) => ({
      teamId: todo.teamId,
      targetId: todo.teamId,
      title: '곧 경기가 시작돼요 — 참석명단을 확인해 주세요',
      body:
        todo.state === 'MISSING'
          ? `${todo.title} 참석명단이 아직 비어 있어요.`
          : `${todo.title} 참석명단이 아직 제출 전이에요.`,
      deepLink: todo.deepLink,
      keyPrefix: finalReminderKeyPrefix(todo),
    }));
}

/** 최종 확인(앞당긴 것 포함)의 키. 날짜를 넣지 않는다 — 이 알림은 그 경기·팀에 딱 한 번만 가야 한다. */
function finalReminderKeyPrefix(todo: LineupTodo): string {
  return `lineup-final:${todo.gameId}:${todo.teamId}`;
}

/**
 * 킥오프 2시간 전 시각이 밤(KST 21~9시)에 걸려 그 창에서는 푸시할 수 없는 경기 — 밤이 시작되기 전 마지막 스캔이
 * 최종 확인을 앞당겨 보낸다(Task 180 L35). 시각이 "곧"이 아니므로 본문에 킥오프 일시를 붙인다. 키는 최종 확인과 같다.
 */
export function buildOvernightFinalMessages(
  todos: LineupTodo[],
  now: Date,
): Array<ReminderMessage & { teamId: string }> {
  const nightEnd = quietHoursEndAfter(now).getTime();
  return todos.flatMap((todo) => {
    const startAt = todo.scheduledAt;
    if (startAt === null) return [];
    const reminderAt = startAt.getTime() - FINAL_REMINDER_WINDOW_MS;
    if (reminderAt <= now.getTime() || reminderAt >= nightEnd) return [];
    return [{
      teamId: todo.teamId,
      targetId: todo.teamId,
      title: '곧 경기가 시작돼요 — 참석명단을 확인해 주세요',
      body: `${formatKstMonthDayTime(startAt)} ${todo.title} 참석명단이 ${todo.state === 'MISSING' ? '아직 비어 있어요' : '아직 제출 전이에요'}.`,
      deepLink: todo.deepLink,
      keyPrefix: finalReminderKeyPrefix(todo),
    }];
  });
}

/**
 * 킥오프 시각이 지났는데 아직 참석명단을 안 낸 팀의 팀장·매니저에게 한 번(Task 180 H5) — 양 팀 명단이 모두 제출돼야
 * 기록을 시작할 수 있다. 경기 일정마다 한 번이라 키에 킥오프 시각을 넣는다.
 */
export function buildKickoffMissingMessages(
  todos: LineupTodo[],
  now: Date,
): Array<ReminderMessage & { teamId: string }> {
  return todos.flatMap((todo) => {
    const startAt = todo.scheduledAt;
    if (startAt === null || startAt > now || now.getTime() - startAt.getTime() >= KICKOFF_MISSING_WINDOW_MS) return [];
    const opponent = todo.opponentName !== null ? ` vs ${todo.opponentName}` : '';
    return [{
      teamId: todo.teamId,
      targetId: todo.teamId,
      title: '경기 시간이 됐어요 — 참석명단을 제출해 주세요',
      body: `${todo.title}${opponent} · 참석명단을 내야 경기 기록을 시작할 수 있어요.`,
      deepLink: todo.deepLink,
      keyPrefix: `lineup-kickoff-missing:${todo.gameId}:${todo.teamId}:${startAt.getTime()}`,
    }];
  });
}

/**
 * 대회·리그 경기 전날 "명단 확인". 날짜를 키에 넣지 않는다 — 경기·팀당 한 번만 가야 하고,
 * 경기가 다른 날로 옮겨져도 다시 보내지 않는다.
 */
export function buildRosterCheckMessages(
  checks: CompetitionRosterCheck[],
): Array<ReminderMessage & { teamId: string }> {
  return checks.map((check) => {
    const opponent = check.opponentName !== null ? ` vs ${check.opponentName}` : '';
    return {
      teamId: check.teamId,
      targetId: check.teamId,
      title: `${check.title}${opponent} 명단을 확인해 주세요`,
      body: `내일 경기 출전 ${check.rosterSummary.participating}명 · 빠지는 사람이 있으면 조정해 주세요`,
      deepLink: check.deepLink,
      keyPrefix: `roster-check:${check.gameId}:${check.teamId}`,
    };
  });
}

/**
 * 다음 스캔을 예약한다. 시각을 15분 슬롯 경계로 올림해 키를 만들기 때문에, 재시도나
 * 워커 다중화로 이 함수가 여러 번 불려도 같은 슬롯에는 행이 하나만 생긴다.
 */
export async function scheduleNextScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
  const nextSlot = new Date(Math.floor(now.getTime() / SCAN_INTERVAL_MS) * SCAN_INTERVAL_MS + SCAN_INTERVAL_MS);
  await tx.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `lineup-reminder-scan:${nextSlot.toISOString()}`,
        aggregateType: 'LINEUP_REMINDER',
        aggregateId: 'scan',
        type: LINEUP_REMINDER_SCAN_TYPE,
        payload: { scheduledFor: nextSlot.toISOString() },
        availableAt: nextSlot,
      },
    ],
    skipDuplicates: true,
  });
}
