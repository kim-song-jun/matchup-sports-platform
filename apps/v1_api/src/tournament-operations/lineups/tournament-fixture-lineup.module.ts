import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { GamesModule } from '../../games/games.module';
import { TournamentFixtureLineupController } from './tournament-fixture-lineup.controller';
import { TournamentFixtureLineupService } from './tournament-fixture-lineup.service';

@Module({
  imports: [GamesModule],
  controllers: [TournamentFixtureLineupController],
  providers: [TournamentFixtureLineupService, V1AuthGuard],
})
export class TournamentFixtureLineupModule {}
