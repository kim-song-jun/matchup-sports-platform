import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './page';

const usersQueryMock = vi.fn();

// 딥링크 값을 테스트마다 바꿔야 해서 변수로 뺀다(기본값은 기존과 동일).
const search = vi.hoisted(() => ({ query: 'status=active' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.query),
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
    search.query = 'status=active';
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

describe('AdminUsersPage — status 딥링크 검증', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usersQueryMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('허용 목록에 없는 status 는 서버로 보내지 않고 전체로 떨어뜨린다', () => {
    // 오타난 북마크(`?status=banned`, 실제 값은 'blocked')를 그대로 실으면 서버가 400 을
    // 내고 목록이 통째로 에러 화면이 된다 — "다시 시도"를 눌러도 같은 값으로 재요청하므로
    // 운영자가 스스로 회복할 방법을 알아내야 했다.
    search.query = 'status=banned';

    render(<AdminUsersPage />);

    expect(usersQueryMock).toHaveBeenCalled();
    const filters = usersQueryMock.mock.calls[0][0] as { status?: string };
    expect(filters.status ?? '').toBe('');
  });

  it('허용 목록에 있는 status 는 그대로 실어 보낸다', () => {
    search.query = 'status=blocked';

    render(<AdminUsersPage />);

    const filters = usersQueryMock.mock.calls[0][0] as { status?: string };
    expect(filters.status).toBe('blocked');
  });
});
