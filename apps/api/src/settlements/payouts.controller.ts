import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreatePayoutBatchDto } from './dto/create-payout-batch.dto';
import { MarkPayoutPaidDto } from './dto/mark-payout-paid.dto';
import { MarkPayoutFailedDto } from './dto/mark-payout-failed.dto';

@ApiTags('관리자 - 지급')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
@Controller('admin/payouts')
export class PayoutsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @ApiOperation({ summary: '지급 목록 조회 (커서 기반 페이지네이션)' })
  @ApiResponse({ status: 200, description: '지급 목록' })
  findAll(
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit !== undefined && !Number.isNaN(parsedLimit)
        ? Math.min(Math.max(1, parsedLimit), 100)
        : undefined;
    // @ts-expect-error Wave 1 service pending — findAllPayouts added by backend-data-dev
    return this.settlementsService.findAllPayouts({ status, cursor, limit: safeLimit });
  }

  @Get('eligible')
  @ApiOperation({ summary: '지급 대상 정산 목록 — 조건 충족 후 미지급 항목' })
  @ApiResponse({ status: 200, description: '지급 대상 목록' })
  findEligible(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit !== undefined && !Number.isNaN(parsedLimit)
        ? Math.min(Math.max(1, parsedLimit), 100)
        : undefined;
    return this.settlementsService.listReleasedSettlements({ cursor, limit: safeLimit });
  }

  @Post('batch')
  @ApiOperation({ summary: '지급 배치 처리 — eligible 항목을 일괄 Payout 레코드 생성' })
  @ApiResponse({ status: 201, description: '배치 지급 생성 완료' })
  @ApiResponse({ status: 400, description: 'PAYOUT_BATCH_EMPTY — 지급 대상 없음' })
  createBatch(
    @Body() body: CreatePayoutBatchDto,
    @CurrentUser('id') _adminId: string,
  ) {
    return this.settlementsService.createPayoutBatch(body.settlementIds ?? []);
  }

  @Patch(':id/mark-paid')
  @ApiOperation({ summary: '지급 완료 처리 — 외부 송금 확인 후 상태 업데이트' })
  @ApiResponse({ status: 200, description: '지급 완료 처리됨' })
  @ApiResponse({ status: 400, description: 'PAYOUT_STATUS_INVALID' })
  @ApiResponse({ status: 404, description: 'PAYOUT_NOT_FOUND' })
  markPaid(
    @Param('id') id: string,
    @Body() body: MarkPayoutPaidDto,
    @CurrentUser('id') _adminId: string,
  ) {
    return this.settlementsService.markPayoutPaid(id, body.note);
  }

  @Patch(':id/mark-failed')
  @ApiOperation({ summary: '지급 실패 처리 — 송금 실패 기록' })
  @ApiResponse({ status: 200, description: '지급 실패 처리됨' })
  @ApiResponse({ status: 400, description: 'PAYOUT_STATUS_INVALID' })
  @ApiResponse({ status: 404, description: 'PAYOUT_NOT_FOUND' })
  markFailed(
    @Param('id') id: string,
    @Body() body: MarkPayoutFailedDto,
    @CurrentUser('id') _adminId: string,
  ) {
    // @ts-expect-error Wave 1 service pending — markPayoutFailed added by backend-data-dev
    return this.settlementsService.markPayoutFailed(id, body.reason, body.note);
  }
}
