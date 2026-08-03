import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { RequireTournamentStaff } from '../../tournaments/staff/require-tournament-staff.decorator';
import { TournamentStaffGuard } from '../../tournaments/staff/tournament-staff.guard';
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
  ) {
    return this.board.list(tournamentId, query);
  }
}
