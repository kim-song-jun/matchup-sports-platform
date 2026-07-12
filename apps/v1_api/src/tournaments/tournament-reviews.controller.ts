import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthUser } from '../auth/v1-auth-user';
import {
  SubmitTournamentReviewDto,
  SetTournamentAwardsDto,
  ListTournamentReviewsQueryDto,
  TournamentReviewsService,
} from './tournament-reviews.service';

@Controller()
export class TournamentReviewsController {
  constructor(private readonly reviewsService: TournamentReviewsService) {}

  // ─────────── 리뷰 (사용자) ───────────

  /** GET /tournaments/:tournamentId/reviews  — 공개 */
  @Get('tournaments/:tournamentId/reviews')
  @UseGuards(OptionalV1AuthGuard)
  async list(
    @Param('tournamentId') tournamentId: string,
    @Query() query: ListTournamentReviewsQueryDto,
  ) {
    return this.reviewsService.listReviews(tournamentId, query);
  }

  /** POST /tournaments/:tournamentId/reviews  — 인증 + 참가팀 검증 내부 처리 */
  @Post('tournaments/:tournamentId/reviews')
  @UseGuards(V1AuthGuard)
  @HttpCode(201)
  async submit(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: V1AuthUser,
    @Body() dto: SubmitTournamentReviewDto,
  ) {
    return this.reviewsService.submitReview(tournamentId, user, dto);
  }

  /** GET /tournaments/:tournamentId/reviews/me  — 내 리뷰 */
  @Get('tournaments/:tournamentId/reviews/me')
  @UseGuards(V1AuthGuard)
  async getMyReview(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: V1AuthUser,
  ) {
    return this.reviewsService.getMyReview(tournamentId, user.id);
  }

  /** GET /tournaments/:tournamentId/participant-check  — 참가자 여부 */
  @Get('tournaments/:tournamentId/participant-check')
  @UseGuards(V1AuthGuard)
  async participantCheck(
    @Param('tournamentId') tournamentId: string,
    @CurrentUser() user: V1AuthUser,
  ) {
    const isParticipant = await this.reviewsService.isParticipant(tournamentId, user.id);
    return { isParticipant };
  }

  /** GET /tournaments/me/pending-reviews — 리뷰 미작성 종료 대회 목록 (최근순) */
  @Get('tournaments/me/pending-reviews')
  @UseGuards(V1AuthGuard)
  async listMyPendingReviews(@CurrentUser() user: V1AuthUser) {
    return this.reviewsService.listMyPendingReviews(user.id);
  }

  // ─────────── 어워드 (어드민 — V1AuthGuard + 서비스 레벨 admin 체크) ───────────

  /** GET /admin/tournaments/:tournamentId/awards */
  @Get('admin/tournaments/:tournamentId/awards')
  @UseGuards(V1AuthGuard)
  async getAwards(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.reviewsService.listAwards(user, tournamentId);
  }

  /** PUT /admin/tournaments/:tournamentId/awards */
  @Put('admin/tournaments/:tournamentId/awards')
  @UseGuards(V1AuthGuard)
  async setAwards(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: SetTournamentAwardsDto,
  ) {
    return this.reviewsService.setAwards(user, tournamentId, dto);
  }
}
