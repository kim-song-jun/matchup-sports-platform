import { ExecutionContext, INestApplication } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { getLoggerToken } from 'nestjs-pino';
import request = require('supertest');
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { AdminContextService } from '../common/admin-context.service';
import { createGlobalValidationPipe } from '../common/global-validation-pipe';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { createAdCampaignFakePrisma, type FakeAdmin } from '../../test/helpers/ad-campaign-fake-prisma';
import { AdsAdminController } from './ads-admin.controller';
import { AdsAdminService } from './ads-admin.service';
import { AdsPublicController } from './ads-public.controller';
import { AdsPublicService } from './ads-public.service';

const NOW = new Date('2026-11-10T03:00:00.000Z');
const admins: FakeAdmin[] = [
  { id: 'admin-owner', userId: 'user-owner', adminRole: 'owner', status: 'active', nickname: '대표' },
  { id: 'admin-ops', userId: 'user-ops', adminRole: 'ops', status: 'active', nickname: '운영' },
];
const BANNER_URL = '/uploads/ads/banner.webp';
const creative = (overrides: Record<string, unknown> = {}) => ({
  imageUrl: BANNER_URL, altText: '에버데이 신제품', linkUrl: '/tournaments/1',
  startAt: '2026-11-09T00:00:00+09:00', endAt: '2026-11-20T00:00:00+09:00', ...overrides,
});
const body = (overrides: Record<string, unknown> = {}) => ({ advertiserName: '에버데이', title: '내부 메모 11월', banner: creative(), ...overrides });

