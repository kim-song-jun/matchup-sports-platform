import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OperationAuditModule } from '../common/audit/operation-audit.module';
import { GamesModule } from '../games/games.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { TeamMatchLineupService } from './team-match-lineup.service';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchesService } from './team-matches.service';
import { AdminTeamMatchRecruitmentsController } from './admin-team-match-recruitments.controller';
import { AdminTeamMatchRecruitmentsService } from './admin-team-match-recruitments.service';

@Module({
  imports: [AdminContextModule, GamesModule, NotificationsModule, OperationAuditModule],
  controllers: [TeamMatchesController, AdminTeamMatchRecruitmentsController],
  providers: [
    TeamMatchesService,
    AdminTeamMatchRecruitmentsService,
    TeamMatchLineupService,
    OptionalV1AuthGuard,
    V1AuthGuard,
    CreatorProfileGuard,
  ],
})
export class TeamMatchesModule {}
