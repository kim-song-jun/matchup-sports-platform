import { Controller, Get, Patch, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProcessSettlementDto } from './dto/process-settlement.dto';

@ApiTags('관리자 - 정산')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
@Controller('admin/settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @ApiOperation({ summary: '정산 목록 조회' })
  findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    return this.settlementsService.findAll({
      status,
      type,
      cursor,
      limit: parsedLimit !== undefined && !Number.isNaN(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('summary')
  @ApiOperation({ summary: '정산 요약 통계' })
  getSummary() {
    return this.settlementsService.getSummary();
  }

  @Patch(':id/process')
  @ApiOperation({ summary: '정산 처리' })
  process(
    @Param('id') id: string,
    @Body() body: ProcessSettlementDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.settlementsService.process(id, {
      action: body.action,
      note: body.note,
      actor: actorId,
    });
  }
}
