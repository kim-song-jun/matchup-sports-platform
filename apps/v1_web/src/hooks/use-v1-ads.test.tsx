import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { reportClientError } from '@/lib/client-error-reporter';
import type { V1AdVersionConflictDetails, V1SaveAdCampaignPayload } from '@/types/ads';
import {
  AD_FIXTURE_BANNER_CAMPAIGN_ID,
  createV1AdCampaignFixture,
} from '@/test/msw/ads-fixtures';
import { createV1AdsMswHandlers } from '@/test/msw/ads-handlers';
import {
  useV1ActiveAds,
  useV1AdminAdCampaign,
  useV1AdminAdCampaigns,
  useV1CreateAdCampaign,
  useV1PublishAdCampaign,
  useV1StopAdCampaign,
  useV1UpdateAdCampaign,
} from './use-v1-ads';

vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const server = setupServer(...createV1AdsMswHandlers('both'));
const api = '*/api/v1';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
  return { wrapper, queryClient };
}

/** Records request bodies and falls through to the stateful handlers, so the real responses still apply. */
function captureJsonBodies(method: 'put' | 'post', path: string) {
  const bodies: unknown[] = [];
  server.use(http[method](`${api}${path}`, async ({ request }) => {
    bodies.push(await request.clone().json());
  }));
  return bodies;
}

function countCalls(path: string) {
  const counter = { calls: 0 };
  server.use(http.get(`${api}${path}`, () => {
    counter.calls += 1;
  }));
  return counter;
}

