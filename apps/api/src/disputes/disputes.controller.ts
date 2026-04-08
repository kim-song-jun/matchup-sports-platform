import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';

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
  create(
    @Body()
    body: {
      reporterTeamId: string;
      reportedTeamId: string;
      teamMatchId: string;
      type: 'no_show' | 'late' | 'level_mismatch' | 'misconduct';
      description: string;
    },
  ) {
    return this.disputesService.create(body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '분쟁 상태 변경' })
  updateStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
      resolution?: string;
      note?: string;
      actor?: string;
    },
  ) {
    return this.disputesService.updateStatus(id, body);
  }
}
