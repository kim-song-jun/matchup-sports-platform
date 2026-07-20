import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';
import { ReviewSourceParamsDto } from './dto/review-source.dto';
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

  @Get('sources/:sourceType/:sourceId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  source(@CurrentUser() user: V1AuthUser, @Param() params: ReviewSourceParamsDto) {
    return this.reviewsService.source(user, params);
  }

  // Review submission — writes inside a transaction and recalculates
  // reputation/team-trust aggregates, matching the cost profile of other
  // authenticated mutation endpoints throttled at 10-20/min (auth, uploads,
  // push-subscribe).
  @Post()
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  submit(@CurrentUser() user: V1AuthUser, @Body() dto: SubmitReviewDto) {
    return this.reviewsService.submit(user, dto);
  }
}