const savePayload: V1SaveAdCampaignPayload = {
  advertiserName: '에버데이',
  title: '11월 에버데이 협업 (수정)',
  banner: {
    imageUrl: '/uploads/ads/banner.webp',
    altText: '에버데이 신제품 풋살화',
    linkUrl: '/tournaments/tournament-1',
    startAt: '2026-11-12T00:00:00+09:00',
    endAt: '2026-11-20T00:00:00+09:00',
  },
  popup: null,
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.use(...createV1AdsMswHandlers('both'));
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('useV1ActiveAds', () => {
  it('serves the banner and the popup without a session', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1ActiveAds(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.banner?.altText).toBe('에버데이 신제품 풋살화');
    expect(result.current.data?.popup).toMatchObject({ headline: '11월 협업 이벤트', description: null });
  });

  it('resolves with neither creative when no ad is live', async () => {
    server.use(...createV1AdsMswHandlers('none'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1ActiveAds(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ banner: null, popup: null });
  });

  it('fails as a query error instead of throwing, and leaves a record for operators', async () => {
    server.use(http.get(`${api}/ads/active`, () => new Response(
      JSON.stringify({ status: 'error', statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: '잠시 후 다시 시도해 주세요.', timestamp: 'now' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1ActiveAds(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(vi.mocked(reportClientError)).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ path: '/ads/active', statusCode: 503 }) }),
    );
  });
});

describe('admin ad campaign reads', () => {
  it('lists campaigns with the status summary and scopes the list by status', async () => {
    server.use(...createV1AdsMswHandlers('none', [
      createV1AdCampaignFixture({ id: 'draft-1', title: '초안 캠페인', status: 'draft' }),
      createV1AdCampaignFixture({ id: 'live-1', title: '게시 캠페인', status: 'published', version: 2 }),
    ]));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1AdminAdCampaigns({ status: 'published' }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.map((item) => item.id)).toEqual(['live-1']);
    expect(result.current.data?.items[0].stats.banner).toEqual({ impressions: 150, clicks: 5 });
    expect(result.current.data?.summary).toEqual({ total: 2, byStatus: { draft: 1, published: 1, stopped: 0 } });
  });

  it('reads one campaign with its stats and stays idle without an id', async () => {
    const { wrapper } = createWrapper();
    const idle = renderHook(() => useV1AdminAdCampaign(''), { wrapper });
    expect(idle.result.current.fetchStatus).toBe('idle');

    const { result } = renderHook(() => useV1AdminAdCampaign(AD_FIXTURE_BANNER_CAMPAIGN_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.campaign.title).toBe('11월 에버데이 협업');
    expect(result.current.data?.stats.daily[0]).toEqual({ date: '2026-11-12', channel: 'banner', impressions: 100, clicks: 4 });
  });
});

describe('admin ad campaign writes', () => {
  it('creates a draft and refreshes the list', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => ({
      list: useV1AdminAdCampaigns(),
      create: useV1CreateAdCampaign(),
    }), { wrapper });
    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(1));

    await act(async () => {
      await result.current.create.mutateAsync({ advertiserName: '새 광고주', title: '새 캠페인' });
    });

    await waitFor(() => expect(result.current.list.data?.items).toHaveLength(2));
    expect(result.current.list.data?.items[0]).toMatchObject({ title: '새 캠페인', status: 'draft', version: 1 });
    expect(result.current.list.data?.summary.byStatus.draft).toBe(2);
  });

  it('sends the loaded version with the replacement, bumps it, and refreshes the detail', async () => {
    const bodies = captureJsonBodies('put', `/admin/ad-campaigns/${AD_FIXTURE_BANNER_CAMPAIGN_ID}`);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => ({
      detail: useV1AdminAdCampaign(AD_FIXTURE_BANNER_CAMPAIGN_ID),
      update: useV1UpdateAdCampaign(),
    }), { wrapper });
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));

    let saved;
    await act(async () => {
      saved = await result.current.update.mutateAsync({
        campaignId: AD_FIXTURE_BANNER_CAMPAIGN_ID,
        expectedVersion: result.current.detail.data!.campaign.version,
        body: savePayload,
      });
    });

    expect(bodies).toEqual([{ ...savePayload, expectedVersion: 1 }]);
    expect(saved).toMatchObject({ campaign: { version: 2, title: '11월 에버데이 협업 (수정)' } });
    await waitFor(() => expect(result.current.detail.data?.campaign.version).toBe(2));
  });

  it('rejects a stale version with the current one and refetches so the editor can reload', async () => {
    const detailReads = countCalls(`/admin/ad-campaigns/${AD_FIXTURE_BANNER_CAMPAIGN_ID}`);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => ({
      detail: useV1AdminAdCampaign(AD_FIXTURE_BANNER_CAMPAIGN_ID),
      update: useV1UpdateAdCampaign(),
    }), { wrapper });
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(detailReads.calls).toBe(1);

    let caught: unknown;
    await act(async () => {
      caught = await result.current.update.mutateAsync({
        campaignId: AD_FIXTURE_BANNER_CAMPAIGN_ID,
        expectedVersion: 7,
        body: savePayload,
      }).catch((error: unknown) => error);
    });

    expect(caught).toBeInstanceOf(V1ApiError);
    expect(caught).toMatchObject({ statusCode: 409, code: 'AD_CAMPAIGN_VERSION_CONFLICT' });
    expect((caught as V1ApiError).details as V1AdVersionConflictDetails).toEqual({ currentVersion: 1 });
    await waitFor(() => expect(detailReads.calls).toBe(2));
  });

  it('refuses to publish an incomplete draft with every missing field', async () => {
    server.use(...createV1AdsMswHandlers('none', [
      createV1AdCampaignFixture({
        banner: { imageUrl: '/uploads/ads/banner.webp', altText: null, linkUrl: null, startAt: null, endAt: null, phase: null },
      }),
    ]));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1PublishAdCampaign(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync({ campaignId: AD_FIXTURE_BANNER_CAMPAIGN_ID, expectedVersion: 1 })
        .catch((error: unknown) => error);
    });

    expect(caught).toMatchObject({ statusCode: 400, code: 'AD_CHANNEL_INCOMPLETE' });
    expect((caught as V1ApiError).details).toEqual([
      { code: 'AD_CHANNEL_INCOMPLETE', channel: 'banner', missing: ['altText', 'linkUrl', 'startAt', 'endAt'] },
    ]);
  });

  it('publishes then stops, refreshing the list and the public ad each time', async () => {
    const bodies = captureJsonBodies('post', `/admin/ad-campaigns/${AD_FIXTURE_BANNER_CAMPAIGN_ID}/publish`);
    const activeReads = countCalls('/ads/active');
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => ({
      list: useV1AdminAdCampaigns(),
      active: useV1ActiveAds(),
      publish: useV1PublishAdCampaign(),
      stop: useV1StopAdCampaign(),
    }), { wrapper });
    await waitFor(() => expect(result.current.list.data?.items[0].status).toBe('draft'));
    await waitFor(() => expect(result.current.active.isSuccess).toBe(true));
    expect(activeReads.calls).toBe(1);

    await act(async () => {
      await result.current.publish.mutateAsync({ campaignId: AD_FIXTURE_BANNER_CAMPAIGN_ID, expectedVersion: 1 });
    });
    expect(bodies).toEqual([{ expectedVersion: 1 }]);
    await waitFor(() => expect(result.current.list.data?.items[0]).toMatchObject({ status: 'published', version: 2 }));
    await waitFor(() => expect(activeReads.calls).toBe(2));

    await act(async () => {
      await result.current.stop.mutateAsync(AD_FIXTURE_BANNER_CAMPAIGN_ID);
    });
    await waitFor(() => expect(result.current.list.data?.items[0]).toMatchObject({ status: 'stopped', version: 3 }));
    await waitFor(() => expect(activeReads.calls).toBe(3));
  });

  it('reports a stop on a campaign that is not published as an invalid state', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useV1StopAdCampaign(), { wrapper });

    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync(AD_FIXTURE_BANNER_CAMPAIGN_ID).catch((error: unknown) => error);
    });

    expect(caught).toMatchObject({ statusCode: 409, code: 'AD_CAMPAIGN_INVALID_STATE' });
  });
});
