import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { RequireTournamentStaff } from '../../tournaments/staff/require-tournament-staff.decorator';
import { TournamentStaffGuard, type TournamentStaffRequest } from '../../tournaments/staff/tournament-staff.guard';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { ListTournamentOperationsQueryDto } from './dto/list-operations-query.dto';
import { TournamentOperationsBoardService } from './tournament-operations-board.service';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/**
 * Frozen contract (docs/api/global-contract.md):
 * `GET /api/v1/tournament-ops/tournaments/:tournamentId/operations` -> incremental fixture
 * snapshot + watermark. Actor: assigned tournament staff.
 *
 * `TournamentStaffGuard` requires `V1AuthGuard` to run first so `request.v1User` is populated
 * (see tournament-staff.guard.ts) -- guard order below is left-to-right significant.
 *
 * ## `request.tournamentStaff` is forwarded into the service (Task 18 review P0-2)
 * `TournamentStaffGuard` computes and stores a `TournamentStaffPrincipal` on the request before
 * ever letting a call through (`tournament-staff.guard.ts`'s `canActivate()`), but a prior version
 * of this handler discarded it -- calling `this.board.list(tournamentId, query)` with no actor
 * context at all. That left the service structurally unable to re-verify anything: an assignment
 * revoked in the (however narrow) window between the guard's decision and this transaction's own
 * reads would still be served a 200 built from a fully-authorized snapshot. `request.tournamentStaff`
 * is now threaded through so `TournamentOperationsBoardService.list()` can re-check it fresh, as the
 * first statement inside its own read transaction, before building the response (see that
 * service's doc comment). `request.tournamentStaff` is only possibly `undefined` in its OWN type
 * because `TournamentStaffGuard` sets it optionally on the shared request type; in practice this
 * handler is unreachable unless the guard already populated it (the guard throws before returning
 * `true` otherwise), so passing it straight through here is safe.
 */
@Controller('tournament-ops/tournaments/:tournamentId/operations')
@UseGuards(V1AuthGuard, TournamentStaffGuard)
export class TournamentOperationsBoardController {
  constructor(private readonly board: TournamentOperationsBoardService) {}

  @Get()
  @RequireTournamentStaff({ action: 'read' })
  list(
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Query() query: ListTournamentOperationsQueryDto,
    @Req() request: TournamentStaffRequest,
  ) {
    return this.board.list(tournamentId, query, undefined, request.tournamentStaff);
  }
}
