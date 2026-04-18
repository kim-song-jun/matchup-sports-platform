import { Module } from '@nestjs/common';
import { MercenaryController } from './mercenary.controller';
import { MercenaryService } from './mercenary.service';
import { TeamsModule } from '../teams/teams.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [TeamsModule, NotificationsModule, ChatModule],
  controllers: [MercenaryController],
  providers: [MercenaryService],
})
export class MercenaryModule {}
