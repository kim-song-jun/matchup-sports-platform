import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ScoringModule } from '../scoring/scoring.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ScoringModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
