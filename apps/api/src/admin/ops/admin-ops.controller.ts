import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminOpsService } from './admin-ops.service';
import { AdminOpsSummaryDto } from './dto/admin-ops-summary.dto';
import { RecentPushFailureDto } from './dto/recent-push-failure.dto';
import { AckPushFailuresDto } from './dto/ack-push-failures.dto';

@ApiTags('Admin Ops')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
@Controller('admin/ops')
export class AdminOpsController {
  constructor(private readonly adminOpsService: AdminOpsService) {}

  @Get('summary')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ops summary — 6 KPI counters for the admin dashboard' })
  @ApiResponse({ status: 200, description: 'KPI summary', type: AdminOpsSummaryDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getSummary(): Promise<AdminOpsSummaryDto> {
    return this.adminOpsService.getSummary();
  }

  @Get('recent-push-failures')
  @ApiOperation({ summary: 'Recent web push failure log entries (PII-stripped)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max records to return (1–100, default 20)' })
  @ApiResponse({ status: 200, description: 'List of recent failures', type: [RecentPushFailureDto] })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getRecentPushFailures(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<RecentPushFailureDto[]> {
    return this.adminOpsService.getRecentPushFailures(limit);
  }

  @Post('push-failures/ack')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Acknowledge push failure log entries',
    description: 'Supply ids to ack specific records, or omit ids to ack all within the current 5-minute alert window.',
  })
  @ApiResponse({ status: 200, description: '{ acknowledged: number }' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async ackPushFailures(
    @Body() body: AckPushFailuresDto,
    @CurrentUser('id') adminId: string,
  ): Promise<{ acknowledged: number }> {
    return this.adminOpsService.ackPushFailures(adminId, body.ids);
  }
}
