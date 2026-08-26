import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OperationAuditModule } from '../common/audit/operation-audit.module';
import { WebPushModule } from '../notifications/web-push.module';
import { GamesController } from './games.controller';
import { LeagueFixtureClaimAccessController } from './league-fixture-claim-access.controller';
import {
  MyTournamentFixturesController,
  TournamentFixtureLineupAccessController,
} from './tournament-fixture-lineup-access.controller';
import { GameBroadcastRegistry } from './game-broadcast.registry';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

// WebPushModule: 신원 연결 승인 요청 푸시(2026-08-26). NotificationsServiceModule 을 통째로
// import 하면 RealtimeModule → GamesModule 순환이 되므로, WebPushService 만 담은 최소 모듈을
// 쓴다(web-push.module.ts 헤더 참조).
@Module({
  imports: [OperationAuditModule, WebPushModule],
  controllers: [
    GamesController,
    TournamentFixtureLineupAccessController,
    MyTournamentFixturesController,
    LeagueFixtureClaimAccessController,
  ],
  providers: [
    GamesService,
    GameTakeoverService,
    GameBroadcastRegistry,
    OptionalV1AuthGuard,
    V1AuthGuard,
  ],
  exports: [GamesService, GameTakeoverService, GameBroadcastRegistry],
})
export class GamesModule {}
