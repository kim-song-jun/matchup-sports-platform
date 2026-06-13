import { Module } from '@nestjs/common';
import { OptionalV1AuthGuard } from '../auth/optional-v1-auth.guard';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TeamsController],
  providers: [TeamsService, OptionalV1AuthGuard, V1AuthGuard],
})
export class TeamsModule {}
