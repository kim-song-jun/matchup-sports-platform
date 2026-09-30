import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { PopupsModule } from '../popups/popups.module';
import { TeamLineupsModule } from '../team-lineups/team-lineups.module';
import { HomeController } from './home.controller';
import { HomeTeamActivityService } from './home-team-activity.service';
import { HomeService } from './home.service';

@Module({
  imports: [PopupsModule, TeamLineupsModule],
  controllers: [HomeController],
  providers: [HomeService, HomeTeamActivityService, OptionalV1AuthGuard],
})
export class HomeModule {}
