import { Controller, Get } from '@nestjs/common';
import { IntegrationSettingsService } from './integration-settings.service';

/**
 * 인증 불필요 — 카카오맵 JS 키는 도메인 제한으로 보호되므로 클라이언트에 공개돼도
 * 안전하다(구글/카카오맵 표준 방식). REST 키(지오코딩용, 서버 전용)는 여기 포함하지 않는다.
 */
@Controller('public/integrations')
export class PublicIntegrationsController {
  constructor(private readonly integrationSettings: IntegrationSettingsService) {}

  @Get('kakao-maps-key')
  async getKakaoMapsKey() {
    const kakaoMapsJsKey = await this.integrationSettings.getKakaoMapsJsKey();
    return { kakaoMapsJsKey };
  }
}
