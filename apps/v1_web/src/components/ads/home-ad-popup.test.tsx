import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackAdImpression } from '@/lib/ad-events';
import { isPopupSuppressed, suppressPopupForToday } from '@/lib/ad-suppression';
import { optimizedImageSrc } from '@/lib/assets';
import { reportClientError } from '@/lib/client-error-reporter';
import { v1Keys } from '@/lib/query-keys';
import { waitForOverlayHistory } from '@/lib/overlay-history';
import { createV1ActiveAdsFixture, createV1PublicPopupAdFixture } from '@/test/msw/ads-fixtures';
import type { V1ActiveAds, V1PublicPopupAd } from '@/types/ads';
import { HomeAdPopup } from './home-ad-popup';

vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/ad-events', () => ({ trackAdClick: vi.fn(), trackAdImpression: vi.fn() }));

const reportMock = vi.mocked(reportClientError);
const timestamp = '2026-11-08T00:00:00.000Z';

const campaign: V1PublicPopupAd = createV1PublicPopupAdFixture({
  campaignId: 'campaign-a',
  headline: '이번 주말, 새 축구화 20% 할인',
  description: '팀밋 회원에게만 드리는 할인이에요.',
});

const server = setupServer();

const calls = { ads: 0, home: 0 };

interface Backend {
  popup?: V1PublicPopupAd | null;
  adsStatus?: number;
  homeStatus?: number;
  /** Holds `GET /home` until the test releases it, to look at the moment before the home screen is ready. */
  homeGate?: Promise<void>;
}

function serve({ popup = campaign, adsStatus = 200, homeStatus = 200, homeGate }: Backend = {}) {
  calls.ads = 0;
  calls.home = 0;
  const activeAds: V1ActiveAds = { ...createV1ActiveAdsFixture('none'), popup };
  server.use(
    http.get('*/api/v1/ads/active', () => {
      calls.ads += 1;
      return adsStatus === 200
        ? HttpResponse.json({ status: 'success', data: activeAds, timestamp })
        : HttpResponse.json({ status: 'error', statusCode: adsStatus, code: 'INTERNAL_ERROR', message: '오류', timestamp }, { status: adsStatus });
    }),
    http.get('*/api/v1/home', async () => {
      calls.home += 1;
      await homeGate;
      return homeStatus === 200
        ? HttpResponse.json({ status: 'success', data: {}, timestamp })
        : HttpResponse.json({ status: 'error', statusCode: homeStatus, code: 'INTERNAL_ERROR', message: '오류', timestamp }, { status: homeStatus });
    }),
  );
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function tree(client: QueryClient, noticeAllowsAd: boolean) {
  return (
    <QueryClientProvider client={client}>
      <HomeAdPopup noticeAllowsAd={noticeAllowsAd} />
    </QueryClientProvider>
  );
}

function renderPopup({ noticeAllowsAd = true, client = createClient() } = {}) {
  const view = render(tree(client, noticeAllowsAd));
  return { ...view, client, setNoticeAllowsAd: (next: boolean) => view.rerender(tree(client, next)) };
}

/** The hidden element that fetches the creative before any window is shown. */
async function findPreloader(): Promise<HTMLImageElement> {
  return waitFor(() => {
    const images = document.querySelectorAll('img');
    expect(images).toHaveLength(1);
    return images[0];
  });
}

async function openPopup() {
  fireEvent.load(await findPreloader());
  return screen.findByRole('dialog', { name: campaign.headline ?? '' });
}

/** Lets the queries answer and React render, then asserts that no creative was fetched and no window opened. */
async function expectNothingShown() {
  await waitFor(() => {
    expect(calls.ads).toBeGreaterThan(0);
    expect(calls.home).toBeGreaterThan(0);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(document.querySelectorAll('img')).toHaveLength(0);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
  document.body.replaceChildren();
});

describe('HomeAdPopup opening', () => {
  it('opens once home is ready and the creative has arrived, and uses up the day at that moment', async () => {
    renderPopup();
    const preloader = await findPreloader();

    // Until the creative has arrived there is no window, and the day is not used up.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(isPopupSuppressed(campaign.campaignId)).toBe(false);

    fireEvent.load(preloader);

    expect(await screen.findByRole('dialog', { name: campaign.headline ?? '' })).toBeInTheDocument();
    expect(isPopupSuppressed(campaign.campaignId)).toBe(true);
  });

  it('does not open when another tab used up the day while this one was fetching the creative', async () => {
    renderPopup();
    const preloader = await findPreloader();

    // The other tab opened the same campaign after this tab chose it, and wrote the shared mark for today.
    suppressPopupForToday(campaign.campaignId);
    fireEvent.load(preloader);

    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trackAdImpression).not.toHaveBeenCalled();
  });

  it('fetches the creative at the size the window shows, so the window reuses the cached picture', async () => {
    renderPopup();
    const preloader = await findPreloader();
    const preloadedSrc = preloader.getAttribute('src');
    expect(preloadedSrc).toBe(optimizedImageSrc(campaign.imageUrl, 420));
    expect(preloadedSrc).toContain('/_next/image');

    fireEvent.load(preloader);

    const dialog = await screen.findByRole('dialog', { name: campaign.headline ?? '' });
    expect(within(dialog).getByRole('img', { name: campaign.altText })).toHaveAttribute('src', preloadedSrc);
  });

  it('stays closed while the notice step does not allow it, and opens as soon as it does', async () => {
    const view = renderPopup({ noticeAllowsAd: false });
    await expectNothingShown();

    view.setNoticeAllowsAd(true);

    await openPopup();
  });

  it('waits for the home screen to be ready', async () => {
    let releaseHome: () => void = () => {};
    serve({ homeGate: new Promise<void>((resolve) => { releaseHome = resolve; }) });
    renderPopup();
    await expectNothingShown();

    releaseHome();

    await openPopup();
  });

  it('stays closed when the home screen fails to load', async () => {
    serve({ homeStatus: 500 });
    renderPopup();

    await expectNothingShown();
  });

  it.each([
    ['there is no popup campaign', { popup: null }],
    ['the ads request fails', { adsStatus: 500 }],
  ] satisfies Array<[string, Backend]>)('stays closed when %s', async (_name, backend) => {
    serve(backend);
    renderPopup();

    await expectNothingShown();
  });

  it.each([
    ['an http link', 'http://everyday.example.com/event'],
    ['a javascript link', 'javascript:alert(1)'],
    ['a protocol-relative link', '//evil.example.com/event'],
  ])('does not even fetch the creative of a campaign with %s', async (_name, linkUrl) => {
    serve({ popup: { ...campaign, linkUrl } });
    renderPopup();

    await expectNothingShown();
  });

  it('shows a campaign at most once a day, per campaign', async () => {
    suppressPopupForToday('campaign-a');
    const first = renderPopup();
    await expectNothingShown();
    first.unmount();

    serve({ popup: { ...campaign, campaignId: 'campaign-b' } });
    renderPopup({ client: createClient() });

    await openPopup();
  });

  it('does not show again after a reload on the same day, even though the window was never closed', async () => {
    const first = renderPopup();
    await openPopup();
    first.unmount();
    await waitForOverlayHistory();

    renderPopup({ client: createClient() });

    await expectNothingShown();
  });
});

describe('HomeAdPopup yielding to other modals', () => {
  it.each([
    ['a role=dialog element', 'div', { role: 'dialog' }],
    ['a role=alertdialog element', 'div', { role: 'alertdialog' }],
    ['an open native <dialog> (the app update gate)', 'dialog', { open: '' }],
  ])('stays closed and keeps the day for %s', async (_name, tag, attributes) => {
    const other = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) other.setAttribute(name, value);
    document.body.append(other);
    const view = renderPopup();

    fireEvent.load(await findPreloader());

    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(0));
    expect(screen.queryByRole('dialog', { name: campaign.headline ?? '' })).not.toBeInTheDocument();
    expect(isPopupSuppressed(campaign.campaignId)).toBe(false);

    // Control: the same page without the other modal shows it.
    view.unmount();
    other.remove();
    renderPopup({ client: createClient() });
    await openPopup();
  });
});

