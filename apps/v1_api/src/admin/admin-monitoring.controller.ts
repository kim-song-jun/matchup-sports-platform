import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { AdminOpsService } from './admin-ops.service';

/**
 * 모니터링 허브(/admin/monitoring) 전용 집계. 개별 로그 목록·ack 는 기존
 * /admin/ops/* 경로가 그대로 담당하고, 이 컨트롤러는 허브 상단 신호 스트립이
 * 쓰는 미확인 카운트만 노출한다.
 */
@Controller('admin/monitoring')
@UseGuards(V1AuthGuard)
export class AdminMonitoringController {
  constructor(
    private readonly adminOpsService: AdminOpsService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get('summary')
  async summary(@CurrentUser() user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.adminOpsService.monitoringSummary();
  }
}
