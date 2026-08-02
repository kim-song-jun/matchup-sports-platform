import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { GameOperationFlagsController } from '../config/game-operation-flags.controller';
import { GameOperationFlagsService } from '../config/game-operation-flags';
import { ResultEscalationController } from '../game-operations/result-escalation.controller';
import { ResultEscalationAccessService } from '../game-operations/result-escalation-access.service';
import { ResultEscalationMutationService } from '../game-operations/result-escalation-mutation.service';
import { ResultEscalationService } from '../game-operations/result-escalation.service';
import { ResultEscalationValidationInterceptor } from '../game-operations/result-escalation-validation.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import {
  V1GameOperationsJobsController,
  V1GameOperationsWorkerController,
} from './v1-game-operations-worker.controller';
import { V1GameOperationsWorkerService } from './v1-game-operations-worker.service';

@Module({
  imports: [PrismaModule, AdminContextModule],
  controllers: [
    V1GameOperationsWorkerController,
    V1GameOperationsJobsController,
    GameOperationFlagsController,
    ResultEscalationController,
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
