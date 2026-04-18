import { Module } from '@nestjs/common';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchesService } from './team-matches.service';
import { TeamsModule } from '../teams/teams.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [TeamsModule, NotificationsModule, ChatModule, BadgesModule],
  controllers: [TeamMatchesController],
  providers: [TeamMatchesService],
  exports: [TeamMatchesService],
})
export class TeamMatchesModule {}
