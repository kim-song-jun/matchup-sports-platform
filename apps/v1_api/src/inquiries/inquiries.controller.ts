import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
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

  /** POST /inquiries — 회원 문의 접수. 로그인 필수. */
  @Post()
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
