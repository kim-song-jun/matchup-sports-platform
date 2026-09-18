import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminAssignedTeamMatchesService } from './admin-assigned-team-matches.service';
import { CreateAdminAssignedTeamMatchDto } from './dto/create-admin-assigned-team-match.dto';

@Controller('admin/team-matches')
@UseGuards(V1AuthGuard)
export class AdminAssignedTeamMatchesController {
  constructor(private readonly service: AdminAssignedTeamMatchesService) {}

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateAdminAssignedTeamMatchDto) {
    return this.service.create(user, dto);
  }
}
