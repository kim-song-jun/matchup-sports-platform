import { createAdCampaignFakePrisma, type FakeCampaign } from '../../test/helpers/ad-campaign-fake-prisma';
import {
  AD_CHANNELS,
  AD_EVENT_GRACE_MS,
  acceptsEvents,
  channelFromRow,
  channelPhase,
  overlapWhere,
  servingWhere,
  windowPhase,
  type AdChannel,
} from './ad-campaign';

const START = new Date('2026-11-10T03:00:00.000Z');
const END = new Date('2026-11-10T04:00:00.000Z');
const at = (base: Date, offsetMs: number) => new Date(base.getTime() + offsetMs);

function row(channel: AdChannel, overrides: Partial<FakeCampaign> = {}): FakeCampaign {
  const window = channel === 'banner'
    ? { bannerImageUrl: '/uploads/a.webp', bannerAltText: '대체', bannerLinkUrl: '/x', bannerStartAt: START, bannerEndAt: END }
    : { popupImageUrl: '/uploads/a.webp', popupAltText: '대체', popupHeadline: '제목', popupLinkUrl: '/x', popupStartAt: START, popupEndAt: END };
  return {
    id: 'c1', advertiserName: '에버데이', title: '메모', status: 'published', version: 2,
    bannerImageUrl: null, bannerAltText: null, bannerLinkUrl: null, bannerStartAt: null, bannerEndAt: null,
    popupImageUrl: null, popupAltText: null, popupHeadline: null, popupDescription: null, popupLinkUrl: null, popupStartAt: null, popupEndAt: null,
    publishedAt: START, stoppedAt: null, createdByAdminUserId: 'a', updatedByAdminUserId: 'a', createdAt: START, updatedAt: START,
    ...window, ...overrides,
  };
}

const instants = [
  ['1ms before start', at(START, -1)],
  ['the start instant', START],
  ['1ms after start', at(START, 1)],
  ['1ms before end', at(END, -1)],
  ['the end instant', END],
  ['1ms after end', at(END, 1)],
] as const;

describe('windowPhase', () => {
  it.each([
    ['1ms before start', -1, 'scheduled'],
    ['the start instant', 0, 'live'],
    ['1ms before end', 3_600_000 - 1, 'live'],
    ['the end instant', 3_600_000, 'ended'],
  ] as const)('is %s -> %s', (_label, offset, expected) => {
    expect(windowPhase(START, END, at(START, offset))).toBe(expected);
  });
});

describe('channelPhase', () => {
  it.each(AD_CHANNELS)('derives the %s phase only for a published campaign, with [start, end) boundaries', (channel) => {
    const fields = channelFromRow(row(channel), channel);
    expect(instants.map(([, now]) => channelPhase('published', fields, now))).toEqual(['scheduled', 'live', 'live', 'live', 'ended', 'ended']);
    expect(channelPhase('draft', fields, START)).toBeNull();
    expect(channelPhase('stopped', fields, START)).toBeNull();
    expect(channelPhase('published', null, START)).toBeNull();
  });
});

describe('acceptsEvents', () => {
  it.each(AD_CHANNELS)('accepts %s events from the start instant until the grace period after the end has passed', (channel) => {
    const campaign = row(channel);
    expect(acceptsEvents(campaign, channel, at(START, -1))).toBe(false);
    expect(acceptsEvents(campaign, channel, START)).toBe(true);
    expect(acceptsEvents(campaign, channel, END)).toBe(true);
    expect(acceptsEvents(campaign, channel, at(END, AD_EVENT_GRACE_MS - 1))).toBe(true);
    expect(acceptsEvents(campaign, channel, at(END, AD_EVENT_GRACE_MS))).toBe(false);
  });

  it('does not accept events for a channel the campaign never configured', () => {
    expect(acceptsEvents(row('banner'), 'popup', START)).toBe(false);
  });
});

// The four activity rules are written three ways (two Prisma filters, one in-memory). Evaluating the filters
// with the fake's matcher and comparing them to the in-memory rule keeps them from drifting apart.
describe.each(AD_CHANNELS)('one window rule across servingWhere, overlapWhere and channelPhase — %s', (channel) => {
  const matches = async (where: Record<string, unknown>, rows: FakeCampaign[]) => {
    const fake = createAdCampaignFakePrisma({ admins: [], campaigns: rows });
    return (await fake.prisma.v1AdCampaign.findFirst({ where })) !== null;
  };

  it('serves exactly while the channel phase is live', async () => {
    const campaign = row(channel);
    const fields = channelFromRow(campaign, channel);
    for (const [label, now] of instants) {
      expect([label, await matches(servingWhere(channel, now), [campaign])]).toEqual([label, channelPhase('published', fields, now) === 'live']);
    }
  });

  it('overlaps another window exactly when the two half-open intervals intersect', async () => {
    const other = row(channel, { id: 'other' });
    const probes = [
      ['ends 1ms before the other starts', at(START, -3_600_000), at(START, -1), false],
      ['ends exactly when the other starts', at(START, -3_600_000), START, false],
      ['ends 1ms after the other starts', at(START, -3_600_000), at(START, 1), true],
      ['starts 1ms before the other ends', at(END, -1), at(END, 3_600_000), true],
      ['starts exactly when the other ends', END, at(END, 3_600_000), false],
      ['starts 1ms after the other ends', at(END, 1), at(END, 3_600_000), false],
      ['sits inside', at(START, 1), at(END, -1), true],
      ['contains it', at(START, -1), at(END, 1), true],
      ['equals it', START, END, true],
    ] as const;
    for (const [label, startAt, endAt, expected] of probes) {
      expect([label, await matches(overlapWhere(channel, { startAt, endAt }, 'candidate'), [other])]).toEqual([label, expected]);
    }
  });

  it('ignores the campaign being checked and campaigns that are not published', async () => {
    const window = { startAt: START, endAt: END };
    expect(await matches(overlapWhere(channel, window, 'c1'), [row(channel)])).toBe(false);
    expect(await matches(overlapWhere(channel, window, 'x'), [row(channel, { status: 'draft' }), row(channel, { id: 'c2', status: 'stopped' })])).toBe(false);
  });
});
