import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeamLineupHistoryService } from './team-lineup-history.service';
import { TeamLineupPresetService } from './team-lineup-preset.service';
import { TeamLineupsController } from './team-lineups.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TeamLineupsController],
  providers: [TeamLineupHistoryService, TeamLineupPresetService],
})
export class TeamLineupsModule {}
