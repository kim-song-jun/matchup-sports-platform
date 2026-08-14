import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module';
import { TournamentStaffAccessService } from '../tournaments/staff/tournament-staff-access.service';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  imports: [GamesModule],
  providers: [RealtimeGateway, TournamentStaffAccessService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
