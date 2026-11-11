import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import {
  createAdCampaignFakePrisma,
  type FakeAdmin,
  type FakeAsset,
  type FakeCampaign,
} from '../../test/helpers/ad-campaign-fake-prisma';
import { AdsAdminService } from './ads-admin.service';
import { AdsPublicService } from './ads-public.service';

const NOW = new Date('2026-11-10T03:00:00.000Z');
const OWNER = { id: 'user-owner' } as never;
const OPS = { id: 'user-ops' } as never;
const SUPPORT = { id: 'user-support' } as never;
const REVOKED_OWNER = { id: 'user-revoked-owner' } as never;

const admins: FakeAdmin[] = [
  { id: 'admin-owner', userId: 'user-owner', adminRole: 'owner', status: 'active', nickname: '대표' },
  { id: 'admin-owner-2', userId: 'user-owner-2', adminRole: 'owner', status: 'active', nickname: '공동대표' },
  { id: 'admin-ops', userId: 'user-ops', adminRole: 'ops', status: 'active', nickname: '운영' },
  { id: 'admin-support', userId: 'user-support', adminRole: 'support', status: 'active', nickname: '지원' },
  { id: 'admin-revoked', userId: 'user-revoked-owner', adminRole: 'owner', status: 'revoked', nickname: '퇴임' },
];

const IMG = { banner: '/uploads/ads/banner.webp', popup: '/uploads/ads/popup.webp', other: '/uploads/ads/other.webp' };
const asset = (id: string, url: string, overrides: Partial<FakeAsset> = {}): FakeAsset => ({
  id, url, status: 'temporary', uploadedByAdminUserId: 'admin-owner', noticeId: null, popupId: null, adCampaignId: null, attachedAt: null, ...overrides,
});
const freshAssets = () => [asset('asset-banner', IMG.banner), asset('asset-popup', IMG.popup), asset('asset-other', IMG.other)];

const bannerInput = (overrides: Record<string, unknown> = {}) => ({
  imageUrl: IMG.banner, altText: '에버데이 신제품 배너', linkUrl: '/tournaments/1',
  startAt: '2026-11-12T00:00:00+09:00', endAt: '2026-11-20T00:00:00+09:00', ...overrides,
});
const popupInput = (overrides: Record<string, unknown> = {}) => ({
  imageUrl: IMG.popup, altText: '에버데이 팝업 안내', headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요', linkUrl: 'https://everyday.example.com/event',
  startAt: '2026-11-12T00:00:00+09:00', endAt: '2026-11-15T00:00:00+09:00', ...overrides,
});
const save = (overrides: Record<string, unknown> = {}) =>
  ({ advertiserName: '에버데이', title: '11월 협업', banner: bannerInput(), popup: null, ...overrides }) as never;

function row(id: string, overrides: Partial<FakeCampaign> = {}): FakeCampaign {
  return {
    id, advertiserName: '에버데이', title: `메모 ${id}`, status: 'draft', version: 1,
    bannerImageUrl: null, bannerAltText: null, bannerLinkUrl: null, bannerStartAt: null, bannerEndAt: null,
    popupImageUrl: null, popupAltText: null, popupHeadline: null, popupDescription: null, popupLinkUrl: null, popupStartAt: null, popupEndAt: null,
    publishedAt: null, stoppedAt: null, createdByAdminUserId: 'admin-owner', updatedByAdminUserId: 'admin-owner',
    createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-01T00:00:00Z'), ...overrides,
  };
}
const bannerWindow = (start: string, end: string, extra: Partial<FakeCampaign> = {}): Partial<FakeCampaign> => ({
  bannerImageUrl: IMG.banner, bannerAltText: '배너 대체 텍스트', bannerLinkUrl: '/tournaments/1', bannerStartAt: new Date(start), bannerEndAt: new Date(end), ...extra,
});
const popupWindow = (start: string, end: string, extra: Partial<FakeCampaign> = {}): Partial<FakeCampaign> => ({
  popupImageUrl: IMG.popup, popupAltText: '팝업 대체 텍스트', popupHeadline: '팝업 제목', popupDescription: '팝업 설명', popupLinkUrl: '/events/1', popupStartAt: new Date(start), popupEndAt: new Date(end), ...extra,
});

async function build(seed: { campaigns?: FakeCampaign[]; assets?: FakeAsset[] } = {}) {
  const fake = createAdCampaignFakePrisma({ admins, campaigns: seed.campaigns ?? [], assets: seed.assets ?? freshAssets() });
  const uploads = { removeStoredUrl: jest.fn().mockResolvedValue(undefined) };
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const module = await Test.createTestingModule({
    providers: [
      AdsAdminService,
      AdsPublicService,
      AdminContextService,
      { provide: PrismaService, useValue: fake.prisma },
      { provide: UploadsService, useValue: uploads },
      { provide: getLoggerToken(AdsAdminService.name), useValue: logger },
      { provide: getLoggerToken(AdsPublicService.name), useValue: logger },
    ],
  }).compile();
  return { service: module.get(AdsAdminService), publicService: module.get(AdsPublicService), fake, uploads, logger };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved',
    (error: { response?: { code?: string } }) => error.response?.code ?? 'no-code',
  );

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  });
});
afterEach(() => jest.useRealTimers());

