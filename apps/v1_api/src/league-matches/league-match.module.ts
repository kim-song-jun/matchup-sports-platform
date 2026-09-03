import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { GamesModule } from '../games/games.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
// 리그 경기 영상(대회 영상의 팀매치 판) — 다른 컨트롤러들과 같은 이유로 별도 파일 등록.
import { LeagueFixtureVideosController } from './league-fixture-videos.controller';
import { LeagueFixtureVideosService } from './league-fixture-videos.service';
import { LeagueMatchAdminController } from './league-match-admin.controller';
import { LeagueMatchAdminService } from './league-match-admin.service';
// D2: 리그 결과 이의 제기(팀) + 수락/거부(운영자). LeagueMatchForfeitController/-Service와
// 같은 이유로 별도 파일로 추가해 여기서만 등록한다.
import { LeagueMatchDisputeController, LeagueMatchDisputeAdminController } from './league-match-dispute.controller';
import { LeagueMatchDisputeService } from './league-match-dispute.service';
import { LeagueMatchForfeitController } from './league-match-forfeit.controller';
import { LeagueMatchForfeitService } from './league-match-forfeit.service';
import { LeagueMatchPublicController } from './league-match-public.controller';
import { LeagueMatchPublicService } from './league-match-public.service';
// ⚠️ Task 165 BE-3 이 이 서비스의 **HTTP 표면을 지웠다**(컨트롤러·DTO·프론트 모달).
// 남아 있는 이유는 하나뿐이다 — `LeagueMatchDisputeService` 의 이의 수락이
// `correctResult` 를 부른다. 정본이 이의 자체를 제거하기로 확정했으므로
// **Task 166 에서 그 호출부와 함께 삭제**된다. 여기에 새 소비처를 붙이지 마라.
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
  // UploadsModule: 리그 경기 영상 업로드(LeagueFixtureVideosService)가 UploadsService 를 쓴다.
  imports: [AdminContextModule, GamesModule, NotificationsModule, UploadsModule],
  controllers: [
    LeagueMatchAdminController,
    LeagueMatchDisputeController,
    LeagueMatchDisputeAdminController,
    // #750 후속 등록 — import 구문만 있고 이 배열에 빠져 있어 라우트가 404 였다(alpha 실측).
    LeagueFixtureVideosController,
    LeagueMatchForfeitController,
    LeagueMatchPublicController,
    LeagueSeriesAdminController,
  ],
  providers: [
    LeagueFixtureVideosService,
    LeagueMatchAdminService,
    LeagueMatchDisputeService,
    LeagueMatchForfeitService,
    LeagueMatchPublicService,
    LeagueMatchResultEntryService,
    LeagueSeriesAdminService,
    OptionalV1AuthGuard,
    V1AuthGuard,
  ],
})
export class LeagueMatchModule {}
