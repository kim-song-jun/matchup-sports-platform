import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { AdminErrorLogListQueryDto } from './dto/admin-error-log-query.dto';
import { ErrorLogService } from './error-log.service';

/**
 * 어드민 전용 — 서버/클라이언트 에러 로그 조회.
 *
 * GET /admin/ops/errors      목록 (source/statusCode/level/기간/검색어 필터 + cursor 페이지네이션)
 * GET /admin/ops/errors/:id  상세 (traceback/request/response/context 포함)
 *
 * 조회 전용이라 AdminOpsController의 다른 엔드포인트와 동일하게 getActiveAdmin으로
 * 게이트한다(getMutationAdmin 불필요 — support 등급도 조회는 가능).
 */
@Controller('admin/ops/errors')
@UseGuards(V1AuthGuard)
export class AdminErrorLogController {
  constructor(
    private readonly errorLogService: ErrorLogService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async list(@CurrentUser() user: V1AuthUser, @Query() query: AdminErrorLogListQueryDto) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.errorLogService.list(query);
  }

  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async detail(@CurrentUser() user: V1AuthUser, @Param('id') id: string) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.errorLogService.findById(id);
  }
}
