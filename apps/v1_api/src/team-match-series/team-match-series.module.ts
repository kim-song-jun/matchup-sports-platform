import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { GamesModule } from '../games/games.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TeamMatchSeriesAdminController } from './team-match-series-admin.controller';
import { TeamMatchSeriesAdminService } from './team-match-series-admin.service';
import { TeamMatchSeriesPublicController } from './team-match-series-public.controller';
import { TeamMatchSeriesPublicService } from './team-match-series-public.service';

@Module({
  imports: [AdminContextModule, GamesModule],
  controllers: [TeamMatchSeriesAdminController, TeamMatchSeriesPublicController],
  providers: [TeamMatchSeriesAdminService, TeamMatchSeriesPublicService, OptionalV1AuthGuard, V1AuthGuard],
})
export class TeamMatchSeriesModule {}
