import { Module } from '@nestjs/common';
import { OperationAuditModule } from '../../common/audit/operation-audit.module';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentOperationsFieldsController } from './tournament-operations-fields.controller';
import { TournamentOperationsFieldsService } from './tournament-operations-fields.service';

/**
 * apps/v1_api/src/tournaments/tournaments.module.ts (Task 7's real home for
 * TournamentStaffAccessService) has no `exports` array, so it cannot be
 * imported via `imports: [TournamentsModule]`. This follows the exact
 * precedent already set by apps/v1_api/src/realtime/realtime.module.ts and
 * the sibling tournament-operations/staff + tournament-operations/lineups
 * modules: locally re-provide the Task 7 service instead of editing
 * tournaments.module.ts (owned by another lane).
 */
@Module({
  imports: [OperationAuditModule],
  controllers: [TournamentOperationsFieldsController],
  providers: [TournamentStaffAccessService, TournamentOperationsFieldsService],
})
export class TournamentOperationsFieldsModule {}
