import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminSiteInfoController } from './admin-site-info.controller';
import { PublicSiteInfoController } from './public-site-info.controller';
import { SiteInfoSettingsService } from './site-info-settings.service';

@Module({
  imports: [AdminContextModule],
  controllers: [AdminSiteInfoController, PublicSiteInfoController],
  providers: [SiteInfoSettingsService, V1AuthGuard],
})
export class SiteInfoModule {}
