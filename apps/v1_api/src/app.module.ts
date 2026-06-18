import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { MasterModule } from './master/master.module';
import { MatchesModule } from './matches/matches.module';
import { NoticesModule } from './notices/notices.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { TeamsModule } from './teams/teams.module';
import { TeamMatchesModule } from './team-matches/team-matches.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { VerificationModule } from './verification/verification.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 1000, ttl: 60_000 }],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    HomeModule,
    MatchesModule,
    OnboardingModule,
    MasterModule,
    NoticesModule,
    TeamsModule,
    TeamMatchesModule,
    ChatModule,
    NotificationsModule,
    ProfileModule,
    AdminModule,
    SearchModule,
    ReviewsModule,
    UploadsModule,
    TournamentsModule,
    VerificationModule,
  ],
})
export class AppModule {}
