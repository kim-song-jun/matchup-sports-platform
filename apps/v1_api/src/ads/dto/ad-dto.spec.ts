import 'reflect-metadata';
import { createGlobalValidationPipe } from '../../common/global-validation-pipe';
import {
  AD_ALT_TEXT_MAX_LENGTH,
  AD_POPUP_DESCRIPTION_MAX_LENGTH,
  AD_POPUP_HEADLINE_MAX_LENGTH,
  AdminAdCampaignListQueryDto,
  PublishAdCampaignDto,
  SaveAdCampaignDto,
  UpdateAdCampaignDto,
} from './ad-campaign.dto';
import { AD_EVENT_BATCH_MAX, AdEventBatchDto } from './ad-event.dto';

const pipe = createGlobalValidationPipe();
const parse = <T>(metatype: new () => T, body: unknown, type: 'body' | 'query' = 'body') =>
  pipe.transform(body, { type, metatype }) as Promise<T>;
const rejects = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });

const creative = (overrides: Record<string, unknown> = {}) => ({
  imageUrl: '/uploads/ads/banner.webp',
  altText: '에버데이 신제품',
  linkUrl: '/tournaments/1',
  startAt: '2026-11-12T00:00:00+09:00',
  endAt: '2026-11-20T00:00:00+09:00',
  ...overrides,
});
const save = (overrides: Record<string, unknown> = {}) => ({ advertiserName: '에버데이', title: '11월 협업', banner: creative(), ...overrides });

describe('SaveAdCampaignDto', () => {
  it('accepts a campaign with both channels and one with no channel at all', async () => {
    await expect(parse(SaveAdCampaignDto, save({ popup: creative({ linkUrl: 'https://everyday.example.com/event' }) }))).resolves.toBeDefined();
    await expect(parse(SaveAdCampaignDto, { advertiserName: '에버데이', title: '초안' })).resolves.toBeDefined();
    await expect(parse(SaveAdCampaignDto, save({ banner: null, popup: null }))).resolves.toBeDefined();
  });

  it('accepts a draft channel with every field null', async () => {
    await expect(parse(SaveAdCampaignDto, save({ banner: { imageUrl: null, altText: null, linkUrl: null, startAt: null, endAt: null } }))).resolves.toBeDefined();
  });

  it('trims the names and refuses blank ones', async () => {
    const dto = await parse(SaveAdCampaignDto, save({ advertiserName: '  에버데이  ', title: ' 메모 ' }));
    expect(dto).toMatchObject({ advertiserName: '에버데이', title: '메모' });
    await rejects(parse(SaveAdCampaignDto, save({ advertiserName: '   ' })));
    await rejects(parse(SaveAdCampaignDto, save({ title: '' })));
    await rejects(parse(SaveAdCampaignDto, save({ advertiserName: 'a'.repeat(61) })));
  });

  it.each([
    ['an external https image', 'https://cdn.example.com/banner.png'],
    ['an http image', 'http://cdn.example.com/banner.png'],
    ['a data url', 'data:image/png;base64,AAAA'],
    ['a path outside /uploads', '/static/banner.png'],
    ['a parent-directory escape', '/uploads/../secret.png'],
    ['a hidden private upload', '/uploads/.private/chat/file.png'],
    ['a css breakout', '/uploads/a.png"); background:url(//evil'],
    ['a protocol-relative url', '//cdn.example.com/banner.png'],
  ])('refuses %s as an image', async (_label, imageUrl) => {
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ imageUrl }) })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: null, popup: creative({ imageUrl }) })));
  });

  it.each([
    'http://example.com/a',
    'javascript:alert(1)',
    'data:text/html,hi',
    'teameet://home',
    '//evil.example.com',
    '/\\evil.example.com',
    'https://user:pw@example.com/',
    'https://localhost/admin',
    'https://192.168.0.10/',
    'https://[::1]/',
    'https://intranet/',
  ])('refuses the link %s', async (linkUrl) => {
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ linkUrl }) })));
  });

  it.each(['/events/1', 'https://everyday.example.com/event?x=1'])('accepts the link %s', async (linkUrl) => {
    await expect(parse(SaveAdCampaignDto, save({ banner: creative({ linkUrl }) }))).resolves.toBeDefined();
  });

  it.each([
    ['a bare date', '2026-11-12'],
    ['a timestamp without an offset', '2026-11-12T00:00:00'],
    ['a non-date string', 'tomorrow'],
    ['an impossible date', '2026-13-45T00:00:00Z'],
    ['an epoch number', 1_762_900_000_000],
  ])('refuses %s as a time', async (_label, value) => {
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ startAt: value }) })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ endAt: value }) })));
  });

  it.each(['2026-11-12T00:00:00+09:00', '2026-11-11T15:00:00Z', '2026-11-11T15:00:00.000Z'])('accepts the time %s', async (value) => {
    await expect(parse(SaveAdCampaignDto, save({ banner: creative({ startAt: value }) }))).resolves.toBeDefined();
  });

  it('refuses fields the caller must not set', async () => {
    await rejects(parse(SaveAdCampaignDto, save({ status: 'published' })));
    await rejects(parse(SaveAdCampaignDto, save({ version: 9 })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ html: '<script>' }) })));
    await rejects(parse(SaveAdCampaignDto, save({ createdByAdminUserId: 'someone' })));
  });

  it('trims the alt text and accepts the longest allowed one', async () => {
    const dto = await parse(SaveAdCampaignDto, save({ banner: creative({ altText: '  신제품 안내  ' }) }));
    expect(dto.banner?.altText).toBe('신제품 안내');
    await expect(parse(SaveAdCampaignDto, save({ banner: creative({ altText: 'a'.repeat(AD_ALT_TEXT_MAX_LENGTH) }) }))).resolves.toBeDefined();
  });

  it('refuses an over-long alt text and non-string fields', async () => {
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ altText: 'a'.repeat(AD_ALT_TEXT_MAX_LENGTH + 1) }) })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ linkUrl: 42 }) })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: 'banner' })));
  });
});

