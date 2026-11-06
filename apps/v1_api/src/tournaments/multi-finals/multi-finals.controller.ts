import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { MultiFinalAssignmentDto, MultiFinalAssignmentPreviewDto, MultiFinalGenerateDto, MultiFinalResetDto, MultiFinalSelectionDto, MultiFinalSetupDto } from './multi-finals.dto';
import { MultiFinalsService } from './multi-finals.service';

@Controller('admin/tournaments/:tournamentId/bracket/multi-finals')
@UseGuards(V1AuthGuard)
export class MultiFinalsController {
  constructor(private readonly finals: MultiFinalsService) {}
  @Get() get(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string) { return this.finals.get(user, id); }
  @Post('setup') setup(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalSetupDto) { return this.finals.setup(user, id, dto); }
  @Put('preliminary') updatePreliminary(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalSetupDto) { return this.finals.setup(user, id, dto, true); }
  @Post('reset') reset(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalResetDto) { return this.finals.reset(user, id, dto); }
  @Put('selection') select(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalSelectionDto) { return this.finals.select(user, id, dto); }
  @Post('assignment-preview') assignmentPreview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalAssignmentPreviewDto) { return this.finals.assignmentPreview(user, id, dto); }
  @Put('assignment') assign(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalAssignmentDto) { return this.finals.assign(user, id, dto); }
  @Post('preview') preview(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string) { return this.finals.preview(user, id); }
  @Post('generate') generate(@CurrentUser() user: V1AuthUser, @Param('tournamentId') id: string, @Body() dto: MultiFinalGenerateDto) { return this.finals.generate(user, id, dto); }
}
