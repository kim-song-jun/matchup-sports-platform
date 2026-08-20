import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { GamesModule } from '../games/games.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { LeagueMatchAdminController } from './league-match-admin.controller';
import { LeagueMatchAdminService } from './league-match-admin.service';
import { LeagueMatchForfeitController } from './league-match-forfeit.controller';
import { LeagueMatchForfeitService } from './league-match-forfeit.service';
import { LeagueMatchPublicController } from './league-match-public.controller';
import { LeagueMatchPublicService } from './league-match-public.service';

// LeagueMatchForfeitController/-Service (R11, C-6): league-match-admin.*는 레인 F
// 소유라 직접 편집하지 않고 별도 파일로 추가해 여기서만 등록한다.
@Module({
  imports: [AdminContextModule, GamesModule],
  controllers: [LeagueMatchAdminController, LeagueMatchForfeitController, LeagueMatchPublicController],
  providers: [
    LeagueMatchAdminService,
    LeagueMatchForfeitService,
    LeagueMatchPublicService,
    OptionalV1AuthGuard,
    V1AuthGuard,
  ],
})
export class LeagueMatchModule {}
