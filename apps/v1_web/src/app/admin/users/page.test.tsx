import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './page';

const usersQueryMock = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('status=active'),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
  useV1ChangeUserStatus: () => ({ mutate: vi.fn(), isPending: false }),
  useV1AdminUsers: (filters: unknown) => {
    usersQueryMock(filters);
    return {
      data: {
        items: [],
        pageInfo: { page: 1, totalPages: 1, total: 0, limit: 20 },
        summary: { total: 0, byStatus: {} },
      },
      isPending: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

describe('AdminUsersPage — useAdminListQuery 배선', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usersQueryMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads ?status= from the URL and forwards debounced search into the list query', () => {
    render(<AdminUsersPage />);

    // URL의 status=active가 초기 필터로 전달된다
    expect(usersQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', page: 1, limit: 20 }),
    );

    fireEvent.change(screen.getByLabelText('닉네임·이메일 검색'), {
      target: { value: '  kim ' },
    });
    // debounce(300ms) 전에는 q가 나가지 않는다
    expect(usersQueryMock).not.toHaveBeenCalledWith(expect.objectContaining({ q: 'kim' }));

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(usersQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'kim', status: 'active', page: 1 }),
    );
  });
});
