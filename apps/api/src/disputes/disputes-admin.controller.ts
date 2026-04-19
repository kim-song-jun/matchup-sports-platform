import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@ApiTags('관리자 - 분쟁')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
@Controller('admin/disputes')
export class DisputesAdminController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  @ApiOperation({ summary: '분쟁 목록 (전체, 관리자)' })
  @ApiResponse({ status: 200, description: '커서 기반 페이지네이션' })
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit !== undefined && !Number.isNaN(parsedLimit)
        ? Math.min(Math.max(1, parsedLimit), 100)
        : undefined;
    return this.disputesService.findAllAdmin({ status, type, cursor, limit: safeLimit });
  }

  @Get(':id')
  @ApiOperation({ summary: '분쟁 상세 (관리자)' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  findOne(@Param('id') id: string) {
    return this.disputesService.findOneAdmin(id);
  }

  @Post(':id/review')
  @ApiOperation({ summary: '검토 시작 — 분쟁 상태를 under_review 로 전환' })
  @ApiResponse({ status: 200, description: '검토 시작 완료' })
  @ApiResponse({ status: 400, description: 'DISPUTE_STATUS_INVALID' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  startReview(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.disputesService.startReview(id, adminId);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: '분쟁 처리 — 환불/지급/부분환불/기각 결정' })
  @ApiResponse({ status: 200, description: '분쟁 처리 완료' })
  @ApiResponse({ status: 400, description: 'DISPUTE_STATUS_INVALID — 처리 불가 상태' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  resolve(
    @Param('id') id: string,
    @Body() body: ResolveDisputeDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.disputesService.resolve(id, adminId, body);
  }
}
