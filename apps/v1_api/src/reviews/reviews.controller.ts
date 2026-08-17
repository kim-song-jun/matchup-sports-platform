import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';
import { ReceivedSummaryQueryDto } from './dto/received-summary-query.dto';
import { ReviewSourceParamsDto } from './dto/review-source.dto';
import { HidePostEventReviewDto } from './dto/moderate-review.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
@UseGuards(V1AuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // Pending/written review list — fans out to parallel findMany across
  // matches/team-matches/tournament fixtures (tab=pending) or a single
  // findMany + source summary lookups (tab=written). Looser than the
  // recompute-heavy routes below since normal pagination/scroll usage can
  // legitimately re-hit this within a minute.
  @Get()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  list(@CurrentUser() user: V1AuthUser, @Query() query: ListReviewsQueryDto) {
    return this.reviewsService.list(user, query);
  }

  // Received reviews — live-recomputes managed team IDs then runs a findMany
  // with an OR filter across user + managed teams on every call. Tighter
  // limit than the plain list to bound repeated DB recomputation.
  @Get('received')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  received(@CurrentUser() user: V1AuthUser, @Query() query: ListReviewsQueryDto) {
    return this.reviewsService.received(user, query);
  }

  // Received review aggregate summary — same recompute cost class as
  // received() above (unpaginated findMany across user + managed teams,
  // plus a second reverse findMany and an in-memory reveal-gate loop per
  // row). Same tighter limit for the same reason.
  @Get('received/summary')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  receivedSummary(@CurrentUser() user: V1AuthUser, @Query() query: ReceivedSummaryQueryDto) {
    return this.reviewsService.receivedSummary(user, query);
  }

  @Get('sources/:sourceType/:sourceId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  source(@CurrentUser() user: V1AuthUser, @Param() params: ReviewSourceParamsDto) {
    return this.reviewsService.source(user, params);
  }

  // Review submission — writes inside a transaction and recalculates
  // reputation/team-trust aggregates. submit() is single-target per call and
  // the frontend submits one review per target sequentially in a single
  // "제출" click (reviews-api-clients.tsx submitAll), which aborts the whole
  // loop on the first 429. The limit must clear a full match's worth of
  // targets: capacity caps at 100 (matches/dto/mutate-match.dto.ts) and
  // matchSource() excludes only the caller, so up to 99 targets can be
  // submitted in one click — 110 gives headroom above that worst case while
  // still bounding repeated abuse tighter than the read-only routes above.
  // Duplicate submissions are already rejected by the
  // (matchId/teamMatchId, authorId, targetId) unique constraint, so raising
  // this limit does not meaningfully widen the abuse surface.
  @Post()
  @Throttle({ default: { limit: 110, ttl: 60_000 } })
  submit(@CurrentUser() user: V1AuthUser, @Body() dto: SubmitReviewDto) {
    return this.reviewsService.submit(user, dto);
  }

  // ─────────── 어드민 후기 숨김 (V1AuthGuard + 서비스 레벨 admin 체크) ───────────
  // 경기 후기에는 지금까지 숨김 경로가 없어 악의적 후기를 어드민조차 내릴 수 없었다.
  // 대회 후기(tournament-reviews.controller.ts)와 같은 PATCH .../hide|unhide 모양을 쓴다.

  @Patch('admin/:reviewId/hide')
  hide(
    @CurrentUser() user: V1AuthUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: HidePostEventReviewDto,
  ) {
    return this.reviewsService.hideReview(user, reviewId, dto);
  }

  @Patch('admin/:reviewId/unhide')
  unhide(@CurrentUser() user: V1AuthUser, @Param('reviewId') reviewId: string) {
    return this.reviewsService.unhideReview(user, reviewId);
  }
}