describe('popup headline and description', () => {
  const popup = (overrides: Record<string, unknown> = {}) => creative({ headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요', ...overrides });

  it('accepts a popup with both texts, with only a headline, and with neither', async () => {
    await expect(parse(SaveAdCampaignDto, save({ popup: popup() }))).resolves.toBeDefined();
    await expect(parse(SaveAdCampaignDto, save({ popup: popup({ description: null }) }))).resolves.toBeDefined();
    await expect(parse(SaveAdCampaignDto, save({ popup: creative() }))).resolves.toBeDefined();
  });

  it('trims both texts', async () => {
    const dto = await parse(SaveAdCampaignDto, save({ popup: popup({ headline: '  제목  ', description: '  설명  ' }) }));
    expect(dto.popup).toMatchObject({ headline: '제목', description: '설명' });
  });

  it('allows exactly the maximum length and refuses one more', async () => {
    await expect(parse(SaveAdCampaignDto, save({ popup: popup({ headline: '가'.repeat(AD_POPUP_HEADLINE_MAX_LENGTH) }) }))).resolves.toBeDefined();
    await rejects(parse(SaveAdCampaignDto, save({ popup: popup({ headline: '가'.repeat(AD_POPUP_HEADLINE_MAX_LENGTH + 1) }) })));
    await expect(parse(SaveAdCampaignDto, save({ popup: popup({ description: '가'.repeat(AD_POPUP_DESCRIPTION_MAX_LENGTH) }) }))).resolves.toBeDefined();
    await rejects(parse(SaveAdCampaignDto, save({ popup: popup({ description: '가'.repeat(AD_POPUP_DESCRIPTION_MAX_LENGTH + 1) }) })));
  });

  it('uses 40 and 80 characters as the limits', () => {
    expect([AD_POPUP_HEADLINE_MAX_LENGTH, AD_POPUP_DESCRIPTION_MAX_LENGTH]).toEqual([40, 80]);
  });

  it('refuses non-string texts and keeps both off the banner', async () => {
    await rejects(parse(SaveAdCampaignDto, save({ popup: popup({ headline: 7 }) })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ headline: '배너 제목' }) })));
    await rejects(parse(SaveAdCampaignDto, save({ banner: creative({ description: '배너 설명' }) })));
  });
});

