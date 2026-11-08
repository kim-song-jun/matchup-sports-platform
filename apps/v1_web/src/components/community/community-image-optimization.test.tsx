import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatListPageView, ChatRoomPageView } from './community-page';
import type { ChatListViewModel, ChatRoomViewModel } from './community.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function optimizerParams(src: string | null) {
  const url = new URL(src ?? '', 'http://localhost');
  return { pathname: url.pathname, url: url.searchParams.get('url'), w: Number(url.searchParams.get('w')) };
}

const emptyChatList: ChatListViewModel = {
  categories: [{ label: '전체', active: true }],
  pinnedRooms: [],
  rooms: [],
  status: 'ready',
};

const roomWithPhoto: ChatRoomViewModel = {
  title: '테스트 방',
  context: { title: '연습 경기', sub: '7월 26일', href: '/matches/m-1', typeLabel: '개인매치', linkLabel: '매치 상세 보기' },
  messages: [
    { id: 'm1', who: 'other', senderId: 'u2', label: '서연', body: '사진', sentAt: '2026-10-01T01:00:00Z', kind: 'image', imageUrl: '/uploads/2026/10/a.jpg' },
  ],
  status: 'ready',
};

describe('채팅 이미지는 최적화기를 거쳐 받는다', () => {
  it('사진 말풍선은 200px 칸에 맞춘 폭으로, 크게 보기는 1440 화면을 채울 폭으로 받는다', () => {
    const { container } = renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={roomWithPhoto} roomId="room-1" />);

    const thumb = optimizerParams(container.querySelector('img.tm-chat-image')!.getAttribute('src'));
    expect(thumb).toMatchObject({ pathname: '/_next/image', url: '/uploads/2026/10/a.jpg' });
    expect(thumb.w).toBeGreaterThanOrEqual(400);
    expect(thumb.w).toBeLessThan(1000);

    fireEvent.click(screen.getByRole('button', { name: '사진 크게 보기' }));
    const dialog = screen.getByRole('dialog', { name: '사진 크게 보기' });
    const viewer = optimizerParams(within(dialog).getByRole('img', { name: '보낸 사진' }).getAttribute('src'));
    expect(viewer).toMatchObject({ pathname: '/_next/image', url: '/uploads/2026/10/a.jpg' });
    // 뷰어 <img> 는 폭 지정이 없어 받은 비트맵의 자연 폭이 레이아웃 폭이 된다 — 1440 뷰포트의 1408px 이상이어야 한다.
    expect(viewer.w).toBeGreaterThanOrEqual(1408);
  });

  it('채팅방 목록 아바타 배경은 46px 칸에 맞춘 폭으로 받는다', () => {
    const model: ChatListViewModel = {
      ...emptyChatList,
      rooms: [{ id: 'r1', href: '/chat/r1', title: '사진 방', type: '팀', last: '안녕', time: '오후 3:00', unread: 0, initials: '사', avatarUrl: '/uploads/2026/10/room.png' }],
    };
    const { container } = renderWithClient(<ChatListPageView model={model} />);

    const avatars = Array.from(container.querySelectorAll<HTMLElement>('.tm-chat-avatar'));
    expect(avatars.length).toBeGreaterThan(0);
    for (const avatar of avatars) {
      const match = /url\("?([^")]+)"?\)/.exec(avatar.style.backgroundImage);
      expect(match).not.toBeNull();
      const params = optimizerParams(match![1]);
      expect(params).toMatchObject({ pathname: '/_next/image', url: '/uploads/2026/10/room.png' });
      expect(params.w).toBeGreaterThanOrEqual(92);
      expect(params.w).toBeLessThan(400);
    }
  });
});
