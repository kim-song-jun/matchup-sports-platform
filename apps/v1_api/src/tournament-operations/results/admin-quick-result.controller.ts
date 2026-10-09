import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { AdminContextService } from '../../common/admin-context.service';
import { QuickResultDto } from './quick-result.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

/** 대진 그림 편집기의 빠른 결과 입력. 플랫폼 어드민(owner·ops) 전용이다. */
@Controller('admin/games')
@UseGuards(V1AuthGuard)
export class AdminQuickResultController {
  constructor(
    private readonly adminContext: AdminContextService,
    private readonly resultReview: TournamentResultReviewService,
  ) {}

  @Post(':gameId/quick-result')
  async quickResult(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: QuickResultDto,
  ) {
    // support 어드민과 비어드민을 서비스 앞에서 막는다. 서비스는 platform_ops 역할을 한 번 더 확인한다.
    await this.adminContext.getMutationAdmin(user.id);
    return this.resultReview.quickResult(user, gameId, dto, idempotencyKey);
  }
}
