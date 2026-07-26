import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TournamentsAdminController } from './tournaments-admin.controller';
import { TournamentsAdminService } from './tournaments-admin.service';
import { TournamentRegistrationsController } from './tournament-registrations.controller';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminRegistrationsService } from './admin-registrations.service';
import { TournamentBracketController } from './tournament-bracket.controller';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentPlayersController, TournamentPlayersAdminController } from './tournament-players.controller';
import { TournamentPlayersService } from './tournament-players.service';
import { TournamentsReadController } from './tournaments-read.controller';
import { TournamentsReadService } from './tournaments-read.service';
import { TournamentAnnouncementsController } from './tournament-announcements.controller';
import { TournamentAnnouncementsService } from './tournament-announcements.service';
import { TournamentPaymentExpiryService } from './tournament-payment-expiry.service';
import { TournamentSponsorsController } from './tournament-sponsors.controller';
import { TournamentSponsorsService } from './tournament-sponsors.service';
import { TournamentPopupController } from './tournament-popup.controller';
import { TournamentPopupService } from './tournament-popup.service';
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

/**
 * 대회(풋살 토너먼트) 도메인 모듈 — Wave 2-3.
 * 어드민 CRUD/신청확정/대진·결과·순위/공지 + 소비자 신청·명단·조회.
 * 결제는 계좌이체만 운영(어드민 confirm-payment 경로) — PG 카드 결제는 런칭 범위 외.
 *
 * 라우트 등록 순서 주의: 더 구체적인 경로(:tournamentId/registrations 등)를 가진
 * 컨트롤러를 와일드카드(:tournamentId) 컨트롤러보다 먼저 두어 매칭 모호성을 줄인다.
 */
@Module({
  imports: [AdminContextModule, NotificationsModule, IntegrationsModule],
  controllers: [
    TournamentCampaignsPublicController,
    TournamentCampaignsAdminController,
    TournamentsAdminController,
    AdminRegistrationsController,
    TournamentBracketController,
    TournamentPlayersController,
    TournamentPlayersAdminController,
    TournamentRegistrationsController,
    TournamentAnnouncementsController,
    TournamentSponsorsController,
    TournamentPopupController,
    TournamentReviewsController,
    TournamentsReadController,
  ],
  providers: [
    TournamentsAdminService,
    TournamentRegistrationsService,
    AdminRegistrationsService,
    TournamentBracketService,
    TournamentPlayersService,
    TournamentsReadService,
    TournamentAnnouncementsService,
    TournamentSponsorsService,
    TournamentPopupService,
    TournamentPaymentExpiryService,
    TournamentReviewsService,
    KakaoGeocodingService,
    TournamentCampaignReadService,
    TournamentCampaignAdminService,
    TournamentCampaignStatusService,
    OptionalV1AuthGuard,
    V1AuthGuard,
  ],
})
export class TournamentsModule {}