describe('UpdateAdCampaignDto and PublishAdCampaignDto', () => {
  it('require the version the editor loaded', async () => {
    await expect(parse(UpdateAdCampaignDto, { ...save(), expectedVersion: 3 })).resolves.toBeDefined();
    await rejects(parse(UpdateAdCampaignDto, save()));
    await rejects(parse(UpdateAdCampaignDto, { ...save(), expectedVersion: 0 }));
    await rejects(parse(UpdateAdCampaignDto, { ...save(), expectedVersion: 1.5 }));
    await expect(parse(PublishAdCampaignDto, { expectedVersion: 2 })).resolves.toBeDefined();
    await rejects(parse(PublishAdCampaignDto, {}));
    await rejects(parse(PublishAdCampaignDto, { expectedVersion: '2; DROP' }));
  });
});

describe('AdminAdCampaignListQueryDto', () => {
  it('coerces numbers from the query string and bounds them', async () => {
    await expect(parse(AdminAdCampaignListQueryDto, { status: 'published', q: ' 에버데이 ', page: '2', limit: '50' }, 'query'))
      .resolves.toMatchObject({ status: 'published', q: '에버데이', page: 2, limit: 50 });
    await rejects(parse(AdminAdCampaignListQueryDto, { limit: '51' }, 'query'));
    await rejects(parse(AdminAdCampaignListQueryDto, { page: '0' }, 'query'));
    await rejects(parse(AdminAdCampaignListQueryDto, { status: 'archived' }, 'query'));
  });
});

describe('AdEventBatchDto', () => {
  const event = (overrides: Record<string, unknown> = {}) => ({
    campaignId: '0d7c9a52-8f0b-4c5c-9d52-1b4a3f6e2a10', channel: 'banner', type: 'impression', ...overrides,
  });

  it('accepts 1 to 20 events', async () => {
    await expect(parse(AdEventBatchDto, { events: [event()] })).resolves.toBeDefined();
    await expect(parse(AdEventBatchDto, { events: Array.from({ length: AD_EVENT_BATCH_MAX }, () => event({ type: 'click', channel: 'popup' })) })).resolves.toBeDefined();
  });

  it('refuses an empty batch, an oversized batch and a non-array', async () => {
    await rejects(parse(AdEventBatchDto, { events: [] }));
    await rejects(parse(AdEventBatchDto, { events: Array.from({ length: AD_EVENT_BATCH_MAX + 1 }, () => event()) }));
    await rejects(parse(AdEventBatchDto, { events: event() }));
    await rejects(parse(AdEventBatchDto, {}));
  });

  it('refuses malformed entries', async () => {
    await rejects(parse(AdEventBatchDto, { events: [event({ campaignId: 'not-a-uuid' })] }));
    await rejects(parse(AdEventBatchDto, { events: [event({ channel: 'sidebar' })] }));
    await rejects(parse(AdEventBatchDto, { events: [event({ type: 'view' })] }));
    await rejects(parse(AdEventBatchDto, { events: [event(), event({ type: undefined })] }));
  });

  it('refuses anything that could identify the viewer', async () => {
    await rejects(parse(AdEventBatchDto, { events: [event({ userId: 'u-1' })] }));
    await rejects(parse(AdEventBatchDto, { events: [event({ deviceId: 'd-1' })] }));
    await rejects(parse(AdEventBatchDto, { events: [event()], sessionId: 's-1' }));
  });
});
