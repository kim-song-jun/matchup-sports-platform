import { Controller, Get, Header } from '@nestjs/common';
import { SiteInfoSettingsService } from './site-info-settings.service';

/** 인증 불필요 — 전자상거래법상 사이트에 표시하는 사업자 정보라 공개 대상이다. */
@Controller('public/site-info')
export class PublicSiteInfoController {
  constructor(private readonly settings: SiteInfoSettingsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  get() {
    return this.settings.getPublic();
  }
}
