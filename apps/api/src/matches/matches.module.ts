import { Module } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { MatchingEngineService } from './matching-engine.service';

@Module({
  controllers: [MatchesController],
  providers: [MatchesService, MatchingEngineService],
  exports: [MatchesService],
})
export class MatchesModule {}
