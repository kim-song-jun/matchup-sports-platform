import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OperationAuditModule } from '../common/audit/operation-audit.module';
import { GamesModule } from '../games/games.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { TeamMatchLineupService } from './team-match-lineup.service';
import { TeamMatchesController } from './team-matches.controller';
import { TeamMatchesService } from './team-matches.service';

@Module({
  imports: [GamesModule, NotificationsModule, OperationAuditModule],
  controllers: [TeamMatchesController],
  providers: [
    TeamMatchesService,
    TeamMatchLineupService,
    OptionalV1AuthGuard,
    V1AuthGuard,
    CreatorProfileGuard,
  ],
})
export class TeamMatchesModule {}
