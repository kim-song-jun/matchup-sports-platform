import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { UpdateDisputeStatusDto } from './dto/update-dispute-status.dto';

@ApiTags('관리자 - 분쟁')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
@Controller('admin/disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @ApiOperation({ summary: '분쟁 목록 조회' })
  findAll(@Query('status') status?: string, @Query('type') type?: string) {
    return this.disputesService.findAll({ status, type });
  }

  @Get(':id')
  @ApiOperation({ summary: '분쟁 상세 조회' })
  findOne(@Param('id') id: string) {
    return this.disputesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: '분쟁 생성' })
  create(@Body() body: CreateDisputeDto) {
    return this.disputesService.create({
      reporterTeamId: body.reporterTeamId,
      reportedTeamId: body.reportedTeamId,
      teamMatchId: body.teamMatchId,
      type: body.type,
      description: body.description,
    });
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '분쟁 상태 변경' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateDisputeStatusDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.disputesService.updateStatus(id, {
      status: body.status,
      resolution: body.resolution,
      note: body.note,
      actor: actorId,
    });
  }
}
