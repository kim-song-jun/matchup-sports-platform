import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { UpdateReviewPolicySettingsDto } from './dto/review-policy-settings.dto';
import { ReviewPolicySettingsService } from './review-policy-settings.service';

/**
 * 어드민 전용 리뷰 작성 기간 설정.
 * AdminIntegrationSettingsController와 같은 구조 — 조회는 활성 어드민, 수정은 mutation 권한.
 */
@Controller('admin/settings/reviews')
@UseGuards(V1AuthGuard)
export class AdminReviewPolicySettingsController {
  constructor(
    private readonly settings: ReviewPolicySettingsService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get()
  async get(@CurrentUser() user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.settings.get();
  }

  @Patch()
  async update(@CurrentUser() user: V1AuthUser, @Body() dto: UpdateReviewPolicySettingsDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.settings.update(admin, dto);
  }
}
