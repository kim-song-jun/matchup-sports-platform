import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentStaffGuard } from '../../tournaments/staff/tournament-staff.guard';
import { TournamentOperationsBoardController } from './tournament-operations-board.controller';
import { TournamentOperationsBoardService } from './tournament-operations-board.service';

/**
 * `apps/v1_api/src/tournaments/tournaments.module.ts` currently has no `exports` array, so
 * `TournamentStaffAccessService`/`TournamentStaffGuard` are not importable via
 * `imports: [TournamentsModule]`. This follows the exact precedent already in
 * `apps/v1_api/src/realtime/realtime.module.ts`: locally re-provide them as this module's own
 * providers instead of editing `tournaments.module.ts` (zero risk of touching a path owned by
 * another lane). `PrismaService` needs no explicit import -- `PrismaModule` is `@Global()`.
 *
 * ## Retired: `GAME_READ_AUTHORITY` override seam (Task 10 cutover cleanup)
 * This module used to expose a `register(authorityProvider)` dynamic-module factory so a
 * composition root could swap in a real `GAME_READ_AUTHORITY` comparator for `TournamentOperations
 * BoardService` (the Task 10 `GAME_READ=compare` seam -- see game-read-authority.port.ts,
 * compare-game-read-authority.service.ts, direct-game-read-authority.service.ts, all removed).
 * `TournamentOperationsBoardService` no longer takes a read-authority dependency at all, so there
 * is nothing left to override -- this is now a plain static module.
 */
@Module({
  controllers: [TournamentOperationsBoardController],
  providers: [
    TournamentOperationsBoardService,
    V1AuthGuard,
    TournamentStaffAccessService,
    TournamentStaffGuard,
  ],
})
export class TournamentOperationsBoardModule {}
