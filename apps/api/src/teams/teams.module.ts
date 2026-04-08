import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamMembershipService } from './team-membership.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamMembershipService],
  exports: [TeamsService, TeamMembershipService],
})
export class TeamsModule {}
