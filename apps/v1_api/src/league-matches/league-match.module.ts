import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { GamesModule } from '../games/games.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { LeagueMatchAdminController } from './league-match-admin.controller';
import { LeagueMatchAdminService } from './league-match-admin.service';
import { LeagueMatchPublicController } from './league-match-public.controller';
import { LeagueMatchPublicService } from './league-match-public.service';
import { LeagueSeriesAdminController } from './league-series-admin.controller';
import { LeagueSeriesAdminService } from './league-series-admin.service';

@Module({
  imports: [AdminContextModule, GamesModule],
  controllers: [LeagueMatchAdminController, LeagueMatchPublicController, LeagueSeriesAdminController],
  providers: [LeagueMatchAdminService, LeagueMatchPublicService, LeagueSeriesAdminService, OptionalV1AuthGuard, V1AuthGuard],
})
export class LeagueMatchModule {}
