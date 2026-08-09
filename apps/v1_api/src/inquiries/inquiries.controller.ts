import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateInquiryDto, InquiriesQueryDto } from './dto/inquiries.dto';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  /** GET /inquiries — 본인 문의 목록. 로그인 필수. */
  @Get()
  @UseGuards(V1AuthGuard)
  list(@CurrentUser() user: V1AuthUser, @Query() query: InquiriesQueryDto) {
    return this.inquiriesService.list(user, query);
  }

  /**
   * POST /inquiries — 회원 문의 접수. 로그인 필수.
   *
   * 휴대폰 미인증 계정에도 열려 있는 유일한 "운영자에게 도달하는" 경로다(다른 허용 경로는
   * 전부 자기 계정 안에서 끝난다). 문의를 막으면 "인증이 안 된다"는 문의 자체를 보낼 수 없어
   * 교착이 되므로 열어 두되, 전역 기본값(1000/분)은 스팸 방어가 되지 않으므로 좁힌다.
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(V1AuthGuard)
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateInquiryDto) {
    return this.inquiriesService.create(user, dto);
  }

  /** GET /inquiries/:inquiryId — 본인 문의 상세. 로그인 필수. */
  @Get(':inquiryId')
  @UseGuards(V1AuthGuard)
  detail(@CurrentUser() user: V1AuthUser, @Param('inquiryId') inquiryId: string) {
    return this.inquiriesService.detail(user, inquiryId);
  }
}
