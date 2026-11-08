import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { kstCalendarDate } from '../common/kst-datetime';
import { PrismaService } from '../prisma/prisma.service';
import {
  AD_CHANNELS,
  acceptsEvents,
  servingWhere,
  toPublicBanner,
  toPublicPopup,
  type AdChannel,
  type AdEventType,
  type PublicAd,
  type PublicPopupAd,
} from './ad-campaign';

export type ActiveAds = { banner: PublicAd | null; popup: PublicPopupAd | null };
export type AdEventInput = { campaignId: string; channel: AdChannel; type: AdEventType };

const PUBLIC_SELECT = {
  id: true,
  advertiserName: true,
  bannerImageUrl: true, bannerAltText: true, bannerLinkUrl: true, bannerStartAt: true, bannerEndAt: true,
  popupImageUrl: true, popupAltText: true, popupHeadline: true, popupDescription: true, popupLinkUrl: true, popupStartAt: true, popupEndAt: true,
} as const;

@Injectable()
export class AdsPublicService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(AdsPublicService.name) private readonly logger: PinoLogger,
  ) {}

  /** The published ad whose window contains `now`, per channel. Publishing keeps windows of a channel disjoint, so at most one matches. */
  async findActive(now: Date = new Date()): Promise<ActiveAds> {
    const [banner, popup] = await Promise.all(
      AD_CHANNELS.map((channel) =>
        this.prisma.v1AdCampaign.findFirst({
          where: servingWhere(channel, now),
          orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
          select: PUBLIC_SELECT,
        }),
      ),
    );
    return {
      banner: banner ? toPublicBanner(banner) : null,
      popup: popup ? toPublicPopup(popup) : null,
    };
  }

  /**
   * Adds a batch of impressions/clicks to the per-day counters. Only published campaigns whose channel is
   * (or just was) serving are counted; everything else is dropped without an error so a client cannot probe
   * which ids exist. Nothing identifying the viewer is stored. A database failure propagates (500, recorded
   * by the exception filter) instead of being reported as accepted.
   */
  async recordEvents(events: AdEventInput[], now: Date = new Date()): Promise<{ accepted: number; ignored: number }> {
    const tallies = new Map<string, { campaignId: string; channel: AdChannel; impressions: number; clicks: number }>();
    for (const event of events) {
      const key = `${event.campaignId}|${event.channel}`;
      const tally = tallies.get(key) ?? { campaignId: event.campaignId, channel: event.channel, impressions: 0, clicks: 0 };
      if (event.type === 'impression') tally.impressions += 1;
      else tally.clicks += 1;
      tallies.set(key, tally);
    }

    const campaigns = await this.prisma.v1AdCampaign.findMany({
      where: { id: { in: [...new Set(events.map((event) => event.campaignId))] }, status: 'published' },
      select: { ...PUBLIC_SELECT, status: true },
    });
    const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

    const statDate = kstCalendarDate(now);
    const writes = [];
    let accepted = 0;
    let ignored = 0;
    for (const tally of tallies.values()) {
      const count = tally.impressions + tally.clicks;
      const campaign = byId.get(tally.campaignId);
      if (!campaign || !acceptsEvents(campaign, tally.channel, now)) {
        ignored += count;
        continue;
      }
      accepted += count;
      writes.push(
        this.prisma.v1AdCampaignDailyStat.upsert({
          where: { campaignId_channel_statDate: { campaignId: tally.campaignId, channel: tally.channel, statDate } },
          create: { campaignId: tally.campaignId, channel: tally.channel, statDate, impressions: tally.impressions, clicks: tally.clicks },
          update: { impressions: { increment: tally.impressions }, clicks: { increment: tally.clicks } },
        }),
      );
    }
    if (writes.length > 0) await this.prisma.$transaction(writes);
    if (ignored > 0) this.logger.debug({ ignored, accepted }, 'ad events dropped: campaign not published or channel not serving');
    return { accepted, ignored };
  }
}
