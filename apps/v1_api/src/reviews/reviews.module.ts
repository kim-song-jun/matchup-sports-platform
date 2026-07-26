import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService, TournamentFixtureReviewsService, V1AuthGuard],
})
export class ReviewsModule {}
