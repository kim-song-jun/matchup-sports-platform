import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoHttpOptions } from './common/logging/pino-http.config';
import { V1ThrottlerGuard } from './common/guards/v1-throttler.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { MasterModule } from './master/master.module';
import { MatchesModule } from './matches/matches.module';
import { NoticesModule } from './notices/notices.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PopupsModule } from './popups/popups.module';
import { PrismaModule } from './prisma/prisma.module';
import { TeamsModule } from './teams/teams.module';
import { TeamMatchesModule } from './team-matches/team-matches.module';
import { ChatModule } from './chat/chat.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { VerificationModule } from './verification/verification.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LogsModule } from './logs/logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: buildPinoHttpOptions(),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 1000, ttl: 60_000 }],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    PopupsModule,
    HomeModule,
    InquiriesModule,
    MatchesModule,
    OnboardingModule,
    MasterModule,
    NoticesModule,
    TeamsModule,
    TeamMatchesModule,
    ChatModule,
    RealtimeModule,
    NotificationsModule,
    ProfileModule,
    AdminModule,
    SearchModule,
    ReviewsModule,
    UploadsModule,
    TournamentsModule,
    VerificationModule,
    IntegrationsModule,
    LogsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: V1ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
