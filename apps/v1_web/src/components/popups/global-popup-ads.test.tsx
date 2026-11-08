/**
 * The home ad popup rides on GlobalPopup so that it can see the notice step. The contract tested here:
 * the ad shows on exactly `/home`, only when the notice lookup has finished and no notice is shown, and
 * never in the same visit as a notice, a failed notice lookup, or a notice the user has just dismissed.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHomePopupStorageKey } from '@/components/home/home-notice-popup';
import { waitForOverlayHistory } from '@/lib/overlay-history';
import { v1Keys } from '@/lib/query-keys';
import { createV1PublicPopupAdFixture } from '@/test/msw/ads-fixtures';
import { GlobalPopup } from './global-popup';

const { pathnameMock, searchMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn<() => string>(),
  searchMock: vi.fn<() => URLSearchParams>(() => new URLSearchParams()),
}));

vi.mock('next/navigation', () => ({ usePathname: pathnameMock, useSearchParams: searchMock }));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/ad-events', () => ({ trackAdClick: vi.fn(), trackAdImpression: vi.fn() }));

const timestamp = '2026-11-08T00:00:00.000Z';
const ad = createV1PublicPopupAdFixture({ campaignId: 'campaign-a', headline: '이번 주말, 새 축구화 20% 할인' });
const NOTICE = {
  popupId: 'notice-1',
  title: '서비스 이용 안내',
  body: '이번 주 경기장 이용 시간을 확인해 주세요.',
  content: null,
  contentVersion: 1,
  targetScreens: ['home'],
  targetPaths: [],
  linkUrl: null,
  linkLabel: null,
  publishedAt: '2026-11-01T00:00:00.000Z',
};

const calls = { notices: 0, ads: 0 };
const server = setupServer();

interface Backend {
  notice?: typeof NOTICE | null;
  noticeStatus?: number;
  /** Holds `GET /popups/active` until the test releases it, to look at the moment while the notice is loading. */
  noticeGate?: Promise<void>;
}

function serve({ notice = null, noticeStatus = 200, noticeGate }: Backend = {}) {
  calls.notices = 0;
  calls.ads = 0;
  server.use(
    http.get('*/api/v1/popups/active', async () => {
      calls.notices += 1;
      await noticeGate;
      return noticeStatus === 200
        ? HttpResponse.json({ status: 'success', data: { popup: notice }, timestamp })
        : HttpResponse.json({ status: 'error', statusCode: noticeStatus, code: 'INTERNAL_ERROR', message: '오류', timestamp }, { status: noticeStatus });
    }),
    http.get('*/api/v1/ads/active', () => {
      calls.ads += 1;
      return HttpResponse.json({ status: 'success', data: { banner: null, popup: ad }, timestamp });
    }),
    http.get('*/api/v1/home', () => HttpResponse.json({ status: 'success', data: {}, timestamp })),
  );
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function tree(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <GlobalPopup />
    </QueryClientProvider>
  );
}

function renderAt(pathname: string, client = createClient()) {
  pathnameMock.mockReturnValue(pathname);
  const view = render(tree(client));
  return {
    ...view,
    rerenderAt(next: string = pathname) {
      pathnameMock.mockReturnValue(next);
      view.rerender(tree(client));
    },
  };
}

/**
 * Counts creative images the page inserted, even ones removed again in the next render. A creative that is
 * inserted starts downloading, so this catches an ad that "started" without ever being able to open.
 */
function watchCreativeRequests() {
  let inserted = 0;
  const tally = (records: MutationRecord[]) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof HTMLImageElement) inserted += 1;
    }
  };
  const observer = new MutationObserver(tally);
  observer.observe(document.body, { childList: true, subtree: true });
  return {
    inserted: () => {
      tally(observer.takeRecords());
      return inserted;
    },
    stop: () => observer.disconnect(),
  };
}

async function openAd() {
  const preloader = await waitFor(() => {
    const images = document.querySelectorAll('img');
    expect(images).toHaveLength(1);
    return images[0];
  });
  fireEvent.load(preloader);
  return screen.findByRole('dialog', { name: ad.headline ?? '' });
}

