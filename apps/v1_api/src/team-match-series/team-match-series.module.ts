import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { GamesModule } from '../games/games.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TeamMatchSeriesAdminController } from './team-match-series-admin.controller';
import { TeamMatchSeriesAdminService } from './team-match-series-admin.service';

@Module({
  imports: [AdminContextModule, GamesModule],
  controllers: [TeamMatchSeriesAdminController],
  providers: [TeamMatchSeriesAdminService, V1AuthGuard],
})
export class TeamMatchSeriesModule {}
