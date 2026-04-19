import { Controller, Get, Post, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PayoutStatus } from '@prisma/client';
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
    const allowedStatuses: PayoutStatus[] = ['pending', 'processing', 'paid', 'failed'];
    const safeStatus =
      status && allowedStatuses.includes(status as PayoutStatus)
        ? (status as PayoutStatus)
        : undefined;
    return this.settlementsService.findAllPayouts({ status: safeStatus, cursor, limit: safeLimit });
  }

  @Get('eligible')
  @ApiOperation({ summary: '지급 대상 정산 목록 — 수신자별 집계 (미지급 completed 정산)' })
  @ApiResponse({ status: 200, description: '지급 대상 목록 (수신자별 집계)' })
  findEligible(
    @Query('recipientId') recipientId?: string,
  ) {
    return this.settlementsService.listReleasedSettlements({ recipientId });
  }

  @Post('batch')
  @ApiOperation({ summary: '지급 배치 처리 — eligible 항목을 일괄 Payout 레코드 생성' })
  @ApiResponse({ status: 201, description: '배치 지급 생성 완료' })
  @ApiResponse({ status: 400, description: 'PAYOUT_BATCH_EMPTY — 지급 대상 없음 / PAYOUT_BATCH_NO_ELIGIBLE — 수신자에 대한 eligible 정산 없음' })
  createBatch(
    @Body() body: CreatePayoutBatchDto,
    @CurrentUser('id') _adminId: string,
  ) {
    return this.settlementsService.createPayoutBatch(
      { settlementIds: body.settlementIds, recipientIds: body.recipientIds, cutoffDate: body.cutoffDate },
      body.note,
    );
  }

  @Patch(':id/mark-paid')
  @ApiOperation({ summary: '지급 완료 처리 — 외부 송금 확인 후 상태 업데이트' })
  @ApiResponse({ status: 200, description: '지급 완료 처리됨' })
  @ApiResponse({ status: 400, description: 'PAYOUT_STATUS_INVALID' })
  @ApiResponse({ status: 404, description: 'PAYOUT_NOT_FOUND' })
  markPaid(
    @Param('id') id: string,
    @Body() body: MarkPayoutPaidDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.settlementsService.markPayoutPaid(id, adminId, body.note);
  }

  @Patch(':id/mark-failed')
  @ApiOperation({ summary: '지급 실패 처리 — 송금 실패 기록' })
  @ApiResponse({ status: 200, description: '지급 실패 처리됨' })
  @ApiResponse({ status: 400, description: 'PAYOUT_STATUS_INVALID' })
  @ApiResponse({ status: 404, description: 'PAYOUT_NOT_FOUND' })
  markFailed(
    @Param('id') id: string,
    @Body() body: MarkPayoutFailedDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.settlementsService.markPayoutFailed(id, body.reason, body.note, adminId);
  }

  @Post(':id/retry')
  @ApiOperation({
    summary: '실패 지급 재시도 — 연결된 정산을 재대기열로 복원하고 Payout을 cancelled 처리',
  })
  @ApiResponse({ status: 200, description: '재시도 완료 — { cancelled, settlementsRestored }' })
  @ApiResponse({ status: 404, description: 'PAYOUT_NOT_FOUND' })
  @ApiResponse({ status: 409, description: 'PAYOUT_NOT_RETRIABLE — 이미 paid 또는 cancelled 상태' })
  retryPayout(@Param('id') id: string) {
    return this.settlementsService.retryPayout(id);
  }
}
