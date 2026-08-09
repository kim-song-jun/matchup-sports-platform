import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { PublicTeamRecordsController } from './public-team-records.controller';
import { PublicTeamRecordsService } from './public-team-records.service';
import { PublicTournamentRecordsController } from './public-tournament-records.controller';
import { PublicTournamentRecordsService } from './public-tournament-records.service';
import { PublicUserRecordsController } from './public-user-records.controller';
import { PublicUserRecordsService } from './public-user-records.service';

/**
 * Task 24 -- public tournament schedule/match and team/player official
 * record projections. Fully self-contained: `PrismaService` is global, and
 * `OptionalV1AuthGuard` only depends on it, so this module needs no other
 * feature module imported to run. A host application wires it in with a
 * single `imports: [PublicRecordsModule]` line.
 */
@Module({
  controllers: [PublicTournamentRecordsController, PublicTeamRecordsController, PublicUserRecordsController],
  providers: [
    PublicTournamentRecordsService,
    PublicTeamRecordsService,
    PublicUserRecordsService,
    OptionalV1AuthGuard,
  ],
})
export class PublicRecordsModule {}
