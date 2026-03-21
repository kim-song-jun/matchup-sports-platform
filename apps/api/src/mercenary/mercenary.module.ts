import { Module } from '@nestjs/common';
import { MercenaryController } from './mercenary.controller';
import { MercenaryService } from './mercenary.service';

@Module({
  controllers: [MercenaryController],
  providers: [MercenaryService],
})
export class MercenaryModule {}
