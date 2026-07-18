import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';
import { ReceivedSummaryQueryDto } from './dto/received-summary-query.dto';
import { ReviewSourceParamsDto } from './dto/review-source.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
@UseGuards(V1AuthGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query() query: ListReviewsQueryDto) {
    return this.reviewsService.list(user, query);
  }

  @Get('received')
  received(@CurrentUser() user: V1AuthUser, @Query() query: ListReviewsQueryDto) {
    return this.reviewsService.received(user, query);
  }

  @Get('received/summary')
  receivedSummary(@CurrentUser() user: V1AuthUser, @Query() query: ReceivedSummaryQueryDto) {
    return this.reviewsService.receivedSummary(user, query);
  }

  @Get('sources/:sourceType/:sourceId')
  source(@CurrentUser() user: V1AuthUser, @Param() params: ReviewSourceParamsDto) {
    return this.reviewsService.source(user, params);
  }

  @Post()
  submit(@CurrentUser() user: V1AuthUser, @Body() dto: SubmitReviewDto) {
    return this.reviewsService.submit(user, dto);
  }
}
