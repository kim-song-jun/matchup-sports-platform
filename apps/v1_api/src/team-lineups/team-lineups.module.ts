import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LineupTodoService } from './lineup-todo.service';
import { LineupTodosController } from './lineup-todos.controller';
import { TeamLineupHistoryService } from './team-lineup-history.service';
import { TeamLineupPresetService } from './team-lineup-preset.service';
import { TeamLineupsController } from './team-lineups.controller';

@Module({
  imports: [PrismaModule],
  controllers: [TeamLineupsController, LineupTodosController],
  providers: [TeamLineupHistoryService, TeamLineupPresetService, LineupTodoService],
  exports: [LineupTodoService],
})
export class TeamLineupsModule {}
