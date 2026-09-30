import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { ChatModule } from '../chat/chat.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreatorProfileGuard } from '../profile/creator-profile.guard';
import { TeamDissolutionController } from './team-dissolution.controller';
import { TeamDissolutionService } from './team-dissolution.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [NotificationsModule, ChatModule],
  controllers: [TeamsController, TeamDissolutionController],
  providers: [TeamsService, TeamDissolutionService, OptionalV1AuthGuard, V1AuthGuard, CreatorProfileGuard],
})
export class TeamsModule {}
