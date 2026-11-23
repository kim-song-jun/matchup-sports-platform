import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarFeed } from '@/hooks/use-calendar-feed';
import { CalendarConnectButton } from './calendar-connect-sheet';

const api = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api-client')>()), ...api }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/schedule',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const connectedFeed: CalendarFeed = {
  connected: true,
  feedUrl: 'https://teameet.co.kr/api/v1/calendar/feed/abc.sig.ics',
  webcalUrl: 'webcal://teameet.co.kr/api/v1/calendar/feed/abc.sig.ics',
  createdAt: '2026-11-23T00:00:00.000Z',
};

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><CalendarConnectButton /></QueryClientProvider>);
}

describe('내 일정 — 캘린더 연결', () => {
  beforeEach(() => {
    api.v1Get.mockReset();
    api.v1Post.mockReset();
  });
  afterEach(cleanup);

  it('시트를 열기 전에는 서버를 부르지 않는다', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /캘린더 연결/ })).toBeInTheDocument();
    expect(api.v1Get).not.toHaveBeenCalled();
  });

  it('연결 전: 주소 만들기를 누르면 연결돼 주소·폰 캘린더 열기·복사가 나온다', async () => {
    api.v1Get.mockResolvedValue({ connected: false, feedUrl: null, webcalUrl: null, createdAt: null });
    api.v1Post.mockResolvedValue(connectedFeed);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /캘린더 연결/ }));
    fireEvent.click(await screen.findByRole('button', { name: '캘린더 주소 만들기' }));

    const open = await screen.findByRole('link', { name: '폰 캘린더에서 열기' });
    expect(open).toHaveAttribute('href', connectedFeed.webcalUrl);
    expect(api.v1Post).toHaveBeenCalledWith('/me/calendar-feed');
    expect(screen.getByLabelText('캘린더 구독 주소')).toHaveValue(connectedFeed.feedUrl);
    expect(screen.getByText(/불참을 누른 일정은 들어오지 않아요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '주소 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(connectedFeed.feedUrl));
    expect(await screen.findByRole('button', { name: '복사했어요' })).toBeInTheDocument();
  });

  it('이미 연결돼 있으면 바로 주소가 보이고, 다시 만들기는 확인을 거친 뒤에만 새 주소를 받는다', async () => {
    api.v1Get.mockResolvedValue(connectedFeed);
    const next = { ...connectedFeed, feedUrl: 'https://teameet.co.kr/api/v1/calendar/feed/new.sig.ics', webcalUrl: 'webcal://teameet.co.kr/api/v1/calendar/feed/new.sig.ics' };
    api.v1Post.mockResolvedValue(next);
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /캘린더 연결/ }));
    expect(await screen.findByLabelText('캘린더 구독 주소')).toHaveValue(connectedFeed.feedUrl);

    fireEvent.click(screen.getByRole('button', { name: '주소 다시 만들기' }));
    expect(await screen.findByText('주소를 다시 만들까요?')).toBeInTheDocument();
    expect(api.v1Post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));
    await waitFor(() => expect(api.v1Post).toHaveBeenCalledWith('/me/calendar-feed/regenerate'));
    await waitFor(() => expect(screen.getByLabelText('캘린더 구독 주소')).toHaveValue(next.feedUrl));
  });

  it('조회가 실패하면 안내를 보이고 주소 만들기를 막는다', async () => {
    api.v1Get.mockRejectedValue(new Error('boom'));
    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /캘린더 연결/ }));
    expect(await screen.findByText(/캘린더 주소를 가져오지 못했어요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '캘린더 주소 만들기' })).toBeDisabled();
  });
});
