import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { TeamMembershipService } from './team-membership.service';

@Module({
  controllers: [TeamsController],
  providers: [TeamsService, TeamMembershipService],
  exports: [TeamsService, TeamMembershipService],
})
export class TeamsModule {}
