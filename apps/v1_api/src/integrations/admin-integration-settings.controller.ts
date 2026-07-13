import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { UpdateIntegrationSettingsDto } from './dto/integration-settings.dto';
import { IntegrationSettingsService } from './integration-settings.service';

/**
 * 어드민 전용 외부 연동 키 설정(현재: 카카오맵 REST/JS 키).
 * 응답 값은 DB(어드민 설정)에 있을 때만 마스킹되고, env 폴백/미설정 상태에서는 null이다.
 */
@Controller('admin/settings/integrations')
@UseGuards(V1AuthGuard)
export class AdminIntegrationSettingsController {
  constructor(
    private readonly integrationSettings: IntegrationSettingsService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get()
  async get(@CurrentUser() user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.integrationSettings.getMasked();
  }

  @Patch()
  async update(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateIntegrationSettingsDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.integrationSettings.update(admin, dto);
  }
}
