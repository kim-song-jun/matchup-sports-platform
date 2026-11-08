import { getLoggerToken } from 'nestjs-pino';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  createAdCampaignFakePrisma,
  type FakeAdmin,
  type FakeCampaign,
} from '../../test/helpers/ad-campaign-fake-prisma';
import { AdsPublicService } from './ads-public.service';

const NOW = new Date('2026-11-10T03:00:00.000Z');
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const admins: FakeAdmin[] = [{ id: 'admin-owner', userId: 'user-owner', adminRole: 'owner', status: 'active', nickname: '대표' }];

function campaign(id: string, overrides: Partial<FakeCampaign>): FakeCampaign {
  return {
    id,
    advertiserName: '에버데이',
    title: `내부 메모 ${id}`,
    status: 'published',
    version: 2,
    bannerImageUrl: null, bannerAltText: null, bannerLinkUrl: null, bannerStartAt: null, bannerEndAt: null,
    popupImageUrl: null, popupAltText: null, popupHeadline: null, popupDescription: null, popupLinkUrl: null, popupStartAt: null, popupEndAt: null,
    publishedAt: day('2026-11-01'),
    stoppedAt: null,
    createdByAdminUserId: 'admin-owner',
    updatedByAdminUserId: 'admin-owner',
    createdAt: day('2026-11-01'),
    updatedAt: day('2026-11-01'),
    ...overrides,
  };
}

const banner = (start: string, end: string, extra: Partial<FakeCampaign> = {}): Partial<FakeCampaign> => ({
  bannerImageUrl: '/uploads/ads/banner.webp',
  bannerAltText: '배너 대체 텍스트',
  bannerLinkUrl: '/tournaments/1',
  bannerStartAt: new Date(start),
  bannerEndAt: new Date(end),
  ...extra,
});
const popup = (start: string, end: string, extra: Partial<FakeCampaign> = {}): Partial<FakeCampaign> => ({
  popupImageUrl: '/uploads/ads/popup.webp',
  popupAltText: '팝업 대체 텍스트',
  popupHeadline: '팝업 제목',
  popupDescription: '팝업 설명',
  popupLinkUrl: 'https://everyday.example.com/event',
  popupStartAt: new Date(start),
  popupEndAt: new Date(end),
  ...extra,
});

async function build(campaigns: FakeCampaign[]) {
  const fake = createAdCampaignFakePrisma({ admins, campaigns });
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const module = await Test.createTestingModule({
    providers: [
      AdsPublicService,
      { provide: PrismaService, useValue: fake.prisma },
      { provide: getLoggerToken(AdsPublicService.name), useValue: logger },
    ],
  }).compile();
  return { service: module.get(AdsPublicService), fake, logger };
}

