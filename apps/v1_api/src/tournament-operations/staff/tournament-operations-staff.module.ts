import { Module } from '@nestjs/common';
import { OperationAuditModule } from '../../common/audit/operation-audit.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentStaffService } from '../../tournaments/staff/tournament-staff.service';
import { MyTournamentStaffAssignmentsController } from './my-tournament-staff-assignments.controller';
import { MyTournamentStaffAssignmentsService } from './my-tournament-staff-assignments.service';
import { TournamentOperationsStaffController } from './tournament-operations-staff.controller';
import { TournamentOperationsStaffService } from './tournament-operations-staff.service';

/**
 * apps/v1_api/src/tournaments/tournaments.module.ts (Task 7's real home for
 * TournamentStaffAccessService/TournamentStaffService) has no `exports`
 * array, so those providers cannot be imported via `imports:
 * [TournamentsModule]`. This module follows the exact precedent already set
 * by apps/v1_api/src/realtime/realtime.module.ts: locally re-provide the
 * Task 7 services instead of editing tournaments.module.ts (which is owned
 * by another lane).
 */
@Module({
  imports: [OperationAuditModule, RealtimeModule],
  controllers: [TournamentOperationsStaffController, MyTournamentStaffAssignmentsController],
  providers: [
    TournamentStaffAccessService,
    TournamentStaffService,
    TournamentOperationsStaffService,
    MyTournamentStaffAssignmentsService,
  ],
})
export class TournamentOperationsStaffModule {}
