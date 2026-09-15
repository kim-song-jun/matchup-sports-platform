import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamContactsController } from './team-contacts.controller';
import { TeamContactsService } from './team-contacts.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TeamContactsController],
  providers: [TeamContactsService, V1AuthGuard],
})
export class TeamContactsModule {}
