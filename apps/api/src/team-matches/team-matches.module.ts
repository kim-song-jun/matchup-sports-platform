import { Module } from '@nestjs/common';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchesService } from './team-matches.service';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [TeamsModule],
  controllers: [TeamMatchesController],
  providers: [TeamMatchesService],
  exports: [TeamMatchesService],
})
export class TeamMatchesModule {}
