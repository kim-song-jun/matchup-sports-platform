/**
 * global-popup.test.tsx
 *
 * 이 컴포넌트의 계약은 "지금 보고 있는 경로를 서버에 넘긴다" 하나다. 경로를 안 넘기면
 * PopupsService.findActive 가 화면 단위(targetScreens) 폴백만 타서 — 예컨대 대회 팝업이
 * 여러 개 걸린 상태에서 — 어느 대회를 보든 findFirst 가 고른 팝업 하나가 뜬다.
 * 아래 테스트는 (a) path 가 실제로 요청에 실리는지 (b) 경로가 바뀌면 캐시를 재사용하지 않는지
 * (c) 백엔드 DTO 가 거부할 경로는 아예 안 싣는지를 고정한다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalPopup } from './global-popup';

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn<() => string>() }));

vi.mock('next/navigation', () => ({ usePathname: pathnameMock }));

const requestedUrls: URL[] = [];

/** 대회 화면에 걸린 팝업 2개 — 하나는 화면 단위, 하나는 정확 경로 단위. */
const SCREEN_POPUP = { popupId: 'screen-popup', title: '대회 화면 공통 팝업' };
const EXACT_POPUP = { popupId: 'exact-popup', title: '대회 1 전용 팝업' };
const OTHER_EXACT_POPUP = { popupId: 'other-exact-popup', title: '대회 2 전용 팝업' };
const EXACT_BY_PATH: Record<string, { popupId: string; title: string }> = {
  '/tournaments/tournament-1': EXACT_POPUP,
  '/tournaments/tournament-2': OTHER_EXACT_POPUP,
};

const server = setupServer(
  http.get('*/api/v1/popups/active', ({ request }) => {
    const url = new URL(request.url);
    requestedUrls.push(url);
    const path = url.searchParams.get('path');
    const row = (path ? EXACT_BY_PATH[path] : undefined) ?? SCREEN_POPUP;
    return HttpResponse.json({
      status: 'success',
      data: {
        popup: {
          popupId: row.popupId,
          title: row.title,
          body: '본문',
          content: null,
          contentVersion: 1,
          targetScreens: ['tournaments'],
          targetPaths: path ? [path] : [],
          linkUrl: null,
          linkLabel: null,
          publishedAt: '2026-05-18T00:00:00.000Z',
        },
      },
      timestamp: '2026-05-18T00:00:00.000Z',
    });
  }),
);

function createClient() {
  // staleTime 은 Providers(app/providers.tsx)와 같은 값 — 실제 앱에서 30초 안에 다른 대회로
  // 이동하면 캐시가 fresh 라 재요청이 없다. 쿼리 키에 경로가 빠지면 그때 앞 대회 팝업이 그대로 뜬다.
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
}

function renderAt(pathname: string, client = createClient()) {
  pathnameMock.mockReturnValue(pathname);
  return render(
    <QueryClientProvider client={client}>
      <GlobalPopup />
    </QueryClientProvider>,
  );
}

describe('GlobalPopup', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    requestedUrls.length = 0;
    window.localStorage.clear();
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.resetHandlers();
    server.close();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('현재 경로를 넘겨 그 경로 전용 팝업을 띄운다', async () => {
    renderAt('/tournaments/tournament-1');

    expect(await screen.findByText('대회 1 전용 팝업')).toBeInTheDocument();
    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0].searchParams.get('screen')).toBe('tournaments');
    expect(requestedUrls[0].searchParams.get('path')).toBe('/tournaments/tournament-1');
  });

  it('경로가 다르면 앞 경로의 응답을 재사용하지 않는다', async () => {
    // 캐시를 공유하는 같은 QueryClient 로 두 번 그린다 — 쿼리 키에 경로가 빠져 있으면
    // 두 번째 경로가 첫 응답을 그대로 재사용하고 요청조차 나가지 않는다.
    const client = createClient();
    const first = renderAt('/tournaments/tournament-1', client);
    expect(await screen.findByText('대회 1 전용 팝업')).toBeInTheDocument();
    first.unmount();

    renderAt('/tournaments/tournament-2', client);

    expect(await screen.findByText('대회 2 전용 팝업')).toBeInTheDocument();
    expect(requestedUrls.map((url) => url.searchParams.get('path'))).toEqual([
      '/tournaments/tournament-1',
      '/tournaments/tournament-2',
    ]);
  });

  it('백엔드 DTO 가 거부할 경로는 싣지 않는다', async () => {
    renderAt(`/tournaments/${'a'.repeat(600)}`);

    expect(await screen.findByText('대회 화면 공통 팝업')).toBeInTheDocument();
    expect(requestedUrls[0].searchParams.has('path')).toBe(false);
  });

  it('팝업 대상 화면이 아니면 요청 자체를 하지 않는다', async () => {
    renderAt('/admin/popups');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestedUrls).toHaveLength(0);
  });
});
