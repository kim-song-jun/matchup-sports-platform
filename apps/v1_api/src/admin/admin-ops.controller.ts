import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { AdminPushSendDto } from './dto/admin-push-send.dto';
import { AdminPushAudienceQueryDto } from './dto/admin-push-audience.dto';
import { AdminOpsService } from './admin-ops.service';
import { AdminPushHistoryService } from './admin-push-history.service';
import { AdminPushHistoryQueryDto } from './dto/admin-push-history.dto';

class RecentPushFailuresQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class AckPushFailuresDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

class RecentSmsFailuresQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class AckSmsFailuresDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids!: string[];
}

@Controller('admin/ops')
@UseGuards(V1AuthGuard)
export class AdminOpsController {
  constructor(
    private readonly adminOpsService: AdminOpsService,
    private readonly adminContext: AdminContextService,
    private readonly pushHistory: AdminPushHistoryService,
  ) {}

  @Get('push-history')
  @Header('Cache-Control', 'private, no-store')
  async history(@CurrentUser() user: V1AuthUser, @Query() query: AdminPushHistoryQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.pushHistory.list(query);
  }

  @Get('push-history/:id')
  @Header('Cache-Control', 'private, no-store')
  async historyDetail(@CurrentUser() user: V1AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.pushHistory.detail(id);
  }

  @Get('recent-push-failures')
  async recentPushFailures(@CurrentUser() user: V1AuthUser, @Query() query: RecentPushFailuresQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminOpsService.recentPushFailures(query.limit ?? 20);
  }

  @Post('push-failures/ack')
  async ackPushFailures(@CurrentUser() user: V1AuthUser, @Body() dto: AckPushFailuresDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.adminOpsService.acknowledgeFailures(dto.ids, admin);
  }

  @Get('recent-sms-failures')
  async recentSmsFailures(@CurrentUser() user: V1AuthUser, @Query() query: RecentSmsFailuresQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminOpsService.recentSmsFailures(query.limit ?? 20);
  }

  /** 운영 대시보드 KPI(최근 5분 웹 푸시 / SMS·인증 실패 건수). */
  @Get('summary')
  async summary(@CurrentUser() user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminOpsService.opsSummary();
  }

  @Post('sms-failures/ack')
  async ackSmsFailures(@CurrentUser() user: V1AuthUser, @Body() dto: AckSmsFailuresDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.adminOpsService.ackSmsFailures(dto.ids, admin);
  }

  // broadcast는 전체 구독자에게 즉시 도달하는 파급력 큰 작업이라 낮은 한도로 남용을 막는다.
  @Post('push-send')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async sendPush(@CurrentUser() user: V1AuthUser, @Body() dto: AdminPushSendDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.adminOpsService.sendManualPush(dto, admin);
  }

  // 확인창의 예상 수신 인원 — 읽기 전용이라 발송보다 한도를 넉넉히 둔다(성별·대회를 바꿀 때마다 부른다).
  @Get('push-send/audience')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async pushAudience(@CurrentUser() user: V1AuthUser, @Query() query: AdminPushAudienceQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminOpsService.previewPushAudience(query);
  }
}
