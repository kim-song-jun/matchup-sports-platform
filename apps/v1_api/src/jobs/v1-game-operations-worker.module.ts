import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { GameOperationFlagsController } from '../config/game-operation-flags.controller';
import { GameOperationFlagsService } from '../config/game-operation-flags';
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
  ],
  providers: [V1GameOperationsWorkerService, GameOperationFlagsService, V1AuthGuard],
  exports: [V1GameOperationsWorkerService, GameOperationFlagsService],
})
export class V1GameOperationsWorkerModule {}
