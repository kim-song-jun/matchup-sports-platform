import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdsPublicService } from './ads-public.service';
import { AdEventBatchDto } from './dto/ad-event.dto';

/** No auth: visitors without an account see ads too. Responses carry nothing but what is shown on screen. */
@Controller('ads')
export class AdsPublicController {
  constructor(private readonly ads: AdsPublicService) {}

  /** Cached for 30s; a stopped ad can still be served for that long. */
  @Get('active')
  @Header('Cache-Control', 'public, max-age=30')
  active() {
    return this.ads.findActive();
  }

  @Post('events')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async events(@Body() dto: AdEventBatchDto): Promise<void> {
    await this.ads.recordEvents(dto.events);
  }
}
