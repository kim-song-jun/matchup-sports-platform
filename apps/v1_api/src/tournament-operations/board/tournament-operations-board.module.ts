import { DynamicModule, Module, Provider } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentStaffGuard } from '../../tournaments/staff/tournament-staff.guard';
import { DirectGameReadAuthorityService } from './direct-game-read-authority.service';
import { GAME_READ_AUTHORITY } from './game-read-authority.port';
import { TournamentOperationsBoardController } from './tournament-operations-board.controller';
import { TournamentOperationsBoardService } from './tournament-operations-board.service';

const DEFAULT_GAME_READ_AUTHORITY_PROVIDER: Provider = {
  provide: GAME_READ_AUTHORITY,
  useClass: DirectGameReadAuthorityService,
};

/**
 * `apps/v1_api/src/tournaments/tournaments.module.ts` currently has no `exports` array, so
 * `TournamentStaffAccessService`/`TournamentStaffGuard` are not importable via
 * `imports: [TournamentsModule]`. This follows the exact precedent already in
 * `apps/v1_api/src/realtime/realtime.module.ts`: locally re-provide them as this module's own
 * providers instead of editing `tournaments.module.ts` (zero risk of touching a path owned by
 * another lane). `PrismaService` needs no explicit import -- `PrismaModule` is `@Global()`.
 *
 * ## `GAME_READ_AUTHORITY` override seam
 * The `GAME_READ_AUTHORITY` binding is deliberately NOT a fixed entry in this module's static
 * `providers` array -- Nest resolves a token from the *declaring* module's own local providers
 * first, so a fixed local binding could never be overridden by anything imported elsewhere,
 * regardless of import order. Instead this module exposes a `register()` static method
 * (Nest's standard dynamic-module pattern) that accepts the authority `Provider` to bind,
 * defaulting to `DirectGameReadAuthorityService` (see game-read-authority.port.ts and
 * direct-game-read-authority.service.ts) so Task 18 stays fully self-testable without Task 10.
 *
 * A later task (Task 10) swaps the real comparator-backed implementation in WITHOUT editing this
 * file: `app.module.ts` (which already owns the `TournamentOperationsBoardModule.register()`
 * call site) changes its argument to
 * `TournamentOperationsBoardModule.register({ provide: GAME_READ_AUTHORITY, useClass: CompareGameReadAuthorityService })`.
 * Because the binding then comes from `register()`'s parameter rather than a hardcoded class
 * reference inside this module, the override is a one-line change at the composition root and
 * this module's controller/service/tests are untouched.
 */
@Module({})
export class TournamentOperationsBoardModule {
  static register(authorityProvider: Provider = DEFAULT_GAME_READ_AUTHORITY_PROVIDER): DynamicModule {
    return {
      module: TournamentOperationsBoardModule,
      controllers: [TournamentOperationsBoardController],
      providers: [
        TournamentOperationsBoardService,
        V1AuthGuard,
        TournamentStaffAccessService,
        TournamentStaffGuard,
        authorityProvider,
      ],
    };
  }
}
