import { Module } from '@nestjs/common';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