describe.each(['banner', 'popup'] as const)('AdsPublicService.findActive — %s', (channel) => {
  const creative = (start: string, end: string, extra: Partial<FakeCampaign> = {}) =>
    channel === 'banner' ? banner(start, end, extra) : popup(start, end, extra);
  const other = channel === 'banner' ? 'popup' : 'banner';

  it('returns the live published ad and leaves out ended, upcoming, draft and stopped ones', async () => {
    const { service } = await build([
      campaign('live', creative('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z')),
      campaign('ended', creative('2026-11-01T00:00:00Z', '2026-11-09T00:00:00Z')),
      campaign('upcoming', creative('2026-11-11T00:00:00Z', '2026-11-20T00:00:00Z')),
      campaign('draft', { ...creative('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), status: 'draft', publishedAt: null }),
      campaign('stopped', { ...creative('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), status: 'stopped', stoppedAt: day('2026-11-09') }),
    ]);

    const active = await service.findActive(NOW);

    expect(active[channel]?.campaignId).toBe('live');
    expect(active[other]).toBeNull();
  });

  it('serves from the start instant up to, but not including, the end instant', async () => {
    const { service } = await build([campaign('live', creative('2026-11-10T03:00:00.000Z', '2026-11-10T04:00:00.000Z'))]);

    expect((await service.findActive(new Date('2026-11-10T02:59:59.999Z')))[channel]).toBeNull();
    expect((await service.findActive(new Date('2026-11-10T03:00:00.000Z')))[channel]?.campaignId).toBe('live');
    expect((await service.findActive(new Date('2026-11-10T03:59:59.999Z')))[channel]?.campaignId).toBe('live');
    expect((await service.findActive(new Date('2026-11-10T04:00:00.000Z')))[channel]).toBeNull();
  });

  it('never exposes the internal memo, author, versions or window fields', async () => {
    const { service } = await build([campaign('live', { ...creative('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), [`${channel}AltText`]: '에버데이 신제품' })]);

    const ad = (await service.findActive(NOW))[channel];

    const shared = { campaignId: 'live', advertiserName: '에버데이', imageUrl: `/uploads/ads/${channel}.webp`, altText: '에버데이 신제품' };
    expect(ad).toEqual(
      channel === 'banner'
        ? { ...shared, linkUrl: '/tournaments/1' }
        : { ...shared, headline: '팝업 제목', description: '팝업 설명', linkUrl: 'https://everyday.example.com/event' },
    );
  });

  it('returns the stored alt text of this channel, not the other channel\'s', async () => {
    const { service } = await build([campaign('live', { ...banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), ...popup('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z') })]);
    expect((await service.findActive(NOW))[channel]?.altText).toBe(channel === 'banner' ? '배너 대체 텍스트' : '팝업 대체 텍스트');
  });

  it('does not serve a channel that has no alt text, so an inaccessible image never reaches a page', async () => {
    const { service } = await build([campaign('live', { ...creative('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), [`${channel}AltText`]: null })]);
    expect((await service.findActive(NOW))[channel]).toBeNull();
  });
});

describe('AdsPublicService.findActive — popup headline and description', () => {
  it('serves the popup with its headline and description, and the banner without either key', async () => {
    const { service } = await build([campaign('live', { ...banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), ...popup('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z') })]);

    const active = await service.findActive(NOW);

    expect(active.popup).toMatchObject({ headline: '팝업 제목', description: '팝업 설명' });
    expect(active.banner).not.toHaveProperty('headline');
    expect(active.banner).not.toHaveProperty('description');
  });

  it('serves a popup that has a headline but no description, with description null', async () => {
    const { service } = await build([campaign('live', popup('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z', { popupDescription: null }))]);
    expect((await service.findActive(NOW)).popup).toMatchObject({ headline: '팝업 제목', description: null });
  });

  it('does not serve a popup that has no headline, so a text-less popup never reaches a page', async () => {
    const { service } = await build([campaign('live', popup('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z', { popupHeadline: null }))]);
    expect((await service.findActive(NOW)).popup).toBeNull();
  });

  it('keeps serving a banner whose campaign has no popup headline because the banner needs none', async () => {
    const { service } = await build([campaign('live', banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'))]);
    expect((await service.findActive(NOW)).banner?.campaignId).toBe('live');
  });
});

describe('AdsPublicService.findActive', () => {
  it('serves both channels from different campaigns at once', async () => {
    const { service } = await build([
      campaign('live-banner', banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z')),
      campaign('live-popup', popup('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z')),
    ]);

    const active = await service.findActive(NOW);

    expect(active.banner?.campaignId).toBe('live-banner');
    expect(active.popup?.campaignId).toBe('live-popup');
  });

  it('returns nothing for both channels when no campaign exists', async () => {
    const { service } = await build([]);
    expect(await service.findActive(NOW)).toEqual({ banner: null, popup: null });
  });
});

describe('AdsPublicService.recordEvents', () => {
  const live = () => campaign('live', { ...banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), ...popup('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z') });
  const event = (campaignId: string, channel: 'banner' | 'popup', type: 'impression' | 'click') => ({ campaignId, channel, type });

  it('counts impressions and clicks for a live campaign into the KST day bucket', async () => {
    const { service, fake } = await build([live()]);

    const result = await service.recordEvents(
      [event('live', 'banner', 'impression'), event('live', 'banner', 'impression'), event('live', 'banner', 'click'), event('live', 'popup', 'impression')],
      NOW,
    );

    expect(result).toEqual({ accepted: 4, ignored: 0 });
    const rows = fake.state.stats.map(({ campaignId, channel, statDate, impressions, clicks }) => ({ campaignId, channel, statDate: statDate.toISOString(), impressions, clicks }));
    expect(rows).toEqual(expect.arrayContaining([
      { campaignId: 'live', channel: 'banner', statDate: '2026-11-10T00:00:00.000Z', impressions: 2, clicks: 1 },
      { campaignId: 'live', channel: 'popup', statDate: '2026-11-10T00:00:00.000Z', impressions: 1, clicks: 0 },
    ]));
    expect(rows).toHaveLength(2);
  });

  it('accumulates into the same row across batches on the same KST day', async () => {
    const { service, fake } = await build([live()]);

    await service.recordEvents([event('live', 'banner', 'impression')], new Date('2026-11-10T00:00:00Z'));
    await service.recordEvents([event('live', 'banner', 'impression'), event('live', 'banner', 'click')], new Date('2026-11-10T14:59:59Z'));

    expect(fake.state.stats).toHaveLength(1);
    expect(fake.state.stats[0]).toMatchObject({ impressions: 2, clicks: 1 });
  });

  it('starts a new row at 00:00 KST (15:00 UTC), not at UTC midnight', async () => {
    const { service, fake } = await build([live()]);

    await service.recordEvents([event('live', 'banner', 'impression')], new Date('2026-11-10T14:59:59.999Z'));
    await service.recordEvents([event('live', 'banner', 'impression')], new Date('2026-11-10T15:00:00.000Z'));

    const dates = fake.state.stats.map((row) => row.statDate.toISOString()).sort();
    expect(dates).toEqual(['2026-11-10T00:00:00.000Z', '2026-11-11T00:00:00.000Z']);
  });

  it.each([
    ['a draft campaign', { status: 'draft' as const }],
    ['a stopped campaign', { status: 'stopped' as const }],
  ])('does not count events for %s', async (_label, overrides) => {
    const { service, fake, logger } = await build([{ ...live(), ...overrides }]);

    const result = await service.recordEvents([event('live', 'banner', 'impression'), event('live', 'popup', 'click')], NOW);

    expect(result).toEqual({ accepted: 0, ignored: 2 });
    expect(fake.state.stats).toHaveLength(0);
    expect(logger.debug).toHaveBeenCalled();
  });

  it('does not count events for an unknown campaign id', async () => {
    const { service, fake } = await build([live()]);
    const result = await service.recordEvents([event('00000000-0000-4000-8000-000000000000', 'banner', 'impression')], NOW);
    expect(result).toEqual({ accepted: 0, ignored: 1 });
    expect(fake.state.stats).toHaveLength(0);
  });

  it('does not count events for a channel the campaign never configured', async () => {
    const { service, fake } = await build([campaign('banner-only', banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'))]);

    const result = await service.recordEvents([event('banner-only', 'popup', 'impression'), event('banner-only', 'banner', 'impression')], NOW);

    expect(result).toEqual({ accepted: 1, ignored: 1 });
    expect(fake.state.stats.map((row) => row.channel)).toEqual(['banner']);
  });

  it('does not count events before the window opens, and stops counting after the grace period past its end', async () => {
    const { service, fake } = await build([campaign('windowed', banner('2026-11-10T03:00:00.000Z', '2026-11-10T04:00:00.000Z'))]);
    const impression = [event('windowed', 'banner', 'impression')];

    expect((await service.recordEvents(impression, new Date('2026-11-10T02:59:59.999Z'))).accepted).toBe(0);
    expect((await service.recordEvents(impression, new Date('2026-11-10T03:00:00.000Z'))).accepted).toBe(1);
    expect((await service.recordEvents(impression, new Date('2026-11-10T04:09:59.999Z'))).accepted).toBe(1);
    expect((await service.recordEvents(impression, new Date('2026-11-10T04:10:00.000Z'))).accepted).toBe(0);
    expect(fake.state.stats[0]).toMatchObject({ impressions: 2 });
  });

  it('counts only the valid part of a mixed batch', async () => {
    const { service, fake } = await build([live(), campaign('draft', { ...banner('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z'), status: 'draft' })]);

    const result = await service.recordEvents(
      [event('live', 'banner', 'click'), event('draft', 'banner', 'click'), event('live', 'banner', 'impression')],
      NOW,
    );

    expect(result).toEqual({ accepted: 2, ignored: 1 });
    expect(fake.state.stats).toHaveLength(1);
    expect(fake.state.stats[0]).toMatchObject({ campaignId: 'live', impressions: 1, clicks: 1 });
  });
});
