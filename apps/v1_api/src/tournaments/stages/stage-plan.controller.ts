import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { StagePlanService } from './stage-plan.service';
import { StageAssignDto, StageVersionDto } from './stage-plan.dto';
@Controller('admin/tournaments/:tournamentId/stages')
@UseGuards(V1AuthGuard)
export class StagePlanController {
  constructor(private readonly stages: StagePlanService) {}
  @Get() get(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string) { return this.stages.get(user, id); }
  @Post('generate') generate(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: StageVersionDto) { return this.stages.generate(user, id, dto); }
  @Put('assignment') assign(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: StageAssignDto) { return this.stages.assign(user, id, dto); }
}
