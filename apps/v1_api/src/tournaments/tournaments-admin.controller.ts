import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  AdminTournamentListQueryDto,
  ChangeTournamentStatusDto,
  CreateTournamentDto,
  PublishBracketDto,
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

  /** body 없이 호출하면 즉시 공개, `scheduledAt` 을 주면 그 시각에 공개되도록 예약한다. */
  @Post(':tournamentId/publish-bracket')
  publishBracket(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: PublishBracketDto,
  ) {
    return this.tournamentsAdminService.publishBracket(
      user,
      tournamentId,
      dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    );
  }

  /** 공개·예약을 모두 되돌린다(비공개 전환). */
  @Post(':tournamentId/unpublish-bracket')
  unpublishBracket(@CurrentUser() user: V1AuthUser, @Param('tournamentId') tournamentId: string) {
    return this.tournamentsAdminService.unpublishBracket(user, tournamentId);
  }
}
