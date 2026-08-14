import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { LineupTodo, LineupTodoService } from '../../team-lineups/lineup-todo.service';
import type { WebPushService } from '../../notifications/web-push.service';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';
import { isQuietHour, kstParts } from './quiet-hours';

/** 스캔 주기. 슬롯 경계로 정규화해 재예약 키를 만들기 때문에, 재시도가 겹쳐도 같은
 * 슬롯에는 outbox 행이 하나만 생긴다. */
const SCAN_INTERVAL_MS = 15 * 60 * 1000;

/** 최종 확인 알림을 보내는 창 — 킥오프 2시간 전부터 킥오프까지. */
const FINAL_REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;

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
 * 라인업을 아직 넣지 않은 팀에게 알린다.
 *
 * **왜 예약이 아니라 주기 스캔인가.** 대회 일정은 운영 중에 바뀐다(경기 시간 조정, 대진
 * 확정 지연). 미리 T-24h 같은 시점에 발송을 예약해두면 일정이 바뀔 때마다 예약을
 * 취소·재생성해야 하고, 일정을 바꾸는 경로 중 하나라도 그걸 빠뜨리면 알림이 엉뚱한
 * 시간에 간다. 스캔은 언제나 **지금의** 일정을 보고 판단하므로 그런 동기화가 아예
 * 필요 없다.
 *
 * **하루 한 번을 어떻게 보장하는가.** 발송 이력 테이블을 따로 두지 않는다. 알림의
 * `businessKey`에 한국 날짜를 박고(`V1Notification.businessKey`는 unique), 대회 단위로
 * 묶는다 — 같은 날 같은 대회로 두 번째 행을 만드는 일이 DB 수준에서 불가능하다.
 * 스캔이 15분마다 돌아도, 워커가 여러 대여도, 재시도가 겹쳐도 결과는 같다.
 *
 * **왜 경기 단위가 아니라 대회 단위인가.** 대회는 하루에 여러 경기를 치른다. 경기마다
 * 보내면 알림이 소나기처럼 쏟아지고, 그러면 정작 중요한 날에 무시당한다.
 */
export class LineupReminderService {
  private readonly logger = new Logger(LineupReminderService.name);

  constructor(
    private readonly todoService: LineupTodoService,
    private readonly webPush?: WebPushService,
  ) {}

  /**
   * 워커가 claim할 때마다 한 번 도는 스캔. 처리 결과와 무관하게 **항상 다음 스캔을
   * 예약**한다 — 한 번의 실패로 리마인더가 영구히 멈추면 안 되고, 그 예약은 슬롯 키로
   * 중복이 막혀 있어 재시도가 겹쳐도 안전하다.
   */
  readonly scanHandler: GameOperationHandler = async (_claim, tx) => {
    const now = new Date();
    try {
      await this.runScan(tx, now);
    } finally {
      await scheduleNextScan(tx, now);
    }
  };

  private async runScan(tx: Prisma.TransactionClient, now: Date): Promise<void> {
    // 야간에는 아무것도 보내지 않는다. 다음 스캔 예약은 finally에서 그대로 이뤄지므로
    // 아침 9시 이후 첫 스캔이 그날치를 보낸다.
    if (isQuietHour(now)) return;

    const todos = await this.todoService.listAllPending(now);
    if (todos.length === 0) return;

    const { dateKey } = kstParts(now);
    const messages = [
      ...buildDailyMessages(todos, dateKey),
      ...buildFinalMessages(todos, now),
    ];

    for (const message of messages) {
      await this.deliver(tx, message);
    }
  }

