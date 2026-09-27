import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreatePublicInquiryDto } from './dto/public-inquiry.dto';
import { InquiriesService } from './inquiries.service';

export const PUBLIC_INQUIRY_THROTTLE = { limit: 3, ttl: 10 * 60_000 } as const;

@Controller('public/inquiries')
export class PublicInquiriesController {
  constructor(private readonly inquiriesService: InquiriesService) {}

  /**
   * POST /public/inquiries — 비회원 대회 개설·제휴 문의. 인증 가드가 없는 것은 의도된 공개다.
   * 세션이 없으니 IP 기준 스로틀(기본 트래커 = req.ip, main.ts 의 trust proxy 전제)이 첫 방어선이다.
   */
  @Post()
  @HttpCode(200)
  @Throttle({ default: PUBLIC_INQUIRY_THROTTLE })
  create(@Body() dto: CreatePublicInquiryDto, @Ip() clientIp: string) {
    return this.inquiriesService.createPublic(dto, clientIp);
  }
}
