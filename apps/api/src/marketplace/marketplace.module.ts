import { Module } from '@nestjs/common';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceCron } from './marketplace.cron';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { TeamsModule } from '../teams/teams.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, NotificationsModule, SettlementsModule, TeamsModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService, MarketplaceCron],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