/** Waits until both lookups were asked and answered, then asserts the ad creative was never even fetched. */
async function expectNoAd({ asked = true } = {}) {
  if (asked) {
    await waitFor(() => {
      expect(calls.notices).toBeGreaterThan(0);
      expect(calls.ads).toBeGreaterThan(0);
    });
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(document.querySelectorAll('img')).toHaveLength(0);
  expect(screen.queryByRole('dialog', { name: ad.headline ?? '' })).not.toBeInTheDocument();
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  window.localStorage.clear();
  serve();
});

afterEach(async () => {
  cleanup();
  await waitForOverlayHistory();
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  searchMock.mockReturnValue(new URLSearchParams());
  document.body.replaceChildren();
});

describe('GlobalPopup home ad popup', () => {
  it('shows the ad on /home when there is no notice', async () => {
    renderAt('/home');

    expect(await openAd()).toBeInTheDocument();
  });

  it('shows only the notice while one is up, and does not follow it with the ad once it is closed', async () => {
    serve({ notice: NOTICE });
    renderAt('/home');

    expect(await screen.findByRole('dialog', { name: NOTICE.title })).toBeInTheDocument();
    await expectNoAd();

    await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await expectNoAd();
  });

  it('treats a notice the user hid for a week as no notice', async () => {
    window.localStorage.setItem(getHomePopupStorageKey(NOTICE.popupId), String(Date.now() + 24 * 60 * 60 * 1000));
    serve({ notice: NOTICE });
    renderAt('/home');

    expect(await openAd()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: NOTICE.title })).not.toBeInTheDocument();
  });

  it('does not follow a notice the user has just hidden for a week with the ad, even when the screen re-renders', async () => {
    serve({ notice: NOTICE });
    const view = renderAt('/home');
    await screen.findByRole('dialog', { name: NOTICE.title });

    await userEvent.setup().click(screen.getByRole('button', { name: '일주일 안 보기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    view.rerenderAt();

    await expectNoAd();
  });

  it('waits for the notice lookup to finish before deciding', async () => {
    let releaseNotice: () => void = () => {};
    serve({ noticeGate: new Promise<void>((resolve) => { releaseNotice = resolve; }) });
    renderAt('/home');
    await expectNoAd({ asked: false });
    await waitFor(() => expect(calls.notices).toBeGreaterThan(0));

    releaseNotice();

    expect(await openAd()).toBeInTheDocument();
  });

  it('does not read a failed notice lookup as "no notice", this visit or when the screen re-renders', async () => {
    serve({ noticeStatus: 500 });
    const creatives = watchCreativeRequests();
    const view = renderAt('/home');
    await expectNoAd();

    view.rerenderAt();
    await expectNoAd();
    expect(creatives.inserted()).toBe(0);
    creatives.stop();
  });

  it('does not trust a cached "no notice" while the fresh lookup is still on its way', async () => {
    let releaseNotice: () => void = () => {};
    serve({ notice: NOTICE, noticeGate: new Promise<void>((resolve) => { releaseNotice = resolve; }) });
    const client = createClient();
    // Stale since the epoch, so mounting refetches it; the old answer says there is no notice.
    client.setQueryData(v1Keys.activePopup('home', '/home'), { popup: null }, { updatedAt: 0 });
    const creatives = watchCreativeRequests();
    renderAt('/home', client);
    await waitFor(() => {
      expect(calls.notices).toBeGreaterThan(0);
      expect(calls.ads).toBeGreaterThan(0);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    releaseNotice();

    expect(await screen.findByRole('dialog', { name: NOTICE.title })).toBeInTheDocument();
    await expectNoAd();
    expect(creatives.inserted()).toBe(0);
    creatives.stop();
  });

  it.each(['/matches', '/tournaments/tournament-1', '/my'])('stays out of %s', async (pathname) => {
    renderAt(pathname);

    await waitFor(() => expect(calls.notices).toBeGreaterThan(0));
    await expectNoAd({ asked: false });
    expect(calls.ads).toBe(0);
  });

  it('closes an open ad when the user leaves /home', async () => {
    const view = renderAt('/home');
    await openAd();

    view.rerenderAt('/matches');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: ad.headline ?? '' })).not.toBeInTheDocument());
  });
});
