import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyInvitationsPageView } from './my-page';
import type { MyInvitationsViewModel } from './my.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/invitations',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function baseModel(overrides: Partial<MyInvitationsViewModel> = {}): MyInvitationsViewModel {
  return {
    invitations: [],
    error: false,
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('MyInvitationsPageView — 받은 초대 아이템별 처리 상태', () => {
  it('처리 중인 초대 카드만 버튼이 비활성화되고 "처리 중…" 문구가 뜬다 (전역 잠금 회귀 방지)', () => {
    const onAccept = vi.fn();
    const model = baseModel({
      invitations: [
        {
          invitationId: 'inv-a',
          teamId: 'team-a',
          teamName: '성수 러너스 FC',
          logoUrl: null,
          invitedByName: '김도윤',
          message: null,
          dateLabel: '7월 1일',
          actionPending: true,
        },
        {
          invitationId: 'inv-b',
          teamId: 'team-b',
          teamName: '마포 농구 클럽',
          logoUrl: null,
          invitedByName: '박서준',
          message: null,
          dateLabel: '7월 2일',
          actionPending: false,
        },
      ],
      onAccept,
    });

    render(<MyInvitationsPageView model={model} />);

    expect(screen.getByText('처리 중…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '성수 러너스 FC 초대 수락' })).toBeDisabled();

    // 처리 중이 아닌 다른 카드의 버튼은 여전히 눌러야 한다 — 전역 boolean이면 여기도 잠겨서 실패한다.
    const activeAcceptButton = screen.getByRole('button', { name: '마포 농구 클럽 초대 수락' });
    expect(activeAcceptButton).not.toBeDisabled();

    fireEvent.click(activeAcceptButton);
    expect(onAccept).toHaveBeenCalledWith('inv-b');
  });

  it('조회 실패 시 에러+재시도 UI를 보여준다', () => {
    const onRetry = vi.fn();
    const model = baseModel({ error: true, onRetry });

    render(<MyInvitationsPageView model={model} />);

    expect(screen.getByText('초대 목록을 불러오지 못했어요')).toBeInTheDocument();
    fireEvent.click(screen.getByText('다시 시도'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
