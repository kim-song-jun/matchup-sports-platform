import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController } from './admin.controller';
import { AdminOpsController } from './admin-ops.controller';
import { AdminOpsService } from './admin-ops.service';
import { AdminService } from './admin.service';

@Module({
  imports: [AdminContextModule, NotificationsModule, RealtimeModule],
  controllers: [AdminController, AdminOpsController],
  providers: [AdminService, AdminOpsService, V1AuthGuard],
})
export class AdminModule {}