describe('Ads HTTP contract', () => {
  let app: INestApplication;
  let fake: ReturnType<typeof createAdCampaignFakePrisma>;

  beforeEach(async () => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
    });
    fake = createAdCampaignFakePrisma({
      admins,
      assets: [{ id: 'asset-1', url: BANNER_URL, status: 'temporary', uploadedByAdminUserId: 'admin-owner', noticeId: null, popupId: null, adCampaignId: null, attachedAt: null }],
    });
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [AdsAdminController, AdsPublicController],
      providers: [
        AdsAdminService,
        AdsPublicService,
        AdminContextService,
        { provide: PrismaService, useValue: fake.prisma },
        { provide: UploadsService, useValue: { removeStoredUrl: jest.fn() } },
        { provide: getLoggerToken(AdsAdminService.name), useValue: logger },
        { provide: getLoggerToken(AdsPublicService.name), useValue: logger },
      ],
    })
      .overrideGuard(V1AuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          const id = req.headers['x-test-user'];
          if (!id) return false;
          req.v1User = { id, email: null, accountStatus: 'active', onboardingStatus: 'completed' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createGlobalValidationPipe());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await app.close();
  });

  const asOwner = () => ({ 'x-test-user': 'user-owner' });
  const http = () => request(app.getHttpServer());

  it('runs a campaign from draft to published to counted to stopped over HTTP', async () => {
    const created = await http().post('/api/v1/admin/ad-campaigns').set(asOwner()).send(body()).expect(201);
    const id = created.body.data.campaign.id as string;
    expect(created.body.data.campaign).toMatchObject({ status: 'draft', version: 1, banner: { imageUrl: BANNER_URL, phase: null } });

    const beforePublish = await http().get('/api/v1/ads/active').expect(200);
    expect(beforePublish.body.data).toEqual({ banner: null, popup: null });

    const published = await http().post(`/api/v1/admin/ad-campaigns/${id}/publish`).set(asOwner()).send({ expectedVersion: 1 }).expect(201);
    expect(published.body.data.campaign).toMatchObject({ status: 'published', version: 2, banner: { phase: 'live' } });

    const active = await http().get('/api/v1/ads/active').expect(200);
    // The API leaves caching to nginx, which adds `no-store`; a header here would only conflict with it.
    expect(active.headers['cache-control']).toBeUndefined();
    expect(active.body.data).toEqual({
      banner: { campaignId: id, advertiserName: '에버데이', imageUrl: BANNER_URL, altText: '에버데이 신제품', linkUrl: '/tournaments/1' },
      popup: null,
    });
    expect(JSON.stringify(active.body)).not.toContain('내부 메모');

    const events = ['impression', 'impression', 'click'].map((type) => ({ campaignId: id, channel: 'banner', type }));
    const recorded = await http().post('/api/v1/ads/events').send({ events }).expect(204);
    expect(recorded.text).toBe('');

    const detail = await http().get(`/api/v1/admin/ad-campaigns/${id}`).set(asOwner()).expect(200);
    expect(detail.body.data.stats).toMatchObject({
      banner: { impressions: 2, clicks: 1 },
      popup: { impressions: 0, clicks: 0 },
      daily: [{ date: '2026-11-10', channel: 'banner', impressions: 2, clicks: 1 }],
    });

    const list = await http().get('/api/v1/admin/ad-campaigns?status=published').set(asOwner()).expect(200);
    expect(list.body.data.items).toEqual([expect.objectContaining({ id, stats: { banner: { impressions: 2, clicks: 1 }, popup: { impressions: 0, clicks: 0 } } })]);

    await http().post(`/api/v1/admin/ad-campaigns/${id}/stop`).set(asOwner()).expect(201);
    const afterStop = await http().get('/api/v1/ads/active').expect(200);
    expect(afterStop.body.data).toEqual({ banner: null, popup: null });
    await http().post('/api/v1/ads/events').send({ events }).expect(204);
    const finalDetail = await http().get(`/api/v1/admin/ad-campaigns/${id}`).set(asOwner()).expect(200);
    expect(finalDetail.body.data.stats.banner).toEqual({ impressions: 2, clicks: 1 });
  });

  it('publishes a popup only with a headline and serves its headline and description', async () => {
    const popup = (overrides: Record<string, unknown> = {}) => ({
      ...creative(), headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요', ...overrides,
    });
    const withoutHeadline = await http().post('/api/v1/admin/ad-campaigns').set(asOwner()).send(body({ banner: null, popup: popup({ headline: null }) })).expect(201);

    const refused = await http().post(`/api/v1/admin/ad-campaigns/${withoutHeadline.body.data.campaign.id}/publish`).set(asOwner()).send({ expectedVersion: 1 }).expect(400);
    expect(refused.body).toMatchObject({ code: 'AD_CHANNEL_INCOMPLETE', details: [{ channel: 'popup', missing: ['headline'] }] });
    expect((await http().get('/api/v1/ads/active').expect(200)).body.data.popup).toBeNull();

    const edited = await http().put(`/api/v1/admin/ad-campaigns/${withoutHeadline.body.data.campaign.id}`).set(asOwner())
      .send({ ...body({ banner: null, popup: popup() }), expectedVersion: 1 }).expect(200);
    await http().post(`/api/v1/admin/ad-campaigns/${edited.body.data.campaign.id}/publish`).set(asOwner()).send({ expectedVersion: 2 }).expect(201);

    const active = await http().get('/api/v1/ads/active').expect(200);
    expect(active.body.data).toEqual({
      banner: null,
      popup: {
        campaignId: edited.body.data.campaign.id, advertiserName: '에버데이', imageUrl: BANNER_URL, altText: '에버데이 신제품',
        headline: '에버데이 11월 이벤트', description: '신제품을 먼저 만나 보세요', linkUrl: '/tournaments/1',
      },
    });
  });

  it.each(['banner', 'popup'] as const)('refuses an array where %s belongs and leaves a published ad untouched', async (channel) => {
    const created = await http().post('/api/v1/admin/ad-campaigns').set(asOwner()).send(body({
      banner: channel === 'banner' ? creative() : null,
      popup: channel === 'popup' ? { ...creative(), headline: '제목' } : null,
    })).expect(201);
    const id = created.body.data.campaign.id as string;
    await http().post(`/api/v1/admin/ad-campaigns/${id}/publish`).set(asOwner()).send({ expectedVersion: 1 }).expect(201);

    for (const wrong of [[], [creative()]]) {
      const res = await http().put(`/api/v1/admin/ad-campaigns/${id}`).set(asOwner()).send({ ...body({ banner: null, popup: null }), [channel]: wrong, expectedVersion: 2 }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }

    const detail = await http().get(`/api/v1/admin/ad-campaigns/${id}`).set(asOwner()).expect(200);
    expect(detail.body.data.campaign).toMatchObject({ status: 'published', version: 2, [channel]: { imageUrl: BANNER_URL, phase: 'live' } });
    expect((await http().get('/api/v1/ads/active').expect(200)).body.data[channel]).not.toBeNull();
  });

  it('lets an ops admin through every admin route and turns down a caller the guard rejects', async () => {
    const ops = { 'x-test-user': 'user-ops' };
    const routes: Array<[string, string, object?]> = [
      ['get', '/api/v1/admin/ad-campaigns'],
      ['get', '/api/v1/admin/ad-campaigns/c1'],
      ['post', '/api/v1/admin/ad-campaigns', body()],
      ['put', '/api/v1/admin/ad-campaigns/c1', { ...body(), expectedVersion: 1 }],
      ['post', '/api/v1/admin/ad-campaigns/c1/publish', { expectedVersion: 1 }],
      ['post', '/api/v1/admin/ad-campaigns/c1/stop'],
    ];
    for (const [method, path, payload] of routes) {
      // 2026-11-11: ops 는 권한에서 막히지 않는다(없는 캠페인·남이 올린 이미지는 그 도메인 오류로 거절된다).
      const asOps = await (http() as never as Record<string, (p: string) => request.Test>)[method](path).set(ops).send(payload);
      // 권한 거절(403)도, 서버 오류(5xx)도 아니고 정규화된 오류 코드나 성공 응답이어야 한다.
      expect([method, path, asOps.status >= 500]).toEqual([method, path, false]);
      expect([method, path, asOps.status]).not.toEqual([method, path, 403]);
      expect([method, path, asOps.body.code]).not.toEqual([method, path, 'PERMISSION_DENIED']);
      if (asOps.status >= 400) expect([method, path, typeof asOps.body.code]).toEqual([method, path, 'string']);
      const anonymous = await (http() as never as Record<string, (p: string) => request.Test>)[method](path).send(payload);
      expect([method, path, anonymous.status]).toEqual([method, path, 403]);
    }
    expect((await http().get('/api/v1/admin/ad-campaigns').set(ops).expect(200)).body.data.items).toEqual([]);
  });

  it('rejects an unsafe payload with VALIDATION_ERROR before any service runs', async () => {
    const bad = [
      body({ banner: creative({ imageUrl: 'https://cdn.example.com/banner.png' }) }),
      body({ banner: creative({ linkUrl: 'javascript:alert(1)' }) }),
      body({ banner: creative({ startAt: '2026-11-09' }) }),
      body({ status: 'published' }),
    ];
    for (const payload of bad) {
      const res = await http().post('/api/v1/admin/ad-campaigns').set(asOwner()).send(payload).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(fake.state.campaigns).toHaveLength(0);
  });

  it('answers a stale editor with 409 and the stored version', async () => {
    const created = await http().post('/api/v1/admin/ad-campaigns').set(asOwner()).send(body()).expect(201);
    const id = created.body.data.campaign.id as string;

    const res = await http().put(`/api/v1/admin/ad-campaigns/${id}`).set(asOwner()).send({ ...body({ title: '늦은 저장' }), expectedVersion: 7 }).expect(409);

    expect(res.body).toMatchObject({ code: 'AD_CAMPAIGN_VERSION_CONFLICT', details: { currentVersion: 1 } });
  });

  it('accepts an events batch of 20 and rejects 21, empty and viewer-identifying payloads', async () => {
    const created = await http().post('/api/v1/admin/ad-campaigns').set(asOwner()).send(body()).expect(201);
    const id = created.body.data.campaign.id as string;
    await http().post(`/api/v1/admin/ad-campaigns/${id}/publish`).set(asOwner()).send({ expectedVersion: 1 }).expect(201);
    const event = { campaignId: id, channel: 'banner', type: 'impression' };

    await http().post('/api/v1/ads/events').send({ events: Array(20).fill(event) }).expect(204);
    await http().post('/api/v1/ads/events').send({ events: Array(21).fill(event) }).expect(400);
    await http().post('/api/v1/ads/events').send({ events: [] }).expect(400);
    await http().post('/api/v1/ads/events').send({ events: [{ ...event, userId: 'u-1' }] }).expect(400);

    expect(fake.state.stats).toHaveLength(1);
    expect(fake.state.stats[0]).toMatchObject({ impressions: 20, clicks: 0 });
    expect(Object.keys(fake.state.stats[0]).sort()).toEqual(['campaignId', 'channel', 'clicks', 'createdAt', 'id', 'impressions', 'statDate', 'updatedAt']);
  });

  it('declares the event route throttled with 204', () => {
    const events = AdsPublicController.prototype.events;
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, events)).toBe(204);
    expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, events)).toBe(30);
    expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, events)).toBe(60_000);
  });
});
