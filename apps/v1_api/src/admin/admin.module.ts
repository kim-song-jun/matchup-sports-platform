import { GamesModule } from '../games/games.module';
import { TeamsModule } from '../teams/teams.module';
import { MemberBracketPreviewController } from './member-bracket-preview.controller';
import { MemberBracketPreviewService } from './member-bracket-preview.service';
import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController } from './admin.controller';
import { AdminMonitoringController } from './admin-monitoring.controller';
import { AdminOpsController } from './admin-ops.controller';
import { AdminOpsService } from './admin-ops.service';
import { AdminService } from './admin.service';
import { UploadsModule } from '../uploads/uploads.module';
import { AdminTermsController } from './admin-terms.controller';
import { AdminTermsService } from './admin-terms.service';
import { GuestInquiryPurgeController } from './guest-inquiry-purge.controller';
import { GuestInquiryPurgeService } from './guest-inquiry-purge.service';

@Module({
  imports: [GamesModule, TeamsModule, AdminContextModule, NotificationsModule, RealtimeModule, UploadsModule],
  controllers: [MemberBracketPreviewController, AdminController, AdminMonitoringController, AdminOpsController, AdminTermsController, GuestInquiryPurgeController],
  providers: [MemberBracketPreviewService, AdminService, AdminOpsService, AdminTermsService, GuestInquiryPurgeService, V1AuthGuard],
})
export class AdminModule {}