describe('AdsAdminService — access by admin role', () => {
  // 2026-11-11: 조회는 활성 운영자 누구나, 변경은 owner·ops 만(공지·팝업과 같은 기준). support 는 읽기 전용이다.
  it.each([
    ['a revoked owner', REVOKED_OWNER],
    ['a signed-in user with no admin row', { id: 'user-nobody' } as never],
  ])('rejects %s on every operation and changes nothing', async (_label, actor) => {
    const { service, fake } = await build({ campaigns: [row('c1', { status: 'published', version: 3, ...bannerWindow('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z') })] });
    const before = JSON.stringify(fake.state.campaigns);

    const results = await Promise.all([
      codeOf(service.list(actor, {})),
      codeOf(service.detail(actor, 'c1')),
      codeOf(service.create(actor, save())),
      codeOf(service.update(actor, 'c1', { ...(save() as object), expectedVersion: 3 } as never)),
      codeOf(service.publish(actor, 'c1', { expectedVersion: 3 })),
      codeOf(service.stop(actor, 'c1')),
    ]);

    expect(results).toEqual(Array(6).fill('PERMISSION_DENIED'));
    expect(JSON.stringify(fake.state.campaigns)).toBe(before);
    expect(fake.state.actionLogs).toHaveLength(0);
    expect(fake.state.assets.every((candidate) => candidate.adCampaignId === null)).toBe(true);
  });

  it('lets support read but rejects every write and changes nothing', async () => {
    const { service, fake } = await build({ campaigns: [row('c1', { status: 'published', version: 3, ...bannerWindow('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z') })] });
    const before = JSON.stringify(fake.state.campaigns);

    await expect(service.list(SUPPORT, {})).resolves.toMatchObject({ items: [expect.objectContaining({ id: 'c1' })] });
    await expect(service.detail(SUPPORT, 'c1')).resolves.toMatchObject({ campaign: expect.objectContaining({ id: 'c1' }) });
    const results = await Promise.all([
      codeOf(service.create(SUPPORT, save())),
      codeOf(service.update(SUPPORT, 'c1', { ...(save() as object), expectedVersion: 3 } as never)),
      codeOf(service.publish(SUPPORT, 'c1', { expectedVersion: 3 })),
      codeOf(service.stop(SUPPORT, 'c1')),
    ]);

    expect(results).toEqual(Array(4).fill('PERMISSION_DENIED'));
    expect(JSON.stringify(fake.state.campaigns)).toBe(before);
    expect(fake.state.actionLogs).toHaveLength(0);
  });

  // 이미지는 올린 운영자 본인만 쓸 수 있다 — ops 는 자기가 올린 이미지로 만든다.
  it.each([['an owner', OWNER, 'admin-owner'], ['an ops admin', OPS, 'admin-ops']])('lets %s read and write', async (_label, actor, uploader) => {
    const { service } = await build({ assets: [asset('asset-banner', IMG.banner, { uploadedByAdminUserId: uploader }), asset('asset-popup', IMG.popup, { uploadedByAdminUserId: uploader })] });
    await expect(service.list(actor, {})).resolves.toMatchObject({ items: [] });
    const { campaign } = await service.create(actor, save({ popup: popupInput() }));
    expect(campaign.status).toBe('draft');
    await expect(service.detail(actor, campaign.id)).resolves.toMatchObject({ campaign: expect.objectContaining({ id: campaign.id }) });
  });
});

