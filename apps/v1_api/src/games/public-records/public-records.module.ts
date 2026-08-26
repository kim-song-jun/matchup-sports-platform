import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { AdminContextModule } from '../../common/admin-context.module';
import { AdminTournamentPlayerRecordsController } from './admin-tournament-player-records.controller';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { PublicLeagueFixtureRecordsController } from './public-league-fixture-records.controller';
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
  // AdminContextService 는 로컬 재공급하지 않는다 — 전용 모듈(AdminContextModule)이
  // exports 하는 단일 인스턴스를 써야 한다. 재공급하면 인스턴스가 갈라져,
  // app.get() 으로 얻은 인스턴스에 spy 를 거는 통합 스펙(tournament-campaign 감사
  // 롤백)이 조용히 무력화된다 — 실제로 #727 CI 에서 두 번 재현된 사고다.
  imports: [AdminContextModule],
  controllers: [
    PublicTournamentRecordsController,
    // 리그 대진의 게임 프로젝션 — 같은 서비스의 리그 게이트(getLeagueFixtureRecord).
    PublicLeagueFixtureRecordsController,
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
    TournamentStaffAccessService,
  ],
})
export class PublicRecordsModule {}
