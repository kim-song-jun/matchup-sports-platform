import { Module } from '@nestjs/common';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { PayoutsController } from './payouts.controller';

@Module({
  controllers: [SettlementsController, PayoutsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
