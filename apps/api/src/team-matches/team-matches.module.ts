import { Module } from '@nestjs/common';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchesService } from './team-matches.service';

@Module({
  controllers: [TeamMatchesController],
  providers: [TeamMatchesService],
  exports: [TeamMatchesService],
})
export class TeamMatchesModule {}
