import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { AdminContextService } from '../../common/admin-context.service';
import { QuickResultDto } from './quick-result.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

/** 대진 그림 편집기의 빠른 결과 입력. 플랫폼 어드민(owner·ops)과 해당 대회의 활성 디렉터가 사용한다. */
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
    // 실제 게임의 소속 대회와 활성 배정을 확인한다. 서비스에서도 경기 범위·역할을 다시 검증한다.
    await this.adminContext.getTournamentMutationAdmin(user.id, { gameId });
    return this.resultReview.quickResult(user, gameId, dto, idempotencyKey);
  }
}
