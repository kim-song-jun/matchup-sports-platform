import { Module } from '@nestjs/common';
import { AdminContextModule } from '../common/admin-context.module';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminIntegrationSettingsController } from './admin-integration-settings.controller';
import { PublicIntegrationsController } from './public-integrations.controller';
import { IntegrationSettingsService } from './integration-settings.service';

/**
 * 어드민 편집형 외부 연동 키 설정 모듈. IntegrationSettingsService는 다른
 * 도메인(tournaments의 KakaoGeocodingService)에서도 주입받을 수 있도록 export한다.
 */
@Module({
  imports: [AdminContextModule],
  controllers: [AdminIntegrationSettingsController, PublicIntegrationsController],
  providers: [IntegrationSettingsService, V1AuthGuard],
  exports: [IntegrationSettingsService],
})
export class IntegrationsModule {}
