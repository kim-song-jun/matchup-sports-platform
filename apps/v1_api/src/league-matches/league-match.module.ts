import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { GamesModule } from '../games/games.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { LeagueMatchAdminController } from './league-match-admin.controller';
import { LeagueMatchAdminService } from './league-match-admin.service';
import { LeagueMatchForfeitController } from './league-match-forfeit.controller';
import { LeagueMatchForfeitService } from './league-match-forfeit.service';
import { LeagueMatchPublicController } from './league-match-public.controller';
import { LeagueMatchPublicService } from './league-match-public.service';
// D1-a: 운영자가 리그 결과를 직접 입력·정정하는 경로. LeagueMatchForfeitController/
// -Service 와 같은 이유로 별도 파일로 추가해 여기서만 등록한다.
import { LeagueMatchResultEntryController } from './league-match-result-entry.controller';
import { LeagueMatchResultEntryService } from './league-match-result-entry.service';
import { LeagueSeriesAdminController } from './league-series-admin.controller';
import { LeagueSeriesAdminService } from './league-series-admin.service';

// LeagueMatchForfeitController/-Service (R11, C-6): league-match-admin.*는 레인 F
// 소유라 직접 편집하지 않고 별도 파일로 추가해 여기서만 등록한다.
// NotificationsModule: 리그 감사 그룹 A / R2·R3 — LeagueMatchAdminService(대진 배정 알림)와
// LeagueSeriesAdminService(승강 확정 알림)가 둘 다 NotificationsService를 쓴다. team-matches.module.ts와
// 동일하게 전체 NotificationsModule을 가져온다(HTTP 앱 그래프 안에서는 여러 feature 모듈이 같은
// 선언 모듈을 import해도 Nest가 하나의 공유 인스턴스로 묶는다 — 이미 TeamMatchesModule에서 쓰는 패턴).
@Module({
  imports: [AdminContextModule, GamesModule, NotificationsModule],
  controllers: [
    LeagueMatchAdminController,
    LeagueMatchForfeitController,
    LeagueMatchPublicController,
    LeagueMatchResultEntryController,
    LeagueSeriesAdminController,
  ],
  providers: [
    LeagueMatchAdminService,
    LeagueMatchForfeitService,
    LeagueMatchPublicService,
    LeagueMatchResultEntryService,
    LeagueSeriesAdminService,
    OptionalV1AuthGuard,
    V1AuthGuard,
  ],
})
export class LeagueMatchModule {}
