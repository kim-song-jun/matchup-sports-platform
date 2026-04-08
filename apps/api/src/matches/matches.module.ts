import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { MatchingEngineService } from './matching-engine.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [MatchesController],
  providers: [MatchesService, MatchingEngineService],
  exports: [MatchesService],
})
export class MatchesModule {}
