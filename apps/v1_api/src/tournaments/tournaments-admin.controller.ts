import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminTournamentListQueryDto,
  ChangeTournamentStatusDto,
  CreateTournamentDto,
  UpdateTournamentDto,
} from './dto/admin-tournament.dto';
import { TournamentsAdminService } from './tournaments-admin.service';

@Controller('admin/tournaments')
@UseGuards(V1AuthGuard)
export class TournamentsAdminController {
  constructor(private readonly tournamentsAdminService: TournamentsAdminService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query() query: AdminTournamentListQueryDto) {
    return this.tournamentsAdminService.list(user, query);
  }

  @Get(':tournamentId')
  get(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.tournamentsAdminService.get(user, tournamentId);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateTournamentDto) {
    return this.tournamentsAdminService.create(user, dto);
  }

  @Patch(':tournamentId')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsAdminService.update(user, tournamentId, dto);
  }

  @Post(':tournamentId/status')
  changeStatus(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ChangeTournamentStatusDto,
  ) {
    return this.tournamentsAdminService.changeStatus(user, tournamentId, dto);
  }

  @Post(':tournamentId/publish-bracket')
  publishBracket(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.tournamentsAdminService.publishBracket(user, tournamentId);
  }
}
