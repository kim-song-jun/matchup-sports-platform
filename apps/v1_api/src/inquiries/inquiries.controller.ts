import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { CreateInquiryDto, InquiriesQueryDto } from './dto/inquiries.dto';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@UseGuards(V1AuthGuard)
export class InquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query() query: InquiriesQueryDto) {
    return this.inquiriesService.list(user, query);
  }

  @Post()
  create(@CurrentUser() user: V1AuthUser, @Body() dto: CreateInquiryDto) {
    return this.inquiriesService.create(user, dto);
  }

  @Get(':inquiryId')
  detail(@CurrentUser() user: V1AuthUser, @Param('inquiryId') inquiryId: string) {
    return this.inquiriesService.detail(user, inquiryId);
  }
}
