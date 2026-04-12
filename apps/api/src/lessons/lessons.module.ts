import { Module } from '@nestjs/common';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [NotificationsModule, SettlementsModule, TeamsModule],
  controllers: [LessonsController],
  providers: [LessonsService],
})
export class LessonsModule {}
