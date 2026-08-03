import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { buildPinoHttpOptions } from '../common/logging/pino-http.config';
import { GameOperationFlagsController } from '../config/game-operation-flags.controller';
import { GameOperationFlagsService } from '../config/game-operation-flags';
import { ResultEscalationController } from '../game-operations/result-escalation.controller';
import { PlatformResultEscalationController } from '../game-operations/platform-result-escalation.controller';
import { ResultEscalationAccessService } from '../game-operations/result-escalation-access.service';
import { ResultEscalationMutationService } from '../game-operations/result-escalation-mutation.service';
import { ResultEscalationService } from '../game-operations/result-escalation.service';
import { ResultEscalationValidationInterceptor } from '../game-operations/result-escalation-validation.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkerNotificationsModule } from './schedule-reminders/worker-notifications.module';
import {
  V1GameOperationsJobsController,
  V1GameOperationsWorkerController,
} from './v1-game-operations-worker.controller';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

@Module({
  // LoggerModule.forRoot() is required here (mirrors app.module.ts) because
  // WorkerNotificationsModule (added for Task 12's schedule reminders — see
  // schedule-reminder.service.ts) provides NotificationsService/WebPushService, both of which
  // use nestjs-pino's @InjectPinoLogger; without a registered PinoLogger provider this worker's
  // standalone Nest app would fail to resolve those dependencies at bootstrap.
  //
  // We import WorkerNotificationsModule — NOT notifications-service.module.ts (the HTTP-side
  // declaring module) and NOT the full NotificationsModule — for two independent reasons:
  //
  //   1. NotificationsModule additively declares ResultEscalationController /
  //      PlatformResultEscalationController / ResultEscalation*Service / V1AuthGuard, and this
  //      module already declares those exact same classes directly below (Task 9). Same class
  //      registered as a provider/controller of two modules in one application graph would give
  //      Nest two distinct instances and, for controllers, risks duplicate route registration.
  //
  //   2. notifications-service.module.ts (HTTP-side) imports RealtimeModule, which imports
  //      GamesModule and pulls in realtime.gateway.ts — a file whose module-load-time
  //      `requireProductionFrontendOrigin(process.env.FRONTEND_URL)` check throws when
  //      FRONTEND_URL is unset under NODE_ENV=production, which is exactly this worker's alpha
  //      container env (deploy/docker-compose.alpha.yml has no FRONTEND_URL). Importing that
  //      module here previously crash-looped the worker in production (Task 12 B1) and would
  //      additionally register GamesModule's controllers/gateway on this worker's internal port
  //      (Task 12 B2). WorkerNotificationsModule provides the same NotificationsService/
  //      WebPushService pair without importing realtime/ or games/ at all — see that module's
  //      docblock for the full rationale.
  imports: [
    PrismaModule,
    AdminContextModule,
    LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions() }),
    WorkerNotificationsModule,
  ],
  controllers: [
    V1GameOperationsWorkerController,
    V1GameOperationsJobsController,
    GameOperationFlagsController,
    ResultEscalationController,
    PlatformResultEscalationController,
  ],
  providers: [
    V1GameOperationsWorkerService,
    GameOperationFlagsService,
    ResultEscalationAccessService,
    ResultEscalationMutationService,
    ResultEscalationService,
    ResultEscalationValidationInterceptor,
    V1AuthGuard,
  ],
  exports: [V1GameOperationsWorkerService, GameOperationFlagsService, ResultEscalationService],
})
export class V1GameOperationsWorkerModule {}
