import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GameOperationFlagsController } from './game-operation-flags.controller';
import { GameOperationFlagsService } from './game-operation-flags';

@Module({
  imports: [PrismaModule, AdminContextModule],
  controllers: [GameOperationFlagsController],
  providers: [GameOperationFlagsService, V1AuthGuard],
  exports: [GameOperationFlagsService],
})
export class GameOperationFlagsModule {}
