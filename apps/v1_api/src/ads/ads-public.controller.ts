import { Body, Controller, Get, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AdsPublicService } from './ads-public.service';
import { AdEventBatchDto } from './dto/ad-event.dto';

/** No auth: visitors without an account see ads too. Responses carry nothing but what is shown on screen. */
@Controller('ads')
export class AdsPublicController {
  constructor(private readonly ads: AdsPublicService) {}

  /**
   * Cached for 30s; a stopped ad can still be served for that long. The header is set after the lookup
   * succeeds: `@Header` would attach it before the handler runs and an error response would carry it too.
   */
  @Get('active')
  async active(@Res({ passthrough: true }) res: Response) {
    const active = await this.ads.findActive();
    res.setHeader('Cache-Control', 'public, max-age=30');
    return active;
  }

  @Post('events')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async events(@Body() dto: AdEventBatchDto): Promise<void> {
    await this.ads.recordEvents(dto.events);
  }
}
