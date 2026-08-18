import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminReviewPolicySettingsController } from './admin-review-policy-settings.controller';
import { ReviewPolicySettingsService } from './review-policy-settings.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

@Module({
  imports: [AdminContextModule],
  controllers: [ReviewsController, AdminReviewPolicySettingsController],
  providers: [ReviewsService, TournamentFixtureReviewsService, ReviewPolicySettingsService, V1AuthGuard],
  exports: [ReviewPolicySettingsService],
})
export class ReviewsModule {}
