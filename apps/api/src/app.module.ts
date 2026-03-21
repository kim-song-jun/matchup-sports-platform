import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MatchesModule } from './matches/matches.module';
import { VenuesModule } from './venues/venues.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { RealtimeModule } from './realtime/realtime.module';
import { HealthModule } from './health/health.module';
import { LessonsModule } from './lessons/lessons.module';
import { AdminModule } from './admin/admin.module';
import { TeamsModule } from './teams/teams.module';
import { TeamMatchesModule } from './team-matches/team-matches.module';
import { DisputesModule } from './disputes/disputes.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ChatModule } from './chat/chat.module';
import { MercenaryModule } from './mercenary/mercenary.module';
import { BadgesModule } from './badges/badges.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MatchesModule,
    VenuesModule,
    ReviewsModule,
    PaymentsModule,
    NotificationsModule,
    MarketplaceModule,
    RealtimeModule,
    HealthModule,
    LessonsModule,
    AdminModule,
    TeamsModule,
    TeamMatchesModule,
    DisputesModule,
    SettlementsModule,
    ChatModule,
    MercenaryModule,
    BadgesModule,
  ],
})
export class AppModule {}
