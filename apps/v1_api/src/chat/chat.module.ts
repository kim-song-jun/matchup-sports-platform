import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, V1AuthGuard],
})
export class ChatModule {}
