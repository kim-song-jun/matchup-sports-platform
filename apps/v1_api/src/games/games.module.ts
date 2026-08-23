import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OperationAuditModule } from '../common/audit/operation-audit.module';
import { GamesController } from './games.controller';
import {
  MyTournamentFixturesController,
  TournamentFixtureLineupAccessController,
} from './tournament-fixture-lineup-access.controller';
import { GameBroadcastRegistry } from './game-broadcast.registry';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';
import { TournamentDisciplineService } from '../tournaments/discipline/tournament-discipline.service';

@Module({
  imports: [OperationAuditModule],
  controllers: [
    GamesController,
    TournamentFixtureLineupAccessController,
    MyTournamentFixturesController,
  ],
  providers: [
    GamesService,
    // 카드 누적 출전정지 판정. 순수 규칙(card-suspension.ts)과 분리돼 있고 조회만 한다.
    TournamentDisciplineService,
    GameTakeoverService,
    GameBroadcastRegistry,
    OptionalV1AuthGuard,
    V1AuthGuard,
  ],
  exports: [GamesService, GameTakeoverService, GameBroadcastRegistry, TournamentDisciplineService],
})
export class GamesModule {}
