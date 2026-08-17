import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { TournamentFixtureReviewsService } from './tournament-fixture-reviews.service';

@Module({
  imports: [AdminContextModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, TournamentFixtureReviewsService, V1AuthGuard],
})
export class ReviewsModule {}
