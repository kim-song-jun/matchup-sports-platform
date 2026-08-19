import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminReviewPolicySettingsController } from './admin-review-policy-settings.controller';
import { PublicTeamReviewsController } from './public-team-reviews.controller';
import { ReviewPolicySettingsService } from './review-policy-settings.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

@Module({
  imports: [AdminContextModule],
  controllers: [ReviewsController, AdminReviewPolicySettingsController, PublicTeamReviewsController],
  providers: [
    ReviewsService,
    TournamentFixtureReviewsService,
    ReviewPolicySettingsService,
    V1AuthGuard,
    OptionalV1AuthGuard,
  ],
  exports: [ReviewPolicySettingsService],
})
export class ReviewsModule {}
