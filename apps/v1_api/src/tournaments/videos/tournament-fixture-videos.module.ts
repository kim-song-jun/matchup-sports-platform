import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { UploadsModule } from '../../uploads/uploads.module';
import { TournamentStaffAccessService } from '../staff/tournament-staff-access.service';
import { TournamentFixtureVideosController } from './tournament-fixture-videos.controller';
import { TournamentFixtureVideosService } from './tournament-fixture-videos.service';

/**
 * `tournaments.module.ts` 에는 `exports` 가 없어 `TournamentStaffAccessService` 를
 * `imports: [TournamentsModule]` 로 가져올 수 없다. 형제 모듈들(tournament-operations/*)이
 * 이미 쓰는 선례대로, 그 파일을 건드리지 않고 여기서 지역 provider 로 다시 등록한다.
 * `PrismaService` 는 `PrismaModule` 이 `@Global()` 이라 별도 import 가 필요 없다.
 */
@Module({
  imports: [UploadsModule],
  controllers: [TournamentFixtureVideosController],
  providers: [TournamentFixtureVideosService, TournamentStaffAccessService, V1AuthGuard],
})
export class TournamentFixtureVideosModule {}
