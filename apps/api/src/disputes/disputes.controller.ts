import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { DisputesService } from './disputes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RespondDisputeDto } from './dto/respond-dispute.dto';
import { DisputeMessageDto } from './dto/dispute-message.dto';

@ApiTags('분쟁')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get('me')
  @ApiOperation({ summary: '내 분쟁 목록 (구매자 또는 판매자로 참여한 분쟁)' })
  @ApiResponse({ status: 200, description: '커서 기반 페이지네이션' })
  findMine(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit !== undefined && !Number.isNaN(parsedLimit)
        ? Math.min(Math.max(1, parsedLimit), 50)
        : undefined;
    return this.disputesService.findMine(userId, { status, cursor, limit: safeLimit });
  }

  @Get(':id')
  @ApiOperation({ summary: '분쟁 상세 — 참여자 또는 관리자만 조회 가능' })
  @ApiResponse({ status: 200, description: '분쟁 상세 정보' })
  @ApiResponse({ status: 403, description: 'DISPUTE_ACCESS_DENIED — 참여자 아님' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  findOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.disputesService.findOneAsParticipant(id, userId);
  }

  @Post(':id/respond')
  @ApiOperation({ summary: '판매자 소명 제출 — 분쟁 상태가 filed 일 때만 가능' })
  @ApiResponse({ status: 200, description: '소명 접수 완료' })
  @ApiResponse({ status: 400, description: 'DISPUTE_RESPOND_NOT_ALLOWED — 소명 불가 상태' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 판매자만 가능' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  respond(
    @Param('id') id: string,
    @Body() body: RespondDisputeDto,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.disputesService.respond(id, sellerId, body);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: '분쟁 메시지 전송 — 참여자(구매자/판매자)만 가능' })
  @ApiResponse({ status: 201, description: '메시지 전송 완료' })
  @ApiResponse({ status: 403, description: 'DISPUTE_ACCESS_DENIED — 참여자 아님' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  postMessage(
    @Param('id') id: string,
    @Body() body: DisputeMessageDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.disputesService.postMessage(id, userId, body);
  }

  @Post(':id/withdraw')
  @ApiOperation({ summary: '분쟁 철회 — 구매자가 자발적으로 취소 (filed/seller_responded 상태만 가능)' })
  @ApiResponse({ status: 200, description: '분쟁 철회 완료' })
  @ApiResponse({ status: 400, description: 'DISPUTE_WITHDRAW_NOT_ALLOWED — 철회 불가 상태' })
  @ApiResponse({ status: 403, description: 'FORBIDDEN — 구매자만 가능' })
  @ApiResponse({ status: 404, description: 'DISPUTE_NOT_FOUND' })
  withdraw(@Param('id') id: string, @CurrentUser('id') buyerId: string) {
    return this.disputesService.withdraw(id, buyerId);
  }
}
