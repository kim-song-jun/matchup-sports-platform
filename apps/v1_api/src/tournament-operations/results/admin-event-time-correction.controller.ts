import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import { AdminContextService } from '../../common/admin-context.service';
import { GameBroadcastRegistry } from '../../games/game-broadcast.registry';
import { AdminCorrectGameEventTimeDto } from './tournament-result-review.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

/**
 * MD-QA #187 — 결과 확정 뒤 사건(골·카드·파울·교체) 시각 정정. 플랫폼 어드민 owner·ops 만 쓴다.
 * support 등급은 여기서 막고(`getMutationAdmin`), 서비스가 경기 범위와 platform_ops 역할을 다시 확인한다
 * (대회 디렉터 예외 없음).
 */
@Controller('admin/games')
@UseGuards(V1AuthGuard)
export class AdminEventTimeCorrectionController {
  constructor(
    private readonly adminContext: AdminContextService,
    private readonly resultReview: TournamentResultReviewService,
    private readonly gameBroadcast: GameBroadcastRegistry,
  ) {}

  @Post(':gameId/events/:eventId/correct-time')
  async correctTime(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('eventId') eventId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: AdminCorrectGameEventTimeDto,
  ) {
    await this.adminContext.getMutationAdmin(user.id);
    const result = await this.resultReview.correctOfficialEventTime(user, gameId, eventId, idempotencyKey, dto);
    // 콘솔·관전 화면이 정정 전 시각을 들고 있지 않도록 구독자에게 새 스냅샷을 보낸다(재전송 응답은 제외).
    if (!result.replayed) {
      void this.gameBroadcast.refreshGameSubscribers(gameId, result.version);
    }
    return result;
  }
}
