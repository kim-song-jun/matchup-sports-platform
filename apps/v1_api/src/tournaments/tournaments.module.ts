import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TournamentsAdminController } from './tournaments-admin.controller';
import { TournamentsAdminService } from './tournaments-admin.service';
import { TournamentRegistrationsController } from './tournament-registrations.controller';
import { TournamentRegistrationsService } from './tournament-registrations.service';

/**
 * 대회(풋살 토너먼트) 도메인 모듈. Wave 2 — 어드민 V1Tournament CRUD +
 * 팀단위 신청 상태머신(V1TournamentRegistration). 이후 명단/결제/대진/순위 추가.
 */
@Module({
  imports: [AdminContextModule],
  controllers: [TournamentsAdminController, TournamentRegistrationsController],
  providers: [TournamentsAdminService, TournamentRegistrationsService, V1AuthGuard],
})
export class TournamentsModule {}
