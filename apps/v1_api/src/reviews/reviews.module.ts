import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { PublicTeamReviewsController } from './public-team-reviews.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

@Module({
  imports: [AdminContextModule],
  controllers: [ReviewsController, PublicTeamReviewsController],
  providers: [ReviewsService, TournamentFixtureReviewsService, V1AuthGuard, OptionalV1AuthGuard],
})
export class ReviewsModule {}