describe('AdsAdminService.create', () => {
  it('saves a draft with both channels, attaches the images and writes an audit trail', async () => {
    const { service, fake } = await build();

    const { campaign } = await service.create(OWNER, save({ popup: popupInput() }));

    expect(campaign).toMatchObject({
      advertiserName: '에버데이',
      title: '11월 협업',
      status: 'draft',
      version: 1,
      createdBy: { adminUserId: 'admin-owner', name: '대표' },
      banner: {
        imageUrl: IMG.banner, altText: '에버데이 신제품 배너', linkUrl: '/tournaments/1',
        startAt: new Date('2026-11-11T15:00:00.000Z'), endAt: new Date('2026-11-19T15:00:00.000Z'), phase: null,
      },
      popup: { imageUrl: IMG.popup, altText: '에버데이 팝업 안내', headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요', linkUrl: 'https://everyday.example.com/event', phase: null },
    });
    expect(campaign.banner).not.toHaveProperty('headline');
    expect(campaign.banner).not.toHaveProperty('description');
    expect(fake.state.assets.filter((candidate) => candidate.adCampaignId === campaign.id).map((candidate) => candidate.url).sort())
      .toEqual([IMG.banner, IMG.popup].sort());
    expect(fake.state.assets.filter((candidate) => candidate.adCampaignId === campaign.id).every((candidate) => candidate.status === 'attached')).toBe(true);
    expect(fake.state.assets.find((candidate) => candidate.url === IMG.other)).toMatchObject({ status: 'temporary', adCampaignId: null });
    expect(fake.state.actionLogs).toEqual([
      expect.objectContaining({ adminUserId: 'admin-owner', action: 'ad_campaign.create', targetType: 'ad_campaign', targetId: campaign.id }),
    ]);
    expect(fake.state.statusLogs).toEqual([
      expect.objectContaining({ targetType: 'ad_campaign', targetId: campaign.id, fromStatus: null, toStatus: 'draft', actorType: 'admin' }),
    ]);
  });

  it('keeps an incomplete channel on a draft but refuses it at publish time', async () => {
    const { service } = await build();
    const { campaign } = await service.create(OWNER, save({ banner: { imageUrl: IMG.banner } }));

    expect(campaign.banner).toMatchObject({ imageUrl: IMG.banner, linkUrl: null, startAt: null, endAt: null });
    expect(await codeOf(service.publish(OWNER, campaign.id, { expectedVersion: 1 }))).toBe('AD_CHANNEL_INCOMPLETE');
  });

  it('treats a channel with every field empty as no channel', async () => {
    const { service } = await build();
    const { campaign } = await service.create(OWNER, save({ banner: { imageUrl: null, linkUrl: null, startAt: null, endAt: null }, popup: undefined }));
    expect(campaign.banner).toBeNull();
    expect(campaign.popup).toBeNull();
  });

  it('allows the same uploaded image in both channels', async () => {
    const { service, fake } = await build();
    const { campaign } = await service.create(OWNER, save({ popup: popupInput({ imageUrl: IMG.banner }) }));
    expect(campaign.popup?.imageUrl).toBe(IMG.banner);
    expect(fake.state.assets.filter((candidate) => candidate.adCampaignId === campaign.id)).toHaveLength(1);
  });

  it('rejects an end that is not after the start, naming the channel, and stores nothing', async () => {
    const { service, fake } = await build();
    const error = await service.create(OWNER, save({ popup: popupInput({ endAt: '2026-11-12T00:00:00+09:00' }) })).catch((e: unknown) => e);

    expect(error).toMatchObject({ response: { code: 'AD_INVALID_WINDOW', details: { channel: 'popup' } } });
    expect(fake.state.campaigns).toHaveLength(0);
  });

  it('rejects an image url that no uploaded content asset backs, rolling back the campaign row', async () => {
    const { service, fake } = await build();

    expect(await codeOf(service.create(OWNER, save({ banner: bannerInput({ imageUrl: '/uploads/ads/never-uploaded.webp' }) })))).toBe('CONTENT_ASSET_NOT_FOUND');

    expect(fake.state.campaigns).toHaveLength(0);
    expect(fake.state.actionLogs).toHaveLength(0);
  });

  it('rejects an asset uploaded by a different admin', async () => {
    const { service, fake } = await build({ assets: [asset('asset-banner', IMG.banner, { uploadedByAdminUserId: 'admin-owner-2' })] });
    expect(await codeOf(service.create(OWNER, save()))).toBe('CONTENT_ASSET_UNAVAILABLE');
    expect(fake.state.campaigns).toHaveLength(0);
  });

  it.each([
    ['a notice', { noticeId: 'notice-1', status: 'attached' as const }],
    ['a popup', { popupId: 'popup-1', status: 'attached' as const }],
    ['another campaign', { adCampaignId: 'campaign-other', status: 'attached' as const }],
  ])('rejects an image already attached to %s', async (_label, overrides) => {
    const { service, fake } = await build({ assets: [asset('asset-banner', IMG.banner, overrides)] });
    expect(await codeOf(service.create(OWNER, save()))).toBe('CONTENT_ASSET_UNAVAILABLE');
    expect(fake.state.campaigns).toHaveLength(0);
  });
});

describe('AdsAdminService.publish', () => {
  const draft = (id: string, overrides: Partial<FakeCampaign> = {}) =>
    row(id, { ...bannerWindow('2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z'), ...overrides });

  it('publishes a complete draft, bumps the version and records the transition', async () => {
    const { service, fake } = await build({ campaigns: [draft('c1', popupWindow('2026-11-12T00:00:00Z', '2026-11-15T00:00:00Z'))] });

    const { campaign } = await service.publish(OWNER, 'c1', { expectedVersion: 1 });

    expect(campaign).toMatchObject({ id: 'c1', status: 'published', version: 2, publishedAt: NOW, stoppedAt: null, banner: { phase: 'scheduled' } });
    expect(fake.state.actionLogs).toEqual([expect.objectContaining({ action: 'ad_campaign.publish', targetId: 'c1' })]);
    expect(fake.state.statusLogs).toEqual([expect.objectContaining({ fromStatus: 'draft', toStatus: 'published' })]);
  });

  it('reports a live phase once the window has opened', async () => {
    const { service } = await build({ campaigns: [draft('c1', bannerWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z'))] });
    expect((await service.publish(OWNER, 'c1', { expectedVersion: 1 })).campaign.banner?.phase).toBe('live');
  });

  it('refuses a campaign with no channel at all', async () => {
    const { service, fake } = await build({ campaigns: [row('c1')] });
    expect(await codeOf(service.publish(OWNER, 'c1', { expectedVersion: 1 }))).toBe('AD_CHANNEL_REQUIRED');
    expect(fake.state.campaigns[0]).toMatchObject({ status: 'draft', version: 1 });
  });

  it('lists exactly what a half-filled channel is missing', async () => {
    const { service, fake } = await build({ campaigns: [row('c1', { popupImageUrl: IMG.popup, popupStartAt: new Date('2026-11-12T00:00:00Z') })] });

    const error = await service.publish(OWNER, 'c1', { expectedVersion: 1 }).catch((e: unknown) => e);

    expect(error).toMatchObject({
      response: { code: 'AD_CHANNEL_INCOMPLETE', details: [{ code: 'AD_CHANNEL_INCOMPLETE', channel: 'popup', missing: ['altText', 'headline', 'linkUrl', 'endAt'] }] },
    });
    expect(fake.state.campaigns[0].status).toBe('draft');
  });

  describe.each(['banner', 'popup'] as const)('alt text — %s', (channel) => {
    const withoutAlt = (id: string, overrides: Partial<FakeCampaign> = {}) =>
      row(id, {
        ...(channel === 'banner' ? bannerWindow('2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z') : popupWindow('2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z')),
        [`${channel}AltText`]: null,
        ...overrides,
      });

    it('refuses to publish a channel that has an image but no alt text', async () => {
      const { service, fake } = await build({ campaigns: [withoutAlt('c1')] });

      const error = await service.publish(OWNER, 'c1', { expectedVersion: 1 }).catch((e: unknown) => e);

      expect(error).toMatchObject({
        status: 400,
        response: { code: 'AD_CHANNEL_INCOMPLETE', details: [{ code: 'AD_CHANNEL_INCOMPLETE', channel, missing: ['altText'] }] },
      });
      expect(fake.state.campaigns[0]).toMatchObject({ status: 'draft', version: 1 });
    });

    it('treats an alt text of only whitespace as missing', async () => {
      const { service } = await build();
      const input = channel === 'banner' ? { banner: bannerInput({ altText: '   ' }) } : { banner: null, popup: popupInput({ altText: '   ' }) };
      const { campaign } = await service.create(OWNER, save(input));

      expect(campaign[channel]).toMatchObject({ altText: null });
      expect(await codeOf(service.publish(OWNER, campaign.id, { expectedVersion: 1 }))).toBe('AD_CHANNEL_INCOMPLETE');
    });

    it('refuses to save a published campaign whose channel loses its alt text', async () => {
      const { service, fake } = await build({
        campaigns: [row('live', { status: 'published', version: 2, publishedAt: NOW, ...bannerWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z'), ...popupWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z') })],
        assets: freshAssets().map((candidate) => ({ ...candidate, status: 'attached' as const, adCampaignId: 'live' })),
      });
      const both = { banner: bannerInput(), popup: popupInput() };
      const payload = { ...(save({ ...both, [channel]: { ...both[channel], altText: null } }) as object), expectedVersion: 2 } as never;

      expect(await codeOf(service.update(OWNER, 'live', payload))).toBe('AD_CHANNEL_INCOMPLETE');
      expect(fake.state.campaigns[0]).toMatchObject({ status: 'published', version: 2 });
    });
  });

  it('names only the channel that lacks alt text when the other one is complete', async () => {
    const { service } = await build({
      campaigns: [row('c1', { ...bannerWindow('2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z'), ...popupWindow('2026-11-12T00:00:00Z', '2026-11-15T00:00:00Z'), popupAltText: null })],
    });

    const error = await service.publish(OWNER, 'c1', { expectedVersion: 1 }).catch((e: unknown) => e);

    expect(error).toMatchObject({ response: { details: [{ channel: 'popup', missing: ['altText'] }] } });
  });

  describe('popup headline and description', () => {
    const popupDraft = (id: string, overrides: Partial<FakeCampaign> = {}) =>
      row(id, { ...popupWindow('2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z'), ...overrides });

    it('publishes a popup that has a headline, with or without a description', async () => {
      const { service } = await build({ campaigns: [popupDraft('with', { popupDescription: '설명' }), popupDraft('without', { popupDescription: null, ...popupWindow('2026-11-25T00:00:00Z', '2026-11-30T00:00:00Z', { popupDescription: null }) })] });

      const withDescription = (await service.publish(OWNER, 'with', { expectedVersion: 1 })).campaign;
      expect(withDescription).toMatchObject({ status: 'published', popup: { headline: '팝업 제목', description: '설명' } });
      expect(withDescription.banner).toBeNull();
      expect((await service.publish(OWNER, 'without', { expectedVersion: 1 })).campaign.popup).toMatchObject({ headline: '팝업 제목', description: null });
    });

    it('refuses a popup that has an image but no headline', async () => {
      const { service, fake } = await build({ campaigns: [popupDraft('c1', { popupHeadline: null })] });

      const error = await service.publish(OWNER, 'c1', { expectedVersion: 1 }).catch((e: unknown) => e);

      expect(error).toMatchObject({
        status: 400,
        response: { code: 'AD_CHANNEL_INCOMPLETE', details: [{ code: 'AD_CHANNEL_INCOMPLETE', channel: 'popup', missing: ['headline'] }] },
      });
      expect(fake.state.campaigns[0]).toMatchObject({ status: 'draft', version: 1 });
    });

    it('records the popup texts in the audit trail and keeps them off the banner snapshot', async () => {
      const { service, fake } = await build();
      await service.create(OWNER, save({ popup: popupInput() }));

      const after = fake.state.actionLogs[0].afterJson as { banner: object; popup: object };
      expect(after.popup).toMatchObject({ headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요' });
      expect(after.banner).not.toHaveProperty('headline');
    });

    it('does not ask a banner for a headline', async () => {
      const { service } = await build({ campaigns: [row('c1', bannerWindow('2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z'))] });
      expect((await service.publish(OWNER, 'c1', { expectedVersion: 1 })).campaign.status).toBe('published');
    });

    it('saves the texts trimmed and treats blank ones as empty', async () => {
      const { service } = await build();
      const trimmed = await service.create(OWNER, save({ banner: null, popup: popupInput({ headline: '  제목  ', description: '  설명  ' }) }));
      expect(trimmed.campaign.popup).toMatchObject({ headline: '제목', description: '설명' });

      const blank = await service.create(OWNER, save({ banner: null, popup: popupInput({ imageUrl: IMG.other, headline: '   ', description: '   ' }), title: '공백' }));
      expect(blank.campaign.popup).toMatchObject({ headline: null, description: null });
      expect(await codeOf(service.publish(OWNER, blank.campaign.id, { expectedVersion: 1 }))).toBe('AD_CHANNEL_INCOMPLETE');
    });

    it('refuses to save a published campaign whose popup loses its headline, and lets a description be dropped', async () => {
      const { service, fake } = await build({
        campaigns: [row('live', { status: 'published', version: 2, publishedAt: NOW, ...popupWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z') })],
        assets: [asset('asset-popup', IMG.popup, { status: 'attached', adCampaignId: 'live' })],
      });
      const payload = (popup: object) => ({ ...(save({ banner: null, popup }) as object), expectedVersion: 2 }) as never;

      expect(await codeOf(service.update(OWNER, 'live', payload(popupInput({ headline: null }))))).toBe('AD_CHANNEL_INCOMPLETE');
      expect(fake.state.campaigns[0]).toMatchObject({ status: 'published', version: 2, popupHeadline: '팝업 제목' });

      const { campaign } = await service.update(OWNER, 'live', payload(popupInput({ description: null })));
      expect(campaign.popup).toMatchObject({ headline: '에버데이 11월 이벤트', description: null });
    });
  });

  it('refuses a window that has already ended', async () => {
    const { service } = await build({ campaigns: [draft('c1', bannerWindow('2026-11-01T00:00:00Z', '2026-11-10T03:00:00.000Z'))] });
    expect(await codeOf(service.publish(OWNER, 'c1', { expectedVersion: 1 }))).toBe('AD_WINDOW_ENDED');
  });

  describe.each(['banner', 'popup'] as const)('one live ad per channel — %s', (channel) => {
    const window = (start: string, end: string, extra: Partial<FakeCampaign> = {}) =>
      channel === 'banner' ? bannerWindow(start, end, extra) : popupWindow(start, end, extra);
    const otherChannelWindow = (start: string, end: string) =>
      channel === 'banner' ? popupWindow(start, end) : bannerWindow(start, end);
    const live = row('live', { status: 'published', version: 2, publishedAt: NOW, ...window('2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z') });
    const candidate = (id: string, start: string, end: string, overrides: Partial<FakeCampaign> = {}) => row(id, { ...window(start, end), ...overrides });

    it('refuses a publish whose window overlaps another published campaign on the same channel', async () => {
      const { service, fake } = await build({ campaigns: [live, candidate('next', '2026-11-20T00:00:00Z', '2026-11-30T00:00:00Z')] });

      const error = await service.publish(OWNER, 'next', { expectedVersion: 1 }).catch((e: unknown) => e);

      expect(error).toMatchObject({
        status: 409,
        response: { code: 'AD_CHANNEL_WINDOW_OVERLAP', details: { channel, conflictingCampaignId: 'live' } },
      });
      expect(fake.state.campaigns.find((c) => c.id === 'next')).toMatchObject({ status: 'draft', version: 1 });
    });

    it.each([
      ['contains the other window', '2026-11-10T00:00:00Z', '2026-12-10T00:00:00Z'],
      ['sits inside the other window', '2026-11-18T00:00:00Z', '2026-11-19T00:00:00Z'],
      ['straddles the start', '2026-11-10T00:00:00Z', '2026-11-16T00:00:00Z'],
      ['straddles the end', '2026-11-24T00:00:00Z', '2026-12-05T00:00:00Z'],
      ['equals the other window', '2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z'],
    ])('refuses a window that %s', async (_label, start, end) => {
      const { service } = await build({ campaigns: [live, candidate('next', start, end)] });
      expect(await codeOf(service.publish(OWNER, 'next', { expectedVersion: 1 }))).toBe('AD_CHANNEL_WINDOW_OVERLAP');
    });

    it.each([
      ['ends where the other starts', '2026-11-10T00:00:00Z', '2026-11-15T00:00:00Z'],
      ['starts where the other ends', '2026-11-25T00:00:00Z', '2026-12-05T00:00:00Z'],
      ['lies entirely before', '2026-11-11T00:00:00Z', '2026-11-14T00:00:00Z'],
      ['lies entirely after', '2026-12-01T00:00:00Z', '2026-12-10T00:00:00Z'],
    ])('allows a window that %s', async (_label, start, end) => {
      const { service } = await build({ campaigns: [live, candidate('next', start, end)] });
      expect((await service.publish(OWNER, 'next', { expectedVersion: 1 })).campaign.status).toBe('published');
    });

    it('allows the same dates on the other channel', async () => {
      const { service } = await build({ campaigns: [live, row('other', otherChannelWindow('2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z'))] });
      expect((await service.publish(OWNER, 'other', { expectedVersion: 1 })).campaign.status).toBe('published');
    });

    it('does not let a draft or a stopped campaign block the window', async () => {
      const { service } = await build({
        campaigns: [
          row('old-draft', window('2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z')),
          row('old-stopped', { status: 'stopped', stoppedAt: NOW, ...window('2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z') }),
          candidate('next', '2026-11-16T00:00:00Z', '2026-11-24T00:00:00Z'),
        ],
      });
      expect((await service.publish(OWNER, 'next', { expectedVersion: 1 })).campaign.status).toBe('published');
    });

    it('lets exactly one of two simultaneous publishes with overlapping windows win', async () => {
      const { service, fake } = await build({
        campaigns: [candidate('a', '2026-11-12T00:00:00Z', '2026-11-20T00:00:00Z'), candidate('b', '2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z')],
      });

      const settled = await Promise.allSettled([
        service.publish(OWNER, 'a', { expectedVersion: 1 }),
        service.publish(OWNER, 'b', { expectedVersion: 1 }),
      ]);

      expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = settled.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ response: { code: 'AD_CHANNEL_WINDOW_OVERLAP' } });
      expect(fake.state.campaigns.filter((c) => c.status === 'published')).toHaveLength(1);
    });
  });

  it('checks every configured channel, not just the first', async () => {
    const { service } = await build({
      campaigns: [
        row('live-popup', { status: 'published', ...popupWindow('2026-11-12T00:00:00Z', '2026-11-18T00:00:00Z') }),
        row('both', { ...bannerWindow('2026-11-12T00:00:00Z', '2026-11-18T00:00:00Z'), ...popupWindow('2026-11-14T00:00:00Z', '2026-11-16T00:00:00Z') }),
      ],
    });
    const error = await service.publish(OWNER, 'both', { expectedVersion: 1 }).catch((e: unknown) => e);
    expect(error).toMatchObject({ response: { code: 'AD_CHANNEL_WINDOW_OVERLAP', details: { channel: 'popup', conflictingCampaignId: 'live-popup' } } });
  });

  it('refuses when someone else saved since the editor loaded, and publishes nothing', async () => {
    const { service, fake } = await build({ campaigns: [draft('c1', { version: 4 })] });

    const error = await service.publish(OWNER, 'c1', { expectedVersion: 3 }).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, response: { code: 'AD_CAMPAIGN_VERSION_CONFLICT', details: { currentVersion: 4 } } });
    expect(fake.state.campaigns[0]).toMatchObject({ status: 'draft', version: 4 });
  });

  it('republishes a stopped campaign and clears the stop time', async () => {
    const { service } = await build({ campaigns: [draft('c1', { status: 'stopped', stoppedAt: new Date('2026-11-09T00:00:00Z'), version: 3 })] });
    const { campaign } = await service.publish(OWNER, 'c1', { expectedVersion: 3 });
    expect(campaign).toMatchObject({ status: 'published', stoppedAt: null, version: 4 });
  });

  it('refuses to publish what is already published', async () => {
    const { service } = await build({ campaigns: [draft('c1', { status: 'published', version: 2 })] });
    expect(await codeOf(service.publish(OWNER, 'c1', { expectedVersion: 2 }))).toBe('AD_CAMPAIGN_INVALID_STATE');
  });

  it('answers 404 for an unknown campaign', async () => {
    const { service } = await build();
    expect(await codeOf(service.publish(OWNER, 'missing', { expectedVersion: 1 }))).toBe('AD_CAMPAIGN_NOT_FOUND');
  });
});

describe('AdsAdminService.update', () => {
  it('replaces the editable fields, bumps the version and drops the image no channel uses any more', async () => {
    const { service, fake, uploads } = await build();
    const created = (await service.create(OWNER, save({ popup: popupInput() }))).campaign;

    const { campaign } = await service.update(OWNER, created.id, {
      ...(save({ advertiserName: '에버데이 코리아', title: '수정', banner: bannerInput({ linkUrl: '/events/2' }), popup: null }) as object),
      expectedVersion: 1,
    } as never);

    expect(campaign).toMatchObject({ advertiserName: '에버데이 코리아', title: '수정', version: 2, popup: null, banner: { linkUrl: '/events/2', imageUrl: IMG.banner } });
    expect(fake.state.assets.map((candidate) => candidate.url)).not.toContain(IMG.popup);
    expect(fake.state.assets.find((candidate) => candidate.url === IMG.banner)).toMatchObject({ adCampaignId: created.id, status: 'attached' });
    expect(uploads.removeStoredUrl).toHaveBeenCalledTimes(1);
    expect(uploads.removeStoredUrl).toHaveBeenCalledWith(IMG.popup);
    expect(fake.state.actionLogs.map((log) => log.action)).toEqual(['ad_campaign.create', 'ad_campaign.update']);
  });

  it('swaps in a newly uploaded image and releases the old one', async () => {
    const { service, fake, uploads } = await build();
    const created = (await service.create(OWNER, save())).campaign;

    await service.update(OWNER, created.id, { ...(save({ banner: bannerInput({ imageUrl: IMG.other }) }) as object), expectedVersion: 1 } as never);

    expect(fake.state.assets.map((candidate) => candidate.url).sort()).toEqual([IMG.other, IMG.popup].sort());
    expect(uploads.removeStoredUrl).toHaveBeenCalledWith(IMG.banner);
  });

  it('logs a failed file removal instead of failing the save', async () => {
    const { service, uploads, logger } = await build();
    const created = (await service.create(OWNER, save({ popup: popupInput() }))).campaign;
    uploads.removeStoredUrl.mockRejectedValueOnce(new Error('disk gone'));

    await expect(service.update(OWNER, created.id, { ...(save() as object), expectedVersion: 1 } as never)).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ url: IMG.popup }), expect.any(String));
  });

  it('rejects a stale editor with 409 and leaves rows, assets and audit untouched', async () => {
    const { service, fake, uploads } = await build();
    const created = (await service.create(OWNER, save({ popup: popupInput() }))).campaign;
    await service.update(OWNER, created.id, { ...(save({ title: '다른 운영자 수정' }) as object), popup: popupInput(), expectedVersion: 1 } as never);
    const rowsBefore = JSON.stringify(fake.state.campaigns);
    const logsBefore = fake.state.actionLogs.length;

    const error = await service.update(OWNER, created.id, { ...(save({ title: '내 수정' }) as object), expectedVersion: 1 } as never).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, response: { code: 'AD_CAMPAIGN_VERSION_CONFLICT', details: { currentVersion: 2 } } });
    expect(JSON.stringify(fake.state.campaigns)).toBe(rowsBefore);
    expect(fake.state.actionLogs).toHaveLength(logsBefore);
    expect(uploads.removeStoredUrl).not.toHaveBeenCalled();
  });

  describe('on a published campaign', () => {
    const live = (overrides: Partial<FakeCampaign> = {}) =>
      row('live', { status: 'published', version: 2, publishedAt: NOW, ...bannerWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z'), ...overrides });
    const payload = (overrides: Record<string, unknown>) => ({ ...(save(overrides) as object), expectedVersion: 2 }) as never;

    it('keeps it published and still checks the one-ad-per-channel rule against the new window', async () => {
      const { service, fake } = await build({
        campaigns: [live(), row('later', { status: 'published', ...bannerWindow('2026-12-01T00:00:00Z', '2026-12-10T00:00:00Z') })],
        assets: [asset('asset-banner', IMG.banner, { status: 'attached', adCampaignId: 'live' })],
      });

      const error = await service.update(OWNER, 'live', payload({ banner: bannerInput({ endAt: '2026-12-05T00:00:00Z' }) })).catch((e: unknown) => e);

      expect(error).toMatchObject({ response: { code: 'AD_CHANNEL_WINDOW_OVERLAP', details: { conflictingCampaignId: 'later' } } });
      expect(fake.state.campaigns.find((candidate) => candidate.id === 'live')).toMatchObject({ status: 'published', version: 2 });
    });

    it('refuses edits that would leave the live channel without a link', async () => {
      const { service, fake } = await build({ campaigns: [live()], assets: [asset('asset-banner', IMG.banner, { status: 'attached', adCampaignId: 'live' })] });

      expect(await codeOf(service.update(OWNER, 'live', payload({ banner: bannerInput({ linkUrl: null }) })))).toBe('AD_CHANNEL_INCOMPLETE');
      expect(await codeOf(service.update(OWNER, 'live', payload({ banner: null, popup: null })))).toBe('AD_CHANNEL_REQUIRED');
      expect(fake.state.campaigns[0]).toMatchObject({ status: 'published', version: 2, bannerLinkUrl: '/tournaments/1' });
    });

    it('lets an operator fix the memo of a campaign whose window already ended', async () => {
      const { service } = await build({
        campaigns: [live(bannerWindow('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z'))],
        assets: [asset('asset-banner', IMG.banner, { status: 'attached', adCampaignId: 'live' })],
      });

      const { campaign } = await service.update(OWNER, 'live', payload({
        title: '메모만 수정', banner: bannerInput({ startAt: '2026-10-01T09:00:00+09:00', endAt: '2026-10-31T09:00:00+09:00' }),
      }));

      expect(campaign).toMatchObject({ title: '메모만 수정', status: 'published', version: 3, banner: { phase: 'ended' } });
    });
  });

  it('allows editing a stopped campaign without re-validating it for publishing', async () => {
    const { service } = await build({ campaigns: [row('c1', { status: 'stopped', version: 3, stoppedAt: NOW })] });
    const { campaign } = await service.update(OWNER, 'c1', { ...(save({ banner: null }) as object), expectedVersion: 3 } as never);
    expect(campaign).toMatchObject({ status: 'stopped', version: 4, banner: null });
  });

  it('answers 404 for an unknown campaign', async () => {
    const { service } = await build();
    expect(await codeOf(service.update(OWNER, 'missing', { ...(save() as object), expectedVersion: 1 } as never))).toBe('AD_CAMPAIGN_NOT_FOUND');
  });
});

describe('AdsAdminService.stop', () => {
  const live = () => row('c1', { status: 'published', version: 2, publishedAt: NOW, ...bannerWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z') });

  it('stops a published campaign, records it, and the public API stops serving it', async () => {
    const { service, publicService, fake } = await build({ campaigns: [live()] });
    expect((await publicService.findActive(NOW)).banner?.campaignId).toBe('c1');

    const { campaign } = await service.stop(OWNER, 'c1');

    expect(campaign).toMatchObject({ status: 'stopped', stoppedAt: NOW, version: 3 });
    expect(fake.state.statusLogs).toEqual([expect.objectContaining({ fromStatus: 'published', toStatus: 'stopped' })]);
    expect((await publicService.findActive(NOW)).banner).toBeNull();
  });

  it('keeps counting statistics for what was already recorded', async () => {
    const { service, fake } = await build({ campaigns: [live()] });
    fake.state.stats.push({ id: 's1', campaignId: 'c1', channel: 'banner', statDate: new Date('2026-11-09T00:00:00Z'), impressions: 40, clicks: 3, createdAt: NOW, updatedAt: NOW });

    await service.stop(OWNER, 'c1');

    expect((await service.detail(OWNER, 'c1')).stats.banner).toEqual({ impressions: 40, clicks: 3 });
  });

  it('takes the same publishing lock as publish and update', async () => {
    const { service, fake } = await build({ campaigns: [live()] });
    await service.stop(OWNER, 'c1');
    expect(fake.state.lockRequests).toEqual(['ad-campaign-publish']);
  });

  it('makes a publish that starts while a stop is still committing wait, then see the stopped campaign instead of a stale overlap', async () => {
    const { service, fake } = await build({
      campaigns: [
        row('c1', { status: 'published', version: 2, publishedAt: NOW, ...bannerWindow('2026-11-15T00:00:00Z', '2026-11-25T00:00:00Z') }),
        row('next', bannerWindow('2026-11-20T00:00:00Z', '2026-11-30T00:00:00Z')),
      ],
    });
    // Hold the stop's write open, the way a slow commit would, while the publish tries to run.
    const updateMany = fake.prisma.v1AdCampaign.updateMany;
    const write = updateMany.getMockImplementation() as NonNullable<ReturnType<typeof updateMany.getMockImplementation>>;
    let commit!: () => void;
    const slowCommit = new Promise<void>((resolve) => (commit = resolve));
    updateMany.mockImplementation(async (args) => {
      if (args.data.status === 'stopped') await slowCommit;
      return write(args);
    });

    const stopping = service.stop(OWNER, 'c1');
    const publishing = service.publish(OWNER, 'next', { expectedVersion: 1 });
    await new Promise((resolve) => setImmediate(resolve));
    commit();

    await expect(stopping).resolves.toMatchObject({ campaign: { id: 'c1', status: 'stopped' } });
    await expect(publishing).resolves.toMatchObject({ campaign: { id: 'next', status: 'published' } });
    expect(fake.state.campaigns.map((c) => [c.id, c.status])).toEqual([['c1', 'stopped'], ['next', 'published']]);
  });

  it('lets only one of two simultaneous stops record a transition', async () => {
    const { service, fake } = await build({ campaigns: [live()] });

    const settled = await Promise.allSettled([service.stop(OWNER, 'c1'), service.stop(OWNER, 'c1')]);

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((settled.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ response: { code: 'AD_CAMPAIGN_INVALID_STATE' } });
    expect(fake.state.campaigns[0]).toMatchObject({ status: 'stopped', version: 3 });
    expect(fake.state.actionLogs.filter((log) => log.action === 'ad_campaign.stop')).toHaveLength(1);
  });

  it.each(['draft', 'stopped'] as const)('refuses to stop a %s campaign', async (status) => {
    const { service } = await build({ campaigns: [row('c1', { status })] });
    expect(await codeOf(service.stop(OWNER, 'c1'))).toBe('AD_CAMPAIGN_INVALID_STATE');
  });

  it('answers 404 for an unknown campaign', async () => {
    const { service } = await build();
    expect(await codeOf(service.stop(OWNER, 'missing'))).toBe('AD_CAMPAIGN_NOT_FOUND');
  });
});

describe('AdsAdminService.list and detail', () => {
  const stat = (campaignId: string, channel: 'banner' | 'popup', date: string, impressions: number, clicks: number) => ({
    id: `${campaignId}-${channel}-${date}`, campaignId, channel, statDate: new Date(`${date}T00:00:00Z`), impressions, clicks, createdAt: NOW, updatedAt: new Date(`${date}T12:00:00Z`),
  });
  const seed = () => [
    row('draft-1', { title: '에버데이 초안', createdAt: new Date('2026-11-01T00:00:00Z') }),
    row('live-1', { title: '에버데이 본편', status: 'published', createdAt: new Date('2026-11-02T00:00:00Z'), ...bannerWindow('2026-11-09T00:00:00Z', '2026-11-20T00:00:00Z'), ...popupWindow('2026-11-09T00:00:00Z', '2026-11-12T00:00:00Z') }),
    row('stopped-1', { title: '다른 광고주', advertiserName: '모닝몰', status: 'stopped', createdAt: new Date('2026-11-03T00:00:00Z') }),
  ];

  it('lists newest first with a status summary and per-channel totals', async () => {
    const { service, fake } = await build({ campaigns: seed() });
    fake.state.stats.push(stat('live-1', 'banner', '2026-11-09', 100, 4), stat('live-1', 'banner', '2026-11-10', 50, 1), stat('live-1', 'popup', '2026-11-10', 20, 2));

    const result = await service.list(OWNER, {});

    expect(result.items.map((item) => item.id)).toEqual(['stopped-1', 'live-1', 'draft-1']);
    expect(result.summary).toEqual({ total: 3, byStatus: { draft: 1, published: 1, stopped: 1 } });
    expect(result.items.find((item) => item.id === 'live-1')?.stats).toEqual({ banner: { impressions: 150, clicks: 5 }, popup: { impressions: 20, clicks: 2 } });
    expect(result.items.find((item) => item.id === 'draft-1')?.stats).toEqual({ banner: { impressions: 0, clicks: 0 }, popup: { impressions: 0, clicks: 0 } });
    expect(result.pageInfo).toMatchObject({ limit: 20, total: 3, hasNext: false, nextCursor: null });
  });

  it('filters by status and by advertiser or memo text, keeping the summary scoped to the text search', async () => {
    const { service } = await build({ campaigns: seed() });

    expect((await service.list(OWNER, { status: 'published' })).items.map((item) => item.id)).toEqual(['live-1']);
    const byText = await service.list(OWNER, { q: '모닝몰' });
    expect(byText.items.map((item) => item.id)).toEqual(['stopped-1']);
    expect(byText.summary.total).toBe(1);
    expect((await service.list(OWNER, { q: '에버데이' })).items.map((item) => item.id)).toEqual(['live-1', 'draft-1']);
  });

  it('pages with a cursor and reports whether more rows follow', async () => {
    const { service } = await build({ campaigns: seed() });

    const first = await service.list(OWNER, { limit: 2 });
    expect(first.items.map((item) => item.id)).toEqual(['stopped-1', 'live-1']);
    expect(first.pageInfo).toMatchObject({ hasNext: true, nextCursor: 'live-1' });

    const second = await service.list(OWNER, { limit: 2, cursor: first.pageInfo.nextCursor as string });
    expect(second.items.map((item) => item.id)).toEqual(['draft-1']);
    expect(second.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  it('returns an empty last page for a cursor whose row no longer exists, as the database does', async () => {
    const { service } = await build({ campaigns: seed() });
    const page = await service.list(OWNER, { cursor: 'deleted-campaign' });
    expect(page.items).toEqual([]);
    expect(page.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  it('returns the daily breakdown newest day first, totals per channel and when the numbers last changed', async () => {
    const { service, fake } = await build({ campaigns: seed() });
    fake.state.stats.push(stat('live-1', 'banner', '2026-11-09', 100, 4), stat('live-1', 'banner', '2026-11-10', 50, 1), stat('live-1', 'popup', '2026-11-10', 20, 2), stat('stopped-1', 'banner', '2026-11-10', 999, 99));

    const { campaign, stats } = await service.detail(OWNER, 'live-1');

    expect(campaign).toMatchObject({ id: 'live-1', status: 'published', banner: { phase: 'live' }, popup: { phase: 'live' } });
    expect(stats.banner).toEqual({ impressions: 150, clicks: 5 });
    expect(stats.popup).toEqual({ impressions: 20, clicks: 2 });
    expect(stats.daily).toEqual([
      { date: '2026-11-10', channel: 'banner', impressions: 50, clicks: 1 },
      { date: '2026-11-10', channel: 'popup', impressions: 20, clicks: 2 },
      { date: '2026-11-09', channel: 'banner', impressions: 100, clicks: 4 },
    ]);
    expect(stats.updatedAt).toEqual(new Date('2026-11-10T12:00:00Z'));
  });

  it('returns empty statistics for a campaign nobody has seen yet', async () => {
    const { service } = await build({ campaigns: seed() });
    const { stats } = await service.detail(OWNER, 'draft-1');
    expect(stats).toEqual({ banner: { impressions: 0, clicks: 0 }, popup: { impressions: 0, clicks: 0 }, daily: [], updatedAt: null });
  });

  it('answers 404 for an unknown campaign', async () => {
    const { service } = await build();
    expect(await codeOf(service.detail(OWNER, 'missing'))).toBe('AD_CAMPAIGN_NOT_FOUND');
  });
});
