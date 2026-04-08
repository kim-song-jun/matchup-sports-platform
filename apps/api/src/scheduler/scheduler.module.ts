import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ScoringModule } from '../scoring/scoring.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [ScheduleModule.forRoot(), PrismaModule, ScoringModule, BadgesModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
