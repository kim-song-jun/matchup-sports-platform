/**
 * The ad popup is code-split: routes other than `/home` must never load its module. The first test must stay
 * first — the module registry is shared inside one test file, so once `/home` has loaded it the check is moot.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForOverlayHistory } from '@/lib/overlay-history';
import { createV1PublicPopupAdFixture } from '@/test/msw/ads-fixtures';
import { GlobalPopup } from './global-popup';

const { pathnameMock, adPopupModuleEvaluated } = vi.hoisted(() => ({
  pathnameMock: vi.fn<() => string>(),
  adPopupModuleEvaluated: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: pathnameMock, useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/ad-events', () => ({ trackAdClick: vi.fn(), trackAdImpression: vi.fn() }));
vi.mock('@/components/ads/home-ad-popup', async (importOriginal) => {
  adPopupModuleEvaluated();
  return importOriginal();
});

const timestamp = '2026-11-08T00:00:00.000Z';
const ad = createV1PublicPopupAdFixture({ campaignId: 'campaign-a', headline: '이번 주말, 새 축구화 20% 할인' });
const server = setupServer(
  http.get('*/api/v1/popups/active', () => HttpResponse.json({ status: 'success', data: { popup: null }, timestamp })),
  http.get('*/api/v1/ads/active', () => HttpResponse.json({ status: 'success', data: { banner: null, popup: ad }, timestamp })),
  http.get('*/api/v1/home', () => HttpResponse.json({ status: 'success', data: {}, timestamp })),
);

function renderAt(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  return render(<QueryClientProvider client={client}><GlobalPopup /></QueryClientProvider>);
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  window.localStorage.clear();
});
afterEach(async () => {
  cleanup();
  await waitForOverlayHistory();
  vi.unstubAllEnvs();
});

describe('GlobalPopup code splitting', () => {
  it('does not load the ad popup module on a route other than /home', async () => {
    renderAt('/matches');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(adPopupModuleEvaluated).not.toHaveBeenCalled();
  });

  it('loads the ad popup module on /home, where it starts fetching the creative', async () => {
    renderAt('/home');

    await vi.waitFor(() => expect(adPopupModuleEvaluated).toHaveBeenCalled());
    await vi.waitFor(() => expect(document.querySelector('img[hidden]')).not.toBeNull());
  });
});
