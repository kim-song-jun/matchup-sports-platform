import { Module } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesAdminController } from './disputes-admin.controller';
import { DisputesService } from './disputes.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PrismaModule, NotificationsModule, PaymentsModule],
  controllers: [DisputesController, DisputesAdminController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
