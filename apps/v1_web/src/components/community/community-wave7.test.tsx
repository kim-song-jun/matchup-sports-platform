import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatListPageView, ChatRoomPageView, NotificationsPageView } from './community-page';
import type { ChatListViewModel, ChatRoomViewModel, NotificationsViewModel } from './community.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyChatList: ChatListViewModel = {
  categories: [{ label: '전체', active: true }],
  pinnedRooms: [],
  rooms: [],
  status: 'ready',
  emptyHref: '/matches',
};

describe('채팅 목록 빈 상태', () => {
  // 이 뷰는 모바일 pane 과 데스크톱 workspace 두 벌을 함께 그린다(CSS 로 한쪽만 보인다).
  // 그래서 단언은 pane 안으로 좁히고, 두 벌 다 같은 행동을 제공하는지 개수로 따로 확인한다.
  it('다음 행동을 링크로 준다 — window.location 전체 새로고침이 아니라 앱 안에서 이동한다', () => {
    const { container } = renderWithClient(<ChatListPageView model={emptyChatList} />);

    const pane = container.querySelector('.tm-chat-mobile-pane') as HTMLElement;
    expect(within(pane).getByRole('link', { name: '매치 찾아보기' })).toHaveAttribute('href', '/matches');
    expect(screen.getAllByRole('link', { name: '매치 찾아보기' })).toHaveLength(2);
  });

  it('그래픽을 함께 보여준다', () => {
    renderWithClient(<ChatListPageView model={emptyChatList} />);

    // 페이지 어딘가가 아니라 '이 빈 상태 블록 안'을 본다 — 옆 pane 의 그래픽을 잡으면 단언이 헛돈다.
    const block = screen.getAllByText('아직 채팅방이 없어요')[0].closest('.tm-empty-state');
    expect(block).not.toBeNull();
    expect(block!.querySelector('.tm-empty-illustration')).not.toBeNull();
  });

  it('실패는 빈 상태가 아니라 경고 + 다시 불러오기로 나온다', () => {
    const onRetry = vi.fn();
    const { container } = renderWithClient(<ChatListPageView model={{ ...emptyChatList, status: 'error', onRetry }} />);

    const pane = within(container.querySelector('.tm-chat-mobile-pane') as HTMLElement);
    expect(pane.getByRole('alert')).toHaveTextContent('채팅방을 불러오지 못했어요');
    fireEvent.click(pane.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

const emptyRoom: ChatRoomViewModel = {
  title: '테스트 방',
  context: { title: '연습 경기', sub: '7월 26일', href: '/matches/m-1' },
  messages: [],
  status: 'ready',
};

describe('채팅방 빈 상태', () => {
  it('첫 메시지를 유도하는 그래픽을 보여준다', () => {
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={emptyRoom} roomId="room-1" />);

    // 이 뷰는 옆에 채팅 목록 pane 도 함께 그린다 — 그쪽 그래픽을 잡지 않도록 메시지 빈 상태 블록 안으로 좁힌다.
    const block = screen.getByText('아직 메시지가 없어요').closest('.tm-empty-state');
    expect(block).not.toBeNull();
    expect(block!.querySelector('.tm-empty-illustration')).not.toBeNull();
  });

  it('메시지 로드 실패는 경고 + 다시 불러오기로 나온다', () => {
    const onRetry = vi.fn();
    renderWithClient(
      <ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, status: 'error', onRetry }} roomId="room-1" />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('메시지를 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('채팅방 입력 — Enter 전송', () => {
  function renderRoom(onSend = vi.fn()) {
    renderWithClient(
      <ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, draft: '안녕하세요', onSend }} roomId="room-1" />,
    );
    return { onSend, input: screen.getByRole('textbox', { name: '메시지 입력' }) };
  }

  it('Enter 로 보낸다', () => {
    const { onSend, input } = renderRoom();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('한글 조합 중 Enter 는 글자 확정이라 보내지 않는다 (isComposing · Safari keyCode 229)', () => {
    const { onSend, input } = renderRoom();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('여러 줄 입력칸이고 Shift+Enter 는 줄바꿈으로 남긴다(기본 동작을 막지 않는다)', () => {
    const { onSend, input } = renderRoom();
    expect(input.tagName).toBe('TEXTAREA');
    // fireEvent 는 preventDefault 되면 false 를 돌려준다 — true 여야 브라우저가 줄바꿈을 넣는다.
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('터치 기기에서는 Enter 가 줄바꿈이다 — 모바일 키보드엔 Shift 가 없어 Enter 가 유일한 줄바꿈', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original(query), matches: query === '(pointer: coarse)' })) as typeof window.matchMedia;
    try {
      const { onSend, input } = renderRoom();
      expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true);
      expect(onSend).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('채팅방 + 패널 · 사진 (Task 181)', () => {
  const withMatchMedia = (coarse: boolean, run: () => void) => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original(query), matches: coarse && query === '(pointer: coarse)' })) as typeof window.matchMedia;
    try {
      run();
    } finally {
      window.matchMedia = original;
    }
  };

  it('+ 는 입력창 아래 패널을 여닫고(× 로 바뀜) ESC 로도 닫힌다', () => {
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages: vi.fn() }} roomId="room-1" />);
    const toggle = screen.getByRole('button', { name: '보내기 메뉴 열기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    const panel = screen.getByRole('group', { name: '보내기 메뉴' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', panel.id);
    expect(screen.getByRole('button', { name: '보내기 메뉴 닫기' })).toBe(toggle);
    expect(screen.getByRole('button', { name: '앨범' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: '보내기 메뉴' })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('앨범에서 고른 사진을 넘기고 패널을 닫는다', () => {
    const onPickImages = vi.fn();
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages }} roomId="room-1" />);
    fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.png', { type: 'image/png' })];

    fireEvent.change(screen.getByTestId('chat-album-input'), { target: { files } });

    expect(onPickImages).toHaveBeenCalledWith(files);
    expect(screen.queryByRole('group', { name: '보내기 메뉴' })).not.toBeInTheDocument();
  });

  it('입력이 잠긴 방·사진 기능이 없는 방은 + 가 눌리지 않는다', () => {
    const { unmount } = renderWithClient(
      <ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages: vi.fn(), inputLockedMessage: '수락하면 대화할 수 있어요' }} roomId="room-1" />,
    );
    expect(screen.getByRole('button', { name: '보내기 메뉴 열기' })).toBeDisabled();
    unmount();
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={emptyRoom} roomId="room-1" />);
    expect(screen.getByRole('button', { name: '보내기 메뉴 열기' })).toBeDisabled();
  });

  it('카메라 칸은 터치 기기에서만, 안드로이드 앱에서는 숨긴다(네이티브 선택기가 촬영을 못 연다)', () => {
    const model = { ...emptyRoom, onPickImages: vi.fn() };
    const { unmount } = renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={model} roomId="room-1" />);
    fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
    expect(screen.queryByRole('button', { name: '카메라' })).not.toBeInTheDocument();
    unmount();

    withMatchMedia(true, () => {
      const first = renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={model} roomId="room-1" />);
      fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
      expect(screen.getByRole('button', { name: '카메라' })).toBeInTheDocument();
      expect(screen.getByTestId('chat-camera-input')).toHaveAttribute('capture', 'environment');
      first.unmount();

      window.TeameetNative = { postMessage: vi.fn() } as unknown as typeof window.TeameetNative;
      try {
        renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={model} roomId="room-1" />);
        fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));
        expect(screen.queryByRole('button', { name: '카메라' })).not.toBeInTheDocument();
      } finally {
        delete window.TeameetNative;
      }
    });
  });

  it('사진 말풍선을 누르면 전체 화면으로 보고, 닫기로 돌아온다 · 볼 수 없는 사진은 문구로', () => {
    const messages: ChatRoomViewModel['messages'] = [
      { id: 'm1', who: 'other', senderId: 'u2', label: '서연', body: '사진', sentAt: '2026-10-01T01:00:00Z', kind: 'image', imageUrl: '/uploads/2026/10/a.jpg' },
      { id: 'm2', who: 'other', senderId: 'u2', label: '서연', body: '사진을 볼 수 없어요', sentAt: '2026-10-01T01:01:00Z', kind: 'image', imageUrl: null },
    ];
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, messages }} roomId="room-1" />);
    expect(screen.getByText('사진을 볼 수 없어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '사진 크게 보기' }));
    const dialog = screen.getByRole('dialog', { name: '사진 크게 보기' });
    expect(within(dialog).getByRole('img', { name: '보낸 사진' })).toHaveAttribute('src', '/uploads/2026/10/a.jpg');

    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog', { name: '사진 크게 보기' })).not.toBeInTheDocument();
  });
});

