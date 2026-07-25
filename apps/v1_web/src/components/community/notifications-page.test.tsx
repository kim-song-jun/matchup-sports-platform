import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsPageView } from './community-page';
import type { NotificationModel, NotificationsViewModel } from './community.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

const LONG_BODY =
  '"환불 언제 되나요" 문의 답변: 결제하신 참가비는 취소 승인 후 3영업일 이내에 원결제 수단으로 환불돼요. 카드사 사정에 따라 하루 이틀 더 걸릴 수 있어요.';

const notification: NotificationModel = {
  id: 'notif-1',
  type: 'inquiry',
  group: '오늘',
  title: '문의에 답변이 등록됐어요',
  body: LONG_BODY,
  time: '7월 26일 02:10',
  unread: true,
  href: '/my/inquiries/inquiry-1?from=notifications',
  actionLabel: '보기',
};

function makeModel(overrides: Partial<NotificationsViewModel> = {}): NotificationsViewModel {
  return {
    status: 'ready',
    unreadCount: 1,
    notifications: [notification],
    ...overrides,
  };
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('NotificationsPageView — 상세 시트', () => {
  it('카드를 탭하면 곧바로 이동하지 않고 상세 시트를 열어 본문 전문을 보여준다', () => {
    const onOpen = vi.fn();
    const onNavigate = vi.fn();

    renderWithClient(<NotificationsPageView model={makeModel({ onOpen, onNavigate })} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /문의에 답변이 등록됐어요/ }));

    const dialog = screen.getByRole('dialog');
    // 카드에서는 2줄로 잘리는 본문이 시트에서는 전문으로 노출돼야 한다.
    expect(dialog).toHaveTextContent(LONG_BODY);
    expect(dialog).toHaveTextContent('7월 26일 02:10');
    // 읽음 처리는 카드 탭 시점에 일어나고, 이동은 아직 일어나지 않는다.
    expect(onOpen).toHaveBeenCalledWith(notification);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('시트의 CTA를 눌러야 대상 화면으로 이동한다', () => {
    const onNavigate = vi.fn();

    renderWithClient(<NotificationsPageView model={makeModel({ onOpen: vi.fn(), onNavigate })} />);
    fireEvent.click(screen.getByRole('button', { name: /문의에 답변이 등록됐어요/ }));
    fireEvent.click(screen.getByRole('button', { name: '보기' }));

    expect(onNavigate).toHaveBeenCalledWith(notification);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ESC로 시트를 닫으면 이동하지 않는다', () => {
    const onNavigate = vi.fn();

    renderWithClient(<NotificationsPageView model={makeModel({ onOpen: vi.fn(), onNavigate })} />);
    fireEvent.click(screen.getByRole('button', { name: /문의에 답변이 등록됐어요/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('본문이 비어 있어도 시트가 안내 문구로 대체한다', () => {
    renderWithClient(
      <NotificationsPageView
        model={makeModel({
          notifications: [{ ...notification, body: '' }],
          onOpen: vi.fn(),
          onNavigate: vi.fn(),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /문의에 답변이 등록됐어요/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent('추가 안내 내용이 없어요.');
  });
});
