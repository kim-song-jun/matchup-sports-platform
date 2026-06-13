import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { TournamentsAdminController } from './tournaments-admin.controller';
import { TournamentsAdminService } from './tournaments-admin.service';

/**
 * 대회(풋살 토너먼트) 도메인 모듈. Wave 2 skeleton — 어드민 V1Tournament CRUD.
 * 이후 신청/명단/결제/대진/순위 컨트롤러·서비스가 같은 모듈에 추가된다.
 */
@Module({
  imports: [AdminContextModule],
  controllers: [TournamentsAdminController],
  providers: [TournamentsAdminService, V1AuthGuard],
})
export class TournamentsModule {}
