import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettlementsModule } from '../settlements/settlements.module';

@Module({
  imports: [NotificationsModule, SettlementsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
