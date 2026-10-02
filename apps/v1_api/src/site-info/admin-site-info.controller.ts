import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { UpdateSiteInfoDto } from './dto/site-info.dto';
import { SiteInfoSettingsService } from './site-info-settings.service';

/** 조회는 활성 어드민, 수정은 mutation 권한(ops·owner) — AdminIntegrationSettingsController 와 같은 구조. */
@Controller('admin/site-info')
@UseGuards(V1AuthGuard)
export class AdminSiteInfoController {
  constructor(
    private readonly settings: SiteInfoSettingsService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get()
  async get(@CurrentUser() user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.settings.getForAdmin();
  }

  @Put()
  async update(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateSiteInfoDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.settings.update(admin, dto);
  }
}
