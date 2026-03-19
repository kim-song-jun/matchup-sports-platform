import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
