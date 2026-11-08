import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackAdClick, trackAdImpression } from '@/lib/ad-events';
import { reportClientError } from '@/lib/client-error-reporter';
import { v1Keys } from '@/lib/query-keys';
import { createV1PublicBannerAdFixture } from '@/test/msw/ads-fixtures';
import { createV1AdsMswHandlers } from '@/test/msw/ads-handlers';
import type { V1ActiveAds } from '@/types/ads';
import { HomeAdBanner } from './home-ad-banner';

vi.mock('@/lib/ad-events', () => ({ trackAdClick: vi.fn(), trackAdImpression: vi.fn() }));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const server = setupServer(...createV1AdsMswHandlers('none'));
const activeAdsUrl = '*/api/v1/ads/active';

/** jsdom has no layout; the test decides what the observer reports and the hook's own timing runs for real. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.add(element);
  }

  unobserve(element: Element) {
    this.observed.delete(element);
  }

  disconnect() {
    this.observed.clear();
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  report(ratio: number) {
    const [target] = [...this.observed];
    this.callback(
      [{ target, intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function serveActiveAds(data: V1ActiveAds) {
  server.use(http.get(activeAdsUrl, () => HttpResponse.json({
    status: 'success',
    data,
    timestamp: '2026-11-08T00:00:00.000Z',
  })));
}

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <HomeAdBanner />
    </QueryClientProvider>,
  );
  return { queryClient, ...view };
}

async function settledActiveAds(queryClient: QueryClient) {
  await waitFor(() => expect(queryClient.getQueryState(v1Keys.activeAds())?.fetchStatus).toBe('idle'));
  await waitFor(() => expect(queryClient.getQueryState(v1Keys.activeAds())?.status).not.toBe('pending'));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('HomeAdBanner', () => {
  it('renders nothing when no banner is live', async () => {
    const { queryClient, container } = renderBanner();
    await settledActiveAds(queryClient);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the ads request fails', async () => {
    server.use(http.get(activeAdsUrl, () => HttpResponse.json(
      { status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: '서버 오류', timestamp: '2026-11-08T00:00:00.000Z' },
      { status: 500 },
    )));
    const { queryClient, container } = renderBanner();
    await waitFor(() => expect(queryClient.getQueryState(v1Keys.activeAds())?.status).toBe('error'));

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the creative with its alt text, the 광고 marker and the link target', async () => {
    server.use(...createV1AdsMswHandlers('banner'));
    renderBanner();

    const link = await screen.findByRole('link', { name: /에버데이 신제품 풋살화/ });
    expect(link).toHaveAttribute('href', '/tournaments/tournament-1');
    expect(within(link).getByText('광고')).toBeVisible();
    const image = within(link).getByRole('img', { name: '에버데이 신제품 풋살화' });
    expect(image).toHaveAttribute('loading', 'eager');
    expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain('/uploads/ads/banner.webp');
  });

  it('opens an external link in a new tab without leaking the opener', async () => {
    serveActiveAds({
      banner: createV1PublicBannerAdFixture({ linkUrl: 'https://everyday.example.com/event' }),
      popup: null,
    });
    renderBanner();

    const link = await screen.findByRole('link', { name: /에버데이 신제품 풋살화/ });
    expect(link).toHaveAttribute('href', 'https://everyday.example.com/event');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')?.split(' ').sort()).toEqual(['noopener', 'noreferrer']);
  });

  it('keeps an in-app link in the same tab', async () => {
    server.use(...createV1AdsMswHandlers('banner'));
    renderBanner();

    const link = await screen.findByRole('link', { name: /에버데이 신제품 풋살화/ });
    expect(link).not.toHaveAttribute('target');
  });

  it.each(['javascript:alert(1)', 'http://everyday.example.com/event', '//evil.example.com', 'data:text/html,x'])(
    'renders nothing and records a warning when the stored link is not safe (%s)',
    async (linkUrl) => {
      serveActiveAds({ banner: createV1PublicBannerAdFixture({ linkUrl }), popup: null });
      const { queryClient, container } = renderBanner();
      await settledActiveAds(queryClient);

      expect(container).toBeEmptyDOMElement();
      expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({
        level: 'warn',
        context: expect.objectContaining({ campaignId: createV1PublicBannerAdFixture().campaignId }),
      }));
    },
  );

  it('hides the ad and records the failure when the image cannot load, without a replacement image', async () => {
    server.use(...createV1AdsMswHandlers('banner'));
    const { container } = renderBanner();
    const image = await screen.findByRole('img', { name: '에버데이 신제품 풋살화' });

    fireEvent.error(image);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(reportClientError).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        campaignId: createV1PublicBannerAdFixture().campaignId,
        channel: 'banner',
        imageUrl: '/uploads/ads/banner.webp',
      }),
    }));
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it('measures the impression only after the image loaded and stayed half visible for a second', async () => {
    server.use(...createV1AdsMswHandlers('banner'));
    renderBanner();
    const image = await screen.findByRole('img', { name: '에버데이 신제품 풋살화' });

    // Rendered but not loaded: nothing is observed, so scrolling past cannot count.
    expect(FakeIntersectionObserver.instances).toHaveLength(0);

    vi.useFakeTimers();
    fireEvent.load(image);
    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const [observer] = FakeIntersectionObserver.instances;
    expect([...observer.observed]).toEqual([screen.getByRole('link')]);

    act(() => observer.report(0.6));
    act(() => { vi.advanceTimersByTime(999); });
    expect(trackAdImpression).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(trackAdImpression).toHaveBeenCalledExactlyOnceWith(createV1PublicBannerAdFixture().campaignId, 'banner');
  });

  it('counts the click before the navigation it triggers', async () => {
    server.use(...createV1AdsMswHandlers('banner'));
    renderBanner();
    const link = await screen.findByRole('link', { name: /에버데이 신제품 풋살화/ });
    link.addEventListener('click', (event) => event.preventDefault());

    fireEvent.click(link);

    expect(trackAdClick).toHaveBeenCalledExactlyOnceWith(createV1PublicBannerAdFixture().campaignId, 'banner');
    expect(trackAdImpression).not.toHaveBeenCalled();
  });

  it('counts a middle-click that opens the link in a new tab', async () => {
    server.use(...createV1AdsMswHandlers('banner'));
    renderBanner();
    const link = await screen.findByRole('link', { name: /에버데이 신제품 풋살화/ });

    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 2 }));

    expect(trackAdClick).toHaveBeenCalledExactlyOnceWith(createV1PublicBannerAdFixture().campaignId, 'banner');
  });
});
