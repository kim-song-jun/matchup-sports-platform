import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import {
  CreateGameResultCorrectionDto,
  OfficializeGameResultRevisionDto,
  ReviewDecisionGameResultRevisionDto,
  SupersedeAndSubmitGameResultRevisionDto,
  VoidGameResultRevisionDto,
} from './tournament-result-review.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

/**
 * Task 22 -- tournament result review, officialize, correction, and void.
 * Mounted at the SAME `/games/:gameId/...` prefix the frozen REST registry
 * names (route paths are independent of which file/module a Nest
 * controller is declared in); business logic lives in
 * `TournamentResultReviewService`, not `GamesService`, per this lane's
 * ownership (`apps/v1_api/src/tournament-operations/results`).
 */
@Controller('games')
export class TournamentResultReviewController {
  constructor(private readonly resultReview: TournamentResultReviewService) {}

  @Post(':gameId/result-revisions/:revisionId/review-decision')
  @UseGuards(V1AuthGuard)
  reviewDecision(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ReviewDecisionGameResultRevisionDto,
  ) {
    return this.resultReview.reviewDecision(user, gameId, revisionId, idempotencyKey, dto);
  }

  @Post(':gameId/result-revisions/:revisionId/supersede-and-submit')
  @UseGuards(V1AuthGuard)
  supersedeAndSubmit(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: SupersedeAndSubmitGameResultRevisionDto,
  ) {
    return this.resultReview.supersedeAndSubmit(user, gameId, revisionId, idempotencyKey, dto);
  }

  @Post(':gameId/result-revisions/:revisionId/officialize')
  @UseGuards(V1AuthGuard)
  officializeResultRevision(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: OfficializeGameResultRevisionDto,
  ) {
    return this.resultReview.officializeResultRevision(user, gameId, revisionId, idempotencyKey, dto);
  }

  @Post(':gameId/result-revisions/:revisionId/void')
  @UseGuards(V1AuthGuard)
  voidResultRevision(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Param('revisionId') revisionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: VoidGameResultRevisionDto,
  ) {
    return this.resultReview.voidResultRevision(user, gameId, revisionId, idempotencyKey, dto);
  }

  @Post(':gameId/corrections')
  @UseGuards(V1AuthGuard)
  createResultCorrection(
    @CurrentUser() user: V1AuthUser,
    @Param('gameId') gameId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateGameResultCorrectionDto,
  ) {
    return this.resultReview.createResultCorrection(user, gameId, idempotencyKey, dto);
  }
}
