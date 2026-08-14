import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NotificationsService } from '../notifications/notifications.service';
import { WebPushService } from '../notifications/web-push.service';
import { PrismaService } from '../prisma/prisma.service';
import { LineupTodoService } from '../team-lineups/lineup-todo.service';
import {
  LINEUP_REMINDER_SCAN_TYPE,
  LineupReminderService,
  scheduleNextScan,
} from './lineup-reminders/lineup-reminder.service';
import { ScheduleReminderService } from './schedule-reminders/schedule-reminder.service';
import { V1GameOperationsWorkerModule } from './v1-game-operations-worker.module';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(V1GameOperationsWorkerModule);
  const worker = app.get(V1GameOperationsWorkerService);
  worker.registerDurableAuditHandler('GAME_OPERATION_FLAG_CHANGED');
  worker.registerDurableAuditHandler('GAME_OPERATION_JOB_REQUEUED');
  // GAME_OPERATION_GATE_MODE_CHANGED (simplified-gate on/off toggle) is
  // written by the exact same writeControlEffect() helper as
  // GAME_OPERATION_FLAG_CHANGED above (game-operation-flags.ts) — same
  // audit-row + outbox-row shape, so it gets the identical durable-audit
  // treatment. Outbox-handler cleanup task found this type writing but
  // never claimed (retrying 6x then POISONED, since it's new this session).
  worker.registerDurableAuditHandler('GAME_OPERATION_GATE_MODE_CHANGED');

  // Task 12 reminders lane: reuses this same DB-leased worker (no second scheduler) — see
  // schedule-reminder.service.ts for the handler bodies. WebPushService is passed as the second
  // constructor argument (previously omitted, so worker-originated reminders persisted a durable
  // V1Notification row but never fired a Web Push, unlike the HTTP path) — WorkerNotificationsModule
  // already provides and exports WebPushService for exactly this call site.
  const notifications = app.get(NotificationsService);
  const webPush = app.get(WebPushService);
  const scheduleReminders = new ScheduleReminderService(notifications, webPush);
  worker.registerHandler('SCHEDULE_RSVP_DEADLINE_REMINDER', scheduleReminders.rsvpDeadlineReminderHandler);
  worker.registerHandler(
    'SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER',
    scheduleReminders.guestRecruitmentCloseReminderHandler,
  );
  // P1-4 fix: guest-recruitment.service.ts's createApplication() now records a durable outbox row
  // (business key `guest-application:{applicationId}:manager-notification`) in the same
  // transaction as the application insert, instead of a fire-and-forget NotificationsService call —
  // this handler claims and delivers it.
  worker.registerHandler(
    'SCHEDULE_GUEST_APPLICATION_MANAGER_NOTIFICATION',
    scheduleReminders.guestApplicationManagerNotificationHandler,
  );

  // 라인업 리마인더 lane. 이벤트가 아니라 "아직 안 한 상태"를 감지해야 하므로 주기
  // 스캔이 필요한데, 두 번째 스케줄러를 들이지 않고 이 워커의 outbox 루프를 그대로
  // 재사용한다 — 스캔 한 번이 끝날 때 다음 스캔을 outbox 행으로 예약하는 방식이다.
  const lineupTodos = app.get(LineupTodoService);
  const lineupReminders = new LineupReminderService(lineupTodos, webPush);
  worker.registerHandler(LINEUP_REMINDER_SCAN_TYPE, lineupReminders.scanHandler);
  // 체인의 첫 고리. 이미 예약돼 있으면 슬롯 키가 같아 무시되므로, 워커를 몇 번 재시작해도
  // 스캔이 늘어나지 않는다. 반대로 어떤 이유로 체인이 끊겼더라도 다음 배포 때 되살아난다.
  const prisma = app.get(PrismaService);
  await prisma.$transaction((tx) => scheduleNextScan(tx, new Date()));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.enableShutdownHooks();
  await app.listen(workerPort());

  try {
    await worker.run();
  } catch (error) {
    await worker.shutdown();
    await app.close();
    throw error;
  }
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`v1 game operations worker terminated: ${message}`);
  process.exitCode = 1;
});

function workerPort(): number {
  const value = process.env.WORKER_PORT;
  const port = value === undefined ? 8122 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('WORKER_PORT must be an integer between 1 and 65535');
  }
  return port;
}
