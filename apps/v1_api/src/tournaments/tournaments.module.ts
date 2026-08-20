import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { OperationAuditModule } from '../common/audit/operation-audit.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TournamentsAdminController } from './tournaments-admin.controller';
import { MockTournamentSeedController } from './mock-seed/mock-tournament-seed.controller';
import { MockTournamentSeedService } from './mock-seed/mock-tournament-seed.service';
import { TournamentsAdminService } from './tournaments-admin.service';
import { TournamentRegistrationsController } from './tournament-registrations.controller';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';
import { TournamentBracketController } from './tournament-bracket.controller';
import { TournamentBracketService } from './tournament-bracket.service';
import { LeagueFixtureGeneratorService } from './league-fixture-generator.service';
import { TournamentPlayersController, TournamentPlayersAdminController } from './tournament-players.controller';
import { TournamentPlayersService } from './tournament-players.service';
import { TournamentsReadController } from './tournaments-read.controller';
import { TournamentsReadService } from './tournaments-read.service';
import { TournamentAnnouncementsController } from './tournament-announcements.controller';
import { TournamentAnnouncementsService } from './tournament-announcements.service';
import { TournamentSponsorsController } from './tournament-sponsors.controller';
import { TournamentSponsorsService } from './tournament-sponsors.service';
import { TournamentReviewsController } from './tournament-reviews.controller';
import { TournamentReviewsService } from './tournament-reviews.service';
import { KakaoGeocodingService } from './kakao-geocoding.service';
import {
  TournamentCampaignsAdminController,
  TournamentCampaignsPublicController,
} from './tournament-campaigns.controller';
import { TournamentCampaignAdminService } from './tournament-campaign-admin.service';
import { TournamentCampaignReadService } from './tournament-campaign-read.service';
import { TournamentCampaignStatusService } from './tournament-campaign-status.service';
import { GamesModule } from '../games/games.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TournamentStaffAccessService } from './staff/tournament-staff-access.service';
import { TournamentStaffGuard } from './staff/tournament-staff.guard';
import { TournamentStaffService } from './staff/tournament-staff.service';
import { TournamentResultReviewController } from '../tournament-operations/results/tournament-result-review.controller';
import { TournamentResultReviewService } from '../tournament-operations/results/tournament-result-review.service';
// Task 24: `apps/v1_api/src/games/public-records` is fully self-contained
// (own controllers/providers, no other feature module dependency) and
// mounts three additional public route families
// (`tournaments/:id/schedule`, `tournaments/:id/matches/:fixtureId`,
// `teams/:id/records`, `users/:id/records`). It is wired in here -- rather
// than into `app.module.ts` (Todo 26's exclusively owned output) or
// `games/games.module.ts` (Todo 6's owned output) -- because this file is
// not a declared output of any todo in the Task 127 ledger, matching the
// precedent already set by `TournamentResultReviewController`/`Service`
// above (also wired into this same unowned file, not into a todo-owned
// one). No other file in this module is touched.
import { PublicRecordsModule } from '../games/public-records/public-records.module';

/**
 * 대회(풋살 토너먼트) 도메인 모듈 — Wave 2-3.
 * 어드민 CRUD/신청확정/대진·결과·순위/공지 + 소비자 신청·명단·조회.
 * 결제는 계좌이체만 운영(어드민 confirm-payment 경로) — PG 카드 결제는 런칭 범위 외.
 *
 * 라우트 등록 순서 주의: 더 구체적인 경로(:tournamentId/registrations 등)를 가진
 * 컨트롤러를 와일드카드(:tournamentId) 컨트롤러보다 먼저 두어 매칭 모호성을 줄인다.
 */
@Module({
  imports: [
    AdminContextModule,
    NotificationsModule,
    IntegrationsModule,
    GamesModule,
    OperationAuditModule,
    RealtimeModule,
    PublicRecordsModule,
  ],
  controllers: [
    TournamentCampaignsPublicController,
    TournamentCampaignsAdminController,
    TournamentsAdminController,
    MockTournamentSeedController,
    AdminRegistrationsController,
    TournamentBracketController,
    TournamentPlayersController,
    TournamentPlayersAdminController,
    TournamentRegistrationsController,
    TournamentAnnouncementsController,
    TournamentSponsorsController,
    TournamentReviewsController,
    TournamentsReadController,
    TournamentResultReviewController,
  ],
  providers: [
    MockTournamentSeedService,
    TournamentsAdminService,
    TournamentRegistrationsService,
    AdminRegistrationsService,
    TournamentBracketService,
    LeagueFixtureGeneratorService,
    TournamentPlayersService,
    TournamentsReadService,
    TournamentAnnouncementsService,
    TournamentSponsorsService,
    TournamentReviewsService,
    KakaoGeocodingService,
    TournamentCampaignReadService,
    TournamentCampaignAdminService,
    TournamentCampaignStatusService,
    OptionalV1AuthGuard,
    V1AuthGuard,
    TournamentStaffAccessService,
    TournamentStaffGuard,
    TournamentStaffService,
    TournamentResultReviewService,
  ],
})
export class TournamentsModule {}
