import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CompetitionRosterCheck, LineupTodo, LineupTodoService } from '../../team-lineups/lineup-todo.service';
import type { WebPushService } from '../../notifications/web-push.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GameOperationClaim, GameOperationHandler } from '../v1-game-operations-worker.service';
import { isQuietHour, kstMidnight, kstParts } from './quiet-hours';

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
 * 친선 팀매치 참석명단을 아직 넣지 않은 팀에게 알리고, 대회·리그 경기는 전날 양 팀
 * owner·manager 에게 "명단 확인"을 한 번 보낸다(Task 179 R1 — 대회·리그 명단은 계산되므로
 * 제출 재촉이 없다).
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
    // 야간에는 아무것도 보내지 않는다. 다음 스캔 예약은 scanHandler에서 스캔 전에 이미
    // 커밋됐으므로 아침 9시 이후 첫 스캔이 그날치를 보낸다.
    if (isQuietHour(now)) return;

    const todos = await this.todoService.listAllPending(now);
    const rosterChecks = await this.todoService.listCompetitionRosterChecks(kstMidnight(now, 1), kstMidnight(now, 2));

    const { dateKey } = kstParts(now);
    const messages = [
      ...buildDailyMessages(todos, dateKey),
      ...buildFinalMessages(todos, now),
      ...buildRosterCheckMessages(rosterChecks),
    ];

    for (const message of messages) {
      await this.deliver(tx, message, claim);
    }
  }

  /**
   * 한 건의 알림을 그 팀의 owner·manager 전원에게 보낸다.
   *
   * 전달 순서는 기존 리마인더(schedule-reminder.service.ts)와 같다: 알림 선호도를 확인하고,
   * 이미 받은 사람을 먼저 조회한 뒤, durable한 알림 행을 만들고, **이번에 새로 만들어진
   * 사람에게만** 웹푸시를 던진다. 푸시는 best-effort라 실패해도 알림 행을 되돌리지 않는다.
   *
   * 웹 푸시는 `claim.afterCommit`에 담아 워커 트랜잭션이 실제로 커밋된 뒤에만 보낸다
   * (2026-08-27 감사 41/44 — schedule-reminder.service.ts의 같은 수정과 동일한 이유:
   * 이 스캔이 이 메시지를 보낸 뒤에도 다른 팀 메시지를 계속 처리하다 실패하면 트랜잭션
   * 전체가 롤백돼 방금 나간 푸시를 되돌릴 수 없다).
   */
  private async deliver(
    tx: Prisma.TransactionClient,
    message: ReminderMessage & { teamId: string },
    claim: GameOperationClaim,
  ): Promise<void> {
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
      const send = () =>
        void this.webPush
          ?.sendToUser(userId, { title: message.title, body: message.body, url: message.deepLink })
          .catch(() => {
            // 알림 행은 이미 durable하다 — 푸시 실패가 그걸 되돌리거나 잡을 실패시켜서는 안 된다.
          });
      if (claim.afterCommit === undefined) {
        send();
      } else {
        claim.afterCommit.push(send);
      }
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
      // 날짜를 넣지 않는다 — 이 알림은 그 경기에 딱 한 번만 가야 한다.
      keyPrefix: `lineup-final:${todo.gameId}:${todo.teamId}`,
    }));
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
