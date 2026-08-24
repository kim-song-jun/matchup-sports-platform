import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { AdminContextService } from '../../common/admin-context.service';
import { AdminTournamentPlayerRecordsController } from './admin-tournament-player-records.controller';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
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
 *
 * Issue #377 -- `PublicTournamentRecordsService.getMatch` reuses
 * `TournamentStaffAccessService` (Task 7's fixture/field-scoped staff check,
 * already the authority `TournamentFixtureLineupService.authorizeAndResolveGameId`
 * relies on) to grant a real-name bypass to the fixture's own assigned
 * staff. `tournaments.module.ts` (Task 7's real home for this service) has
 * no `exports` array, so it cannot be imported via `imports:
 * [TournamentsModule]` -- locally re-provide it instead of editing that
 * file, the same precedent `TournamentFixtureLineupModule` and the sibling
 * tournament-operations/staff and tournament-operations/fields modules
 * already follow.
 */
@Module({
  controllers: [
    PublicTournamentRecordsController,
    PublicTeamRecordsController,
    PublicUserRecordsController,
    // 회고 STATS-3 — 수상 추천 근거용 어드민 랭킹(비게이팅). 같은 서비스의 다른 게이트.
    AdminTournamentPlayerRecordsController,
  ],
  providers: [
    PublicTournamentRecordsService,
    PublicTeamRecordsService,
    PublicUserRecordsService,
    OptionalV1AuthGuard,
    V1AuthGuard,
    AdminContextService,
    TournamentStaffAccessService,
  ],
})
export class PublicRecordsModule {}
