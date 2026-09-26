import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { PublicTeamReviewsQueryDto } from './dto/public-team-reviews-query.dto';
import { ReviewsService } from './reviews.service';

/**
 * 팀 상세 화면이 쓰는 **공개** 팀 후기 요약. 로그인 없이도 그 팀이 어떤 평가를 받았는지
 * 볼 수 있어야 해서 `OptionalV1AuthGuard` 를 쓴다(같은 이유로 열려 있는
 * `GET /teams/:id/records` 와 같은 패턴).
 *
 * 이 라우트가 필요한 이유: 기존 `GET /reviews/received` 는 **"로그인한 나"가 받은 팀
 * 후기**라, 남의 팀 상세에 붙이면 그 팀 평가가 아니라 내 후기를 그 팀 것인 양 보여준다.
 *
 * 공개지만 규칙은 그대로다 — 집계는 `ReviewsService.publicTeamSummary` 하나를 지나고,
 * 거기서 상호평가 공개 게이트(`isReviewRevealed`)가 내 화면과 동일하게 적용된다.
 * 개별 후기 본문은 내려주지 않는다(이 도메인의 팀 후기는 별점과 태그뿐이고, 상대 팀이
 * 소수인 경기에서 개별 행을 나열하면 누가 무엇을 줬는지 역추적될 수 있다).
 */
@Controller('teams')
@UseGuards(OptionalV1AuthGuard)
export class PublicTeamReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':teamId/reviews')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getTeamReviews(@Param('teamId') teamId: string, @Query() query: PublicTeamReviewsQueryDto) {
    return this.reviews.publicTeamSummary(teamId, { period: query.period });
  }
}
