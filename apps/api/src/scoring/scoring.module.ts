import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
