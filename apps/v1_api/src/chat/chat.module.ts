import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [ChatController],
  providers: [ChatService, V1AuthGuard],
})
export class ChatModule {}
