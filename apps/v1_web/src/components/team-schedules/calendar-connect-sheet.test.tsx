import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarFeed } from '@/hooks/use-calendar-feed';
import { CalendarConnectButton } from './calendar-connect-sheet';

const api = vi.hoisted(() => ({ v1Get: vi.fn(), v1Post: vi.fn() }));
const shell = vi.hoisted(() => ({ value: null as 'ios' | 'android' | null }));
vi.mock('@/lib/api-client', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/api-client')>()), ...api }));
vi.mock('@/lib/native-bridge', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/native-bridge')>()), detectNativeShell: () => shell.value }));
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
const notConnected: CalendarFeed = { connected: false, feedUrl: null, webcalUrl: null, createdAt: null };

function renderButton() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><CalendarConnectButton /></QueryClientProvider>);
}
const openSheet = () => fireEvent.click(screen.getByRole('button', { name: /캘린더 연결/ }));

describe('내 일정 — 캘린더 연결', () => {
  beforeEach(() => {
    api.v1Get.mockReset();
    api.v1Post.mockReset();
    shell.value = null;
  });
  afterEach(cleanup);

  it('시트를 열기 전에는 서버를 부르지 않는다', () => {
    renderButton();
    expect(screen.getByRole('button', { name: /캘린더 연결/ })).toBeInTheDocument();
    expect(api.v1Get).not.toHaveBeenCalled();
  });

  it('연결 전이어도 열자마자 주소를 만들어 버튼이 바로 나오고, 설명은 버튼 아래에 있다', async () => {
    api.v1Get.mockResolvedValue(notConnected);
    api.v1Post.mockResolvedValue(connectedFeed);
    renderButton();
    openSheet();

    const copy = await screen.findByRole('button', { name: '주소 복사' });
    expect(api.v1Post).toHaveBeenCalledTimes(1);
    expect(api.v1Post).toHaveBeenCalledWith('/me/calendar-feed');
    expect(screen.queryByRole('button', { name: '캘린더 주소 만들기' })).toBeNull();
    // 버튼 → 안내 → 주소 → 설명 순서(설명이 맨 위에서 버튼을 밀어내지 않는다).
    const description = screen.getByText(/팀 일정과 내 경기가 캘린더에 자동으로 들어와요/);
    expect(copy.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByLabelText('캘린더 구독 주소')).toHaveValue(connectedFeed.feedUrl);
  });

  it('아이폰(앱·브라우저): 「폰 캘린더에서 열기」(webcal)와 「주소 복사」', async () => {
    shell.value = 'ios';
    api.v1Get.mockResolvedValue(connectedFeed);
    renderButton();
    openSheet();
    expect(await screen.findByRole('link', { name: '폰 캘린더에서 열기' })).toHaveAttribute('href', connectedFeed.webcalUrl);
    expect(screen.queryByRole('link', { name: /^구글 캘린더에 추가/ })).toBeNull();
    expect(screen.getByRole('button', { name: '주소 복사' })).toBeInTheDocument();
    expect(screen.getByText(/아래로 당기면 바로 새로고침/)).toBeInTheDocument();
  });

  it('갤럭시(안드로이드 앱): 「구글 캘린더에 추가」와 「주소 복사」, 폰 캘린더 버튼은 없다', async () => {
    shell.value = 'android';
    api.v1Get.mockResolvedValue(connectedFeed);
    renderButton();
    openSheet();
    const google = await screen.findByRole('link', { name: /^구글 캘린더에 추가/ });
    expect(google).toHaveAttribute('href', `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(connectedFeed.webcalUrl!)}`);
    expect(google).toHaveAttribute('target', '_blank');
    // 새 창으로 열리는 링크라는 걸 스크린리더에도 알린다.
    expect(google).toHaveAccessibleName('구글 캘린더에 추가 (새 창으로 열려요)');
    expect(screen.queryByRole('link', { name: '폰 캘린더에서 열기' })).toBeNull();
    expect(screen.getByRole('button', { name: '주소 복사' })).toBeInTheDocument();
    expect(screen.getByText(/갤럭시 캘린더에도 보여요/)).toBeInTheDocument();
  });

  it('주소 복사: 클립보드에 구독 주소가 들어가고 「복사했어요」로 바뀐다', async () => {
    api.v1Get.mockResolvedValue(connectedFeed);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderButton();
    openSheet();
    fireEvent.click(await screen.findByRole('button', { name: '주소 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(connectedFeed.feedUrl));
    expect(await screen.findByRole('button', { name: '복사했어요' })).toBeInTheDocument();
  });

  it('다시 만들기는 확인을 거친 뒤에만 새 주소를 받는다', async () => {
    api.v1Get.mockResolvedValue(connectedFeed);
    const next = { ...connectedFeed, feedUrl: 'https://teameet.co.kr/api/v1/calendar/feed/new.sig.ics', webcalUrl: 'webcal://teameet.co.kr/api/v1/calendar/feed/new.sig.ics' };
    api.v1Post.mockResolvedValue(next);
    renderButton();
    openSheet();
    expect(await screen.findByLabelText('캘린더 구독 주소')).toHaveValue(connectedFeed.feedUrl);
    expect(api.v1Post).not.toHaveBeenCalled(); // 이미 연결돼 있으면 만들지 않는다

    fireEvent.click(screen.getByRole('button', { name: '주소 다시 만들기' }));
    expect(await screen.findByText('주소를 다시 만들까요?')).toBeInTheDocument();
    expect(api.v1Post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '다시 만들기' }));
    await waitFor(() => expect(api.v1Post).toHaveBeenCalledWith('/me/calendar-feed/regenerate'));
    await waitFor(() => expect(screen.getByLabelText('캘린더 구독 주소')).toHaveValue(next.feedUrl));
  });

  it('주소를 못 가져오면 안내와 「다시 시도」를 보인다', async () => {
    api.v1Get.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(connectedFeed);
    renderButton();
    openSheet();
    expect(await screen.findByText(/캘린더 주소를 가져오지 못했어요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('button', { name: '주소 복사' })).toBeInTheDocument();
  });
});