  /**
   * 한 건의 알림을 그 팀의 owner·manager 전원에게 보낸다.
   *
   * 전달 순서는 기존 리마인더(schedule-reminder.service.ts)와 같다: 알림 선호도를 확인하고,
   * 이미 받은 사람을 먼저 조회한 뒤, durable한 알림 행을 만들고, **이번에 새로 만들어진
   * 사람에게만** 웹푸시를 던진다. 푸시는 best-effort라 실패해도 알림 행을 되돌리지 않는다.
   */
  private async deliver(tx: Prisma.TransactionClient, message: ReminderMessage & { teamId: string }): Promise<void> {
    const managers = await tx.v1TeamMembership.findMany({
      where: { teamId: message.teamId, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    const recipients = managers.map((membership) => membership.userId);
    if (recipients.length === 0) return;

    const preferences = await tx.v1NotificationPreference.findMany({
      where: { userId: { in: recipients } },
      select: { userId: true, teamEnabled: true },
    });
    const teamEnabledByUser = new Map(preferences.map((preference) => [preference.userId, preference.teamEnabled]));
    const enabled = recipients.filter((userId) => teamEnabledByUser.get(userId) !== false);
    if (enabled.length === 0) return;

    const businessKeyFor = (userId: string): string => `${message.keyPrefix}:${userId}`;
    const alreadyDelivered = await tx.v1Notification.findMany({
      where: { businessKey: { in: enabled.map(businessKeyFor) } },
      select: { businessKey: true },
    });
    const deliveredKeys = new Set(alreadyDelivered.map((notification) => notification.businessKey));

    await tx.v1Notification.createMany({
      data: enabled.map((userId) => ({
        recipientUserId: userId,
        targetType: 'team' as const,
        targetId: message.targetId,
        title: message.title,
        body: message.body,
        deepLink: message.deepLink,
        businessKey: businessKeyFor(userId),
      })),
      skipDuplicates: true,
    });

    for (const userId of enabled.filter((candidate) => !deliveredKeys.has(businessKeyFor(candidate)))) {
      void this.webPush
        ?.sendToUser(userId, { title: message.title, body: message.body, url: message.deepLink })
        .catch(() => {
          // 알림 행은 이미 durable하다 — 푸시 실패가 그걸 되돌리거나 잡을 실패시켜서는 안 된다.
        });
    }
  }
}

/**
 * 매일 한 번 가는 "아직 라인업이 비어 있어요" 알림.
 *
 * 대회는 대회 단위로 묶고, 팀 매치는 매치가 곧 한 경기이므로 그대로 한 건이다.
 */
export function buildDailyMessages(
  todos: LineupTodo[],
  dateKey: string,
): Array<ReminderMessage & { teamId: string }> {
  const groups = new Map<string, LineupTodo[]>();
  for (const todo of todos) {
    const scope =
      todo.source === 'TOURNAMENT_FIXTURE' && todo.tournamentId !== null
        ? `tournament:${todo.tournamentId}`
        : `game:${todo.gameId}`;
    const key = `${scope}|${todo.teamId}`;
    const bucket = groups.get(key);
    if (bucket === undefined) groups.set(key, [todo]);
    else bucket.push(todo);
  }

  const messages: Array<ReminderMessage & { teamId: string }> = [];
  for (const [key, group] of groups) {
    const [scope] = key.split('|');
    const first = group[0];
    const isTournament = first.source === 'TOURNAMENT_FIXTURE';
    // 가장 이른 경기를 대표로 삼는다 — 링크는 지금 당장 손볼 경기로 꽂혀야 한다.
    const soonest = group.reduce((earliest, candidate) =>
      (candidate.scheduledAt?.getTime() ?? Infinity) < (earliest.scheduledAt?.getTime() ?? Infinity)
        ? candidate
        : earliest,
    );

    messages.push({
      teamId: first.teamId,
      targetId: first.teamId,
      title: isTournament
        ? `${first.tournamentTitle ?? '대회'} 라인업을 확인해 주세요`
        : '팀 매치 라인업을 확인해 주세요',
      body: describeDailyBody(group, soonest),
      deepLink: soonest.deepLink,
      keyPrefix: `lineup-daily:${scope}:${first.teamId}:${dateKey}`,
    });
  }
  return messages;
}

function describeDailyBody(group: LineupTodo[], soonest: LineupTodo): string {
  const missing = group.filter((todo) => todo.state === 'MISSING').length;
  const draft = group.length - missing;
  const parts: string[] = [];
  if (missing > 0) parts.push(`${missing}경기는 라인업이 비어 있고`);
  if (draft > 0) parts.push(`${draft}경기는 아직 제출 전이에요`);
  const status = parts.length > 0 ? parts.join(' ') : '아직 라인업이 준비되지 않았어요';
  const opponent = soonest.opponentName !== null ? ` vs ${soonest.opponentName}` : '';
  return `${soonest.teamName} · ${status}. 가장 가까운 경기는 ${soonest.title}${opponent}예요.`;
}

/**
 * 킥오프 2시간 전 최종 확인. 하루치 알림과 달리 경기 하나하나에 붙는다 — 이 시점에는
 * "어느 경기"가 곧 "지금 당장"이라 묶을 이유가 없다.
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
      title: '곧 경기가 시작돼요 — 라인업을 확인해 주세요',
      body:
        todo.state === 'MISSING'
          ? `${todo.title} 라인업이 아직 비어 있어요.`
          : `${todo.title} 라인업이 아직 제출 전이에요.`,
      deepLink: todo.deepLink,
      // 날짜를 넣지 않는다 — 이 알림은 그 경기에 딱 한 번만 가야 한다.
      keyPrefix: `lineup-final:${todo.gameId}:${todo.teamId}`,
    }));
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
