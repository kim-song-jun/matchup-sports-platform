import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminController, AdminPaymentsWebhookController } from './admin.controller';
import { AdminOpsService } from './admin-ops.service';
import { AdminService } from './admin.service';
import { TossPaymentsService } from './toss-payments.service';

@Module({
  controllers: [AdminController, AdminPaymentsWebhookController],
  providers: [AdminService, AdminOpsService, TossPaymentsService, V1AuthGuard],
})
export class AdminModule {}
