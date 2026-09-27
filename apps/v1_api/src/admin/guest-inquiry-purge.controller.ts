import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { AdminContextService } from '../common/admin-context.service';
import { PurgeGuestInquiriesDto } from './dto/guest-inquiry-purge.dto';
import { GuestInquiryPurgeService } from './guest-inquiry-purge.service';

/**
 * 보관 기간이 지난 비회원 문의의 수동 파기. 조회는 활성 어드민, 파기는 ops·owner.
 * `admin/inquiries/:inquiryId` 와 경로가 겹치지 않게 별도 prefix 를 쓴다.
 */
@Controller('admin/guest-inquiries')
@UseGuards(V1AuthGuard)
export class GuestInquiryPurgeController {
  constructor(
    private readonly purgeService: GuestInquiryPurgeService,
    private readonly adminContext: AdminContextService,
  ) {}

  @Get('purge-candidates')
  async listCandidates(@CurrentUser() user: V1AuthUser) {
    await this.adminContext.getActiveAdmin(user.id);
    return this.purgeService.listCandidates();
  }

  // 아무것도 만들지 않는 요청이라 201 이 아니라 200 이다(block-reported-team 과 같은 규칙).
  @Post('purge')
  @HttpCode(200)
  async purge(@CurrentUser() user: V1AuthUser, @Body() dto: PurgeGuestInquiriesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);
    return this.purgeService.purge(admin, dto);
  }
}
