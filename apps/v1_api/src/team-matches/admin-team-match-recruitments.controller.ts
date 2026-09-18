import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminTeamMatchRecruitmentsService } from './admin-team-match-recruitments.service';
import {
  AssignAdminTeamMatchApplicationsDto,
  CreateAdminTeamMatchRecruitmentDto,
} from './dto/admin-team-match-recruitment.dto';

@Controller('admin/team-matches')
@UseGuards(V1AuthGuard)
export class AdminTeamMatchRecruitmentsController {
  constructor(private readonly service: AdminTeamMatchRecruitmentsService) {}

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateAdminTeamMatchRecruitmentDto) {
    return this.service.create(user, dto);
  }

  @Post(':teamMatchId/assign')
  assign(
    @CurrentUser() user: V1AuthUser,
    @Param('teamMatchId', ParseUUIDPipe) teamMatchId: string,
    @Body() dto: AssignAdminTeamMatchApplicationsDto,
  ) {
    return this.service.assign(user, teamMatchId, dto);
  }
}
