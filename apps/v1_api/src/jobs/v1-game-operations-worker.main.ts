import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NotificationsService } from '../notifications/notifications.service';
import { WebPushService } from '../notifications/web-push.service';
import { ScheduleReminderService } from './schedule-reminders/schedule-reminder.service';
import { V1GameOperationsWorkerModule } from './v1-game-operations-worker.module';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(V1GameOperationsWorkerModule);
  const worker = app.get(V1GameOperationsWorkerService);
  worker.registerDurableAuditHandler('GAME_OPERATION_FLAG_CHANGED');
  worker.registerDurableAuditHandler('GAME_OPERATION_JOB_REQUEUED');

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
