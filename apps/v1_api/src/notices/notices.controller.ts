import { Controller, Get, Param, Query } from '@nestjs/common';
import { NoticesQueryDto } from './dto/notices-query.dto';
import { NoticesService } from './notices.service';

@Controller('notices')
export class NoticesController {
  constructor(private readonly noticesService: NoticesService) {}

  @Get()
  list(@Query() query: NoticesQueryDto): ReturnType<NoticesService['list']> {
    return this.noticesService.list(query);
  }

  @Get(':noticeId')
  detail(@Param('noticeId') noticeId: string): ReturnType<NoticesService['detail']> {
    return this.noticesService.detail(noticeId);
  }
}
