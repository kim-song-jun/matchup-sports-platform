import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextModule } from '../common/admin-context.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AdsAdminController } from './ads-admin.controller';
import { AdsAdminService } from './ads-admin.service';
import { AdsPublicController } from './ads-public.controller';
import { AdsPublicService } from './ads-public.service';

@Module({
  imports: [AdminContextModule, UploadsModule],
  controllers: [AdsAdminController, AdsPublicController],
  providers: [AdsAdminService, AdsPublicService, V1AuthGuard],
})
export class AdsModule {}
