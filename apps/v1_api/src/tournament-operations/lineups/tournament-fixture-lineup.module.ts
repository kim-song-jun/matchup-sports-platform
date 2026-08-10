import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { GamesModule } from '../../games/games.module';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentFixtureLineupController } from './tournament-fixture-lineup.controller';
import { TournamentFixtureLineupService } from './tournament-fixture-lineup.service';

/**
 * apps/v1_api/src/tournaments/tournaments.module.ts (Task 7's real home for
 * TournamentStaffAccessService) has no `exports` array, so it cannot be
 * imported via `imports: [TournamentsModule]`. Locally re-provide it instead
 * of editing tournaments.module.ts (owned by another lane) -- same precedent
 * already followed by the sibling tournament-operations/staff and
 * tournament-operations/fields modules. Needed here since Task 18 review
 * P1-4: the adapter now authorizes fixture/game existence checks (see
 * tournament-fixture-lineup.service.ts's doc comment).
 */
@Module({
  imports: [GamesModule],
  controllers: [TournamentFixtureLineupController],
  providers: [TournamentFixtureLineupService, TournamentStaffAccessService, V1AuthGuard],
})
export class TournamentFixtureLineupModule {}