describe('HomeAdPopup creative failure', () => {
  it('does not open for a creative that cannot be fetched, records it, and shows no stand-in image', async () => {
    renderPopup();

    fireEvent.error(await findPreloader());

    await waitFor(() => expect(reportMock).toHaveBeenCalledTimes(1));
    expect(reportMock.mock.calls[0][0]).toMatchObject({ context: { campaignId: campaign.campaignId } });
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A window nobody saw does not use up the day.
    expect(isPopupSuppressed(campaign.campaignId)).toBe(false);
  });

  it('closes and records a creative that fails after the window is already up', async () => {
    renderPopup();
    const dialog = await openPopup();

    fireEvent.error(within(dialog).getByRole('img', { name: campaign.altText }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock.mock.calls[0][0]).toMatchObject({ context: { campaignId: campaign.campaignId } });
  });
});

describe('HomeAdPopup once it is open', () => {
  it('stays closed for the rest of the visit after the user closes it', async () => {
    const user = userEvent.setup();
    const view = renderPopup();
    await openPopup();

    await user.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await act(async () => {
      await view.client.invalidateQueries({ queryKey: v1Keys.activeAds() });
    });

    await expectNothingShown();
  });

  it('is not closed by the campaign window ending while the user is looking at it', async () => {
    const view = renderPopup();
    await openPopup();

    act(() => {
      view.client.setQueryData<V1ActiveAds>(v1Keys.activeAds(), { banner: null, popup: null });
    });

    expect(screen.getByRole('dialog', { name: campaign.headline ?? '' })).toBeInTheDocument();
  });
});
