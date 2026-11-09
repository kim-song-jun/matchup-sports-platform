import { Controller, Get } from '@nestjs/common';
import { SiteInfoSettingsService } from './site-info-settings.service';

/** 인증 불필요 — 전자상거래법상 사이트에 표시하는 사업자 정보라 공개 대상이다. */
@Controller('public/site-info')
export class PublicSiteInfoController {
  constructor(private readonly settings: SiteInfoSettingsService) {}

  // No cache header: nginx adds `no-store` to successful `/api/v1/` responses, and the web's own fetch revalidates every 300s.
  @Get()
  get() {
    return this.settings.getPublic();
  }
}
