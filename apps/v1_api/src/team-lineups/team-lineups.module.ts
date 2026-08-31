import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LineupTodoService } from './lineup-todo.service';
import { LineupTodosController } from './lineup-todos.controller';
import { TeamLineupHistoryService } from './team-lineup-history.service';
import { TeamLineupPresetService } from './team-lineup-preset.service';
import { TeamLineupsController } from './team-lineups.controller';
import { TeamTacticsBoardController } from './team-tactics-board.controller';
import { TeamTacticsBoardService } from './team-tactics-board.service';
import { TeamUpcomingGamesService } from './team-upcoming-games.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeamLineupsController, LineupTodosController, TeamTacticsBoardController],
  providers: [
    TeamLineupHistoryService,
    TeamLineupPresetService,
    LineupTodoService,
    TeamTacticsBoardService,
    TeamUpcomingGamesService,
  ],
  exports: [LineupTodoService],
})
export class TeamLineupsModule {}
