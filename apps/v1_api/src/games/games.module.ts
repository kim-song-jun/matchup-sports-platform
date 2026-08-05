import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OperationAuditModule } from '../common/audit/operation-audit.module';
import { GamesController } from './games.controller';
import { TournamentFixtureLineupAccessController } from './tournament-fixture-lineup-access.controller';
import { GameTakeoverService } from './game-takeover.service';
import { GamesService } from './games.service';

@Module({
  imports: [OperationAuditModule],
  controllers: [GamesController, TournamentFixtureLineupAccessController],
  providers: [GamesService, GameTakeoverService, OptionalV1AuthGuard, V1AuthGuard],
  exports: [GamesService, GameTakeoverService],
})
export class GamesModule {}
