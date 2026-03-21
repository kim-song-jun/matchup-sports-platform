import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';

@ApiTags('관리자 - 정산')
@Controller('admin/settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @ApiOperation({ summary: '정산 목록 조회' })
  findAll(@Query('status') status?: string, @Query('type') type?: string) {
    return this.settlementsService.findAll({ status, type });
  }

  @Get('summary')
  @ApiOperation({ summary: '정산 요약 통계' })
  getSummary() {
    return this.settlementsService.getSummary();
  }

  @Patch(':id/process')
  @ApiOperation({ summary: '정산 처리' })
  process(@Param('id') id: string, @Body() body: { action: string }) {
    return this.settlementsService.process(id, body);
  }
}
