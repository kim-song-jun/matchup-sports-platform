import { randomUUID } from 'node:crypto';
import { AdminContextService } from '../../src/common/admin-context.service';
import { AdsAdminService } from '../../src/ads/ads-admin.service';
import { AdsPublicService } from '../../src/ads/ads-public.service';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { PrismaService } from '../../src/prisma/prisma.service';

// The integration runner clones the approved disposable database for this file.
describe('ad campaigns against PostgreSQL', () => {
  const prisma = new PrismaService();
  const uploads = { removeStoredUrl: jest.fn().mockResolvedValue(undefined) };
  const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const adminContext = new AdminContextService(prisma);
  const admin = new AdsAdminService(prisma, adminContext, uploads as never, logger as never);
  const publicAds = new AdsPublicService(prisma, logger as never);

  const prefix = `ads-${randomUUID().slice(0, 8)}`;
  const userIds: string[] = [];
  let owner: V1AuthUser;
  let support: V1AuthUser;
  let ownerAdminId: string;
  let seq = 0;

  const actor = (id: string): V1AuthUser => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed' });

  async function upload(): Promise<string> {
    seq += 1;
    const url = `/uploads/${prefix}/image-${seq}.webp`;
    await prisma.v1ContentAsset.create({ data: { url, storagePath: `${prefix}/image-${seq}.webp`, uploadedByAdminUserId: ownerAdminId } });
    return url;
  }

  const window = (startDay: number, endDay: number) => ({
    startAt: `2026-12-${String(startDay).padStart(2, '0')}T00:00:00+09:00`,
    endAt: `2026-12-${String(endDay).padStart(2, '0')}T00:00:00+09:00`,
  });

  async function draft(channel: 'banner' | 'popup', startDay: number, endDay: number) {
    const creative = {
      imageUrl: await upload(),
      altText: '에버데이 행사 안내',
      ...(channel === 'popup' ? { headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요' } : {}),
      linkUrl: '/tournaments/1',
      ...window(startDay, endDay),
    };
    const { campaign } = await admin.create(owner, {
      advertiserName: '에버데이',
      title: `${prefix}-${seq}`,
      [channel]: creative,
    } as never);
    return campaign;
  }

  beforeAll(async () => {
    const ownerRow = await prisma.v1User.create({ data: { adminUser: { create: { adminRole: 'owner' } } }, include: { adminUser: true } });
    const supportRow = await prisma.v1User.create({ data: { adminUser: { create: { adminRole: 'support' } } } });
    userIds.push(ownerRow.id, supportRow.id);
    owner = actor(ownerRow.id);
    support = actor(supportRow.id);
    ownerAdminId = ownerRow.adminUser!.id;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({
      now: new Date('2026-12-01T03:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    await prisma.v1AdCampaign.deleteMany({ where: { createdByAdminUserId: ownerAdminId } });
    await prisma.v1ContentAsset.deleteMany({ where: { uploadedByAdminUserId: ownerAdminId } });
  });

  afterAll(async () => {
    await prisma.v1AdminActionLog.deleteMany({ where: { adminUser: { userId: { in: userIds } } } });
    await prisma.v1StatusChangeLog.deleteMany({ where: { adminUser: { userId: { in: userIds } } } });
    await prisma.v1AdminUser.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.v1User.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('refuses a support admin (read-only) before touching any row', async () => {
    await expect(admin.create(support, { advertiserName: 'x', title: 'y' } as never)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(await prisma.v1AdCampaign.count({ where: { createdByAdminUserId: ownerAdminId } })).toBe(0);
  });

  it('stores the alt text per channel and refuses to publish a channel without it', async () => {
    const withAlt = await draft('banner', 10, 20);
    expect(withAlt.banner?.altText).toBe('에버데이 행사 안내');
    const [stored] = await prisma.$queryRaw<Array<{ banner_alt_text: string | null; popup_alt_text: string | null }>>`
      SELECT banner_alt_text, popup_alt_text FROM v1_ad_campaigns WHERE id = ${withAlt.id}`;
    expect(stored).toEqual({ banner_alt_text: '에버데이 행사 안내', popup_alt_text: null });

    const { campaign: noAlt } = await admin.create(owner, {
      advertiserName: '에버데이',
      title: `${prefix}-no-alt`,
      banner: { imageUrl: await upload(), linkUrl: '/tournaments/1', ...window(10, 20) },
    } as never);
    await expect(admin.publish(owner, noAlt.id, { expectedVersion: 1 })).rejects.toMatchObject({
      response: { code: 'AD_CHANNEL_INCOMPLETE', details: [{ channel: 'banner', missing: ['altText'] }] },
    });
    expect((await prisma.v1AdCampaign.findUniqueOrThrow({ where: { id: noAlt.id } })).status).toBe('draft');
  });

  it('stores the popup headline and description in their columns, serves them, and refuses a popup without a headline', async () => {
    const popup = await draft('popup', 1, 5);
    expect(popup.popup).toMatchObject({ headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요' });
    expect(popup.banner).toBeNull();
    const [stored] = await prisma.$queryRaw<Array<{ popup_headline: string | null; popup_description: string | null }>>`
      SELECT popup_headline, popup_description FROM v1_ad_campaigns WHERE id = ${popup.id}`;
    expect(stored).toEqual({ popup_headline: '에버데이 11월 이벤트', popup_description: '신제품을 먼저 만나 보세요' });
    await admin.publish(owner, popup.id, { expectedVersion: 1 });
    expect((await publicAds.findActive()).popup).toMatchObject({ campaignId: popup.id, headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요' });

    const { campaign: noHeadline } = await admin.create(owner, {
      advertiserName: '에버데이',
      title: `${prefix}-no-headline`,
      popup: { imageUrl: await upload(), altText: '안내', linkUrl: '/tournaments/1', ...window(10, 20) },
    } as never);
    await expect(admin.publish(owner, noHeadline.id, { expectedVersion: 1 })).rejects.toMatchObject({
      response: { code: 'AD_CHANNEL_INCOMPLETE', details: [{ channel: 'popup', missing: ['headline'] }] },
    });
    expect((await prisma.v1AdCampaign.findUniqueOrThrow({ where: { id: noHeadline.id } })).status).toBe('draft');
  });

  it('keeps one live ad per channel in SQL: overlap refused, touching edges and the other channel allowed', async () => {
    const first = await draft('banner', 10, 20);
    const overlapping = await draft('banner', 15, 25);
    const touching = await draft('banner', 20, 30);
    const otherChannel = await draft('popup', 10, 20);

    await admin.publish(owner, first.id, { expectedVersion: 1 });

    await expect(admin.publish(owner, overlapping.id, { expectedVersion: 1 })).rejects.toMatchObject({
      response: { code: 'AD_CHANNEL_WINDOW_OVERLAP', details: { channel: 'banner', conflictingCampaignId: first.id } },
    });
    await expect(admin.publish(owner, touching.id, { expectedVersion: 1 })).resolves.toMatchObject({ campaign: { status: 'published' } });
    await expect(admin.publish(owner, otherChannel.id, { expectedVersion: 1 })).resolves.toMatchObject({ campaign: { status: 'published' } });

    const statuses = await prisma.v1AdCampaign.findMany({ where: { createdByAdminUserId: ownerAdminId }, select: { id: true, status: true } });
    expect(Object.fromEntries(statuses.map((row) => [row.id, row.status]))).toEqual({
      [first.id]: 'published', [overlapping.id]: 'draft', [touching.id]: 'published', [otherChannel.id]: 'published',
    });
  });

  it('lets exactly one of several simultaneous overlapping publishes win', async () => {
    const campaigns = await Promise.all([draft('banner', 10, 20), draft('banner', 12, 22), draft('banner', 14, 24), draft('banner', 16, 26)]);

    const settled = await Promise.allSettled(campaigns.map((campaign) => admin.publish(owner, campaign.id, { expectedVersion: 1 })));

    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    settled.filter((result): result is PromiseRejectedResult => result.status === 'rejected').forEach((result) => {
      expect(result.reason).toMatchObject({ response: { code: 'AD_CHANNEL_WINDOW_OVERLAP' } });
    });
    expect(await prisma.v1AdCampaign.count({ where: { createdByAdminUserId: ownerAdminId, status: 'published' } })).toBe(1);
  });

  it('frees the window as soon as a campaign is stopped, including when the publish runs at the same time', async () => {
    const live = await draft('banner', 10, 20);
    const next = await draft('banner', 12, 22);
    await admin.publish(owner, live.id, { expectedVersion: 1 });
    await admin.stop(owner, live.id);
    await expect(admin.publish(owner, next.id, { expectedVersion: 1 })).resolves.toMatchObject({ campaign: { status: 'published' } });

    const again = await draft('popup', 10, 20);
    const concurrent = await draft('popup', 12, 22);
    await admin.publish(owner, again.id, { expectedVersion: 1 });
    const settled = await Promise.allSettled([admin.stop(owner, again.id), admin.publish(owner, concurrent.id, { expectedVersion: 1 })]);

    expect(settled[0].status).toBe('fulfilled');
    // The publish either ran before the stop (refused as an overlap) or after it (accepted); it never fails any other way.
    if (settled[1].status === 'rejected') expect(settled[1].reason).toMatchObject({ response: { code: 'AD_CHANNEL_WINDOW_OVERLAP' } });
    const published = await prisma.v1AdCampaign.count({ where: { id: { in: [again.id, concurrent.id] }, status: 'published' } });
    expect(published).toBe(settled[1].status === 'fulfilled' ? 1 : 0);
  });

  it('serves only the live published ad, and stops serving it once stopped', async () => {
    const live = await draft('banner', 1, 5);
    const later = await draft('banner', 10, 20);
    const stoppedLater = await draft('popup', 1, 5);
    await admin.publish(owner, live.id, { expectedVersion: 1 });
    await admin.publish(owner, later.id, { expectedVersion: 1 });
    await admin.publish(owner, stoppedLater.id, { expectedVersion: 1 });
    await admin.stop(owner, stoppedLater.id);

    const active = await publicAds.findActive();

    expect(active.banner?.campaignId).toBe(live.id);
    expect(active.popup).toBeNull();

    await admin.stop(owner, live.id);
    expect((await publicAds.findActive()).banner).toBeNull();
  });

  it('accumulates concurrent event batches into one KST-dated row and ignores unpublished campaigns', async () => {
    const live = await draft('banner', 1, 5);
    const unpublished = await draft('banner', 10, 20);
    await admin.publish(owner, live.id, { expectedVersion: 1 });
    const impression = { campaignId: live.id, channel: 'banner' as const, type: 'impression' as const };
    const click = { campaignId: live.id, channel: 'banner' as const, type: 'click' as const };

    await Promise.all(Array.from({ length: 8 }, () => publicAds.recordEvents([impression, impression, click])));
    const ignored = await publicAds.recordEvents([{ campaignId: unpublished.id, channel: 'banner', type: 'impression' }]);

    expect(ignored).toEqual({ accepted: 0, ignored: 1 });
    const rows = await prisma.$queryRaw<Array<{ campaign_id: string; stat_date: string; impressions: number; clicks: number }>>`
      SELECT campaign_id, stat_date::text AS stat_date, impressions, clicks FROM v1_ad_campaign_daily_stats WHERE campaign_id IN (${live.id}, ${unpublished.id})`;
    expect(rows).toEqual([{ campaign_id: live.id, stat_date: '2026-12-01', impressions: 16, clicks: 8 }]);
  });

  it('takes concurrent batches that touch the same counter rows in opposite orders without a deadlock or a lost count', async () => {
    const { campaign } = await admin.create(owner, {
      advertiserName: '에버데이',
      title: `${prefix}-both`,
      banner: { imageUrl: await upload(), altText: '배너 안내', linkUrl: '/tournaments/1', ...window(1, 28) },
      popup: { imageUrl: await upload(), altText: '팝업 안내', headline: '제목', linkUrl: '/tournaments/1', ...window(1, 28) },
    } as never);
    await admin.publish(owner, campaign.id, { expectedVersion: 1 });
    const banner = { campaignId: campaign.id, channel: 'banner' as const };
    const forward = [{ ...banner, type: 'impression' as const }, { ...banner, type: 'impression' as const }, { campaignId: campaign.id, channel: 'popup' as const, type: 'click' as const }];
    const reverse = [...forward].reverse();
    const days = 12;
    const requestsPerDay = 8;

    // A new KST day per round means the first requests of each round race to create the rows, the rest race to update them.
    for (let day = 0; day < days; day += 1) {
      const now = new Date(Date.UTC(2026, 11, 1 + day, 3, 0, 0));
      await Promise.all(Array.from({ length: requestsPerDay }, (_, index) => publicAds.recordEvents(index % 2 === 0 ? forward : reverse, now)));
    }

    const rows = await prisma.$queryRaw<Array<{ channel: string; impressions: number; clicks: number }>>`
      SELECT channel::text AS channel, impressions, clicks FROM v1_ad_campaign_daily_stats WHERE campaign_id = ${campaign.id}`;
    expect(rows).toHaveLength(days * 2);
    expect(rows.filter((row) => row.channel === 'banner').every((row) => row.impressions === requestsPerDay * 2 && row.clicks === 0)).toBe(true);
    expect(rows.filter((row) => row.channel === 'popup').every((row) => row.impressions === 0 && row.clicks === requestsPerDay)).toBe(true);
  });

  it('returns an empty page for a list cursor whose campaign no longer exists', async () => {
    await draft('banner', 10, 20);
    const page = await admin.list(owner, { cursor: randomUUID() });
    expect(page.items).toEqual([]);
    expect(page.pageInfo).toMatchObject({ hasNext: false, nextCursor: null });
  });

  it('writes the KST calendar date for an event that is still the previous day in UTC', async () => {
    const live = await draft('banner', 1, 5);
    await admin.publish(owner, live.id, { expectedVersion: 1 });

    await publicAds.recordEvents([{ campaignId: live.id, channel: 'banner', type: 'impression' }], new Date('2026-12-01T15:30:00.000Z'));

    const [row] = await prisma.$queryRaw<Array<{ stat_date: string }>>`SELECT stat_date::text AS stat_date FROM v1_ad_campaign_daily_stats WHERE campaign_id = ${live.id}`;
    expect(row.stat_date).toBe('2026-12-02');
  });

  it('attaches the uploaded image to the campaign and removes the row of an image the campaign drops', async () => {
    const campaign = await draft('banner', 10, 20);
    const attached = await prisma.v1ContentAsset.findMany({ where: { adCampaignId: campaign.id } });
    expect(attached).toEqual([expect.objectContaining({ url: campaign.banner?.imageUrl, status: 'attached' })]);

    await admin.update(owner, campaign.id, { advertiserName: '에버데이', title: '배너 제거', banner: null, popup: null, expectedVersion: 1 } as never);

    expect(await prisma.v1ContentAsset.count({ where: { adCampaignId: campaign.id } })).toBe(0);
    expect(uploads.removeStoredUrl).toHaveBeenCalledWith(campaign.banner?.imageUrl);
  });

  it('refuses a stale editor and reports the stored version', async () => {
    const campaign = await draft('banner', 10, 20);
    await admin.update(owner, campaign.id, { advertiserName: '에버데이', title: '먼저 저장', banner: campaign.banner, popup: null, expectedVersion: 1 } as never);

    await expect(
      admin.update(owner, campaign.id, { advertiserName: '에버데이', title: '늦은 저장', banner: campaign.banner, popup: null, expectedVersion: 1 } as never),
    ).rejects.toMatchObject({ response: { code: 'AD_CAMPAIGN_VERSION_CONFLICT', details: { currentVersion: 2 } } });
    expect((await prisma.v1AdCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).title).toBe('먼저 저장');
  });

  it('keeps the database CHECK on a window that ends before it starts', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO v1_ad_campaigns (id, advertiser_name, title, banner_start_at, banner_end_at, created_by_admin_user_id, updated_by_admin_user_id, updated_at)
        VALUES (${randomUUID()}, 'x', 'y', '2026-12-10', '2026-12-09', ${ownerAdminId}, ${ownerAdminId}, now())`,
    ).rejects.toThrow(/v1_ad_campaigns_banner_window_check/);
  });
});