describe('채팅방 일정·매치 공유 (Task 181 ②)', () => {
  const shareModel = (overrides: Partial<NonNullable<ChatRoomViewModel['share']>> = {}): NonNullable<ChatRoomViewModel['share']> => ({
    open: false,
    onOpen: vi.fn(),
    onClose: vi.fn(),
    status: 'ready',
    schedules: [{ kind: 'team_schedule', targetId: 'sch-1', title: '토요일 친선', when: '10/4 (토) 19:00', sub: '번개 FC' }],
    matches: [{ kind: 'match', targetId: 'm-1', title: '수요일 저녁 풋살', when: '10/8 (수) 20:00', sub: '성수 풋살파크' }],
    onPick: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  });

  it('+ 패널의 "일정·매치" 칸은 공유 시트를 열고 패널을 닫는다', () => {
    const share = shareModel();
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages: vi.fn(), share }} roomId="room-1" />);
    fireEvent.click(screen.getByRole('button', { name: '보내기 메뉴 열기' }));

    fireEvent.click(screen.getByRole('button', { name: '일정·매치' }));

    expect(share.onOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: '보내기 메뉴' })).not.toBeInTheDocument();
  });

  it('시트에서 팀 일정·매치 탭을 바꿔 고르면 그 항목을 넘긴다', () => {
    const share = shareModel({ open: true });
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages: vi.fn(), share }} roomId="room-1" />);
    const sheet = screen.getByRole('dialog', { name: '일정·매치 공유' });

    fireEvent.click(within(sheet).getByRole('button', { name: /토요일 친선/ }));
    expect(share.onPick).toHaveBeenCalledWith(share.schedules[0]);

    fireEvent.click(within(sheet).getByRole('tab', { name: '매치' }));
    expect(within(sheet).getByText('10/8 (수) 20:00 · 성수 풋살파크')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: /수요일 저녁 풋살/ }));
    expect(share.onPick).toHaveBeenLastCalledWith(share.matches[0]);
  });

  it('비었거나·불러오는 중이거나·실패하면 그 상태를 알리고 실패는 다시 불러온다', () => {
    const { unmount } = renderWithClient(
      <ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages: vi.fn(), share: shareModel({ open: true, schedules: [] }) }} roomId="room-1" />,
    );
    expect(screen.getByText('다가오는 팀 일정이 없어요.')).toBeInTheDocument();
    unmount();

    const failing = shareModel({ open: true, status: 'error' });
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, onPickImages: vi.fn(), share: failing }} roomId="room-1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('목록을 불러오지 못했어요.');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(failing.onRetry).toHaveBeenCalledTimes(1);
  });

  it('공유 카드는 종류·제목·일시·장소를 보여 주고 누르면 그 화면으로 간다', () => {
    const messages: ChatRoomViewModel['messages'] = [{
      id: 's1', who: 'me', senderId: 'u1', label: '나', body: '[매치] 수요일 저녁 풋살', sentAt: '2026-10-01T01:00:00Z', kind: 'share',
      share: { label: '매치', title: '수요일 저녁 풋살', when: '10/8 (수) 20:00', place: '성수 풋살파크', sub: null, href: '/matches/m-1?from=%2Fchat%2Froom-1' },
    }];
    renderWithClient(<ChatRoomPageView listModel={emptyChatList} model={{ ...emptyRoom, messages }} roomId="room-1" />);

    const card = screen.getByRole('link', { name: /매치 공유/ });
    expect(card).toHaveAttribute('href', '/matches/m-1?from=%2Fchat%2Froom-1');
    expect(within(card).getByText('수요일 저녁 풋살')).toBeInTheDocument();
    expect(within(card).getByText('성수 풋살파크')).toBeInTheDocument();
  });
});

const emptyNotifications: NotificationsViewModel = { status: 'ready', unreadCount: 0, notifications: [] };

describe('알림 빈 상태', () => {
  it('막다른 길로 두지 않고 매치로 가는 링크를 준다', () => {
    renderWithClient(<NotificationsPageView model={emptyNotifications} />);

    expect(screen.getByRole('link', { name: '매치 둘러보기' })).toHaveAttribute('href', '/matches');
    const block = screen.getByText('아직 알림이 없어요').closest('.tm-empty-state');
    expect(block).not.toBeNull();
    expect(block!.querySelector('.tm-empty-illustration')).not.toBeNull();
  });

  it('알림 로드 실패는 경고 + 다시 불러오기로 나온다', () => {
    const onRetry = vi.fn();
    renderWithClient(<NotificationsPageView model={{ ...emptyNotifications, status: 'error', onRetry }} />);

    expect(screen.getByRole('alert')).toHaveTextContent('알림을 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
