import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminTournamentsPage from './page';

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, title: `대회 ${id}`, status: 'open', isPublic: true,
    scheduledAt: '2026-10-11T16:24:00.000Z', scheduledEndAt: '2026-10-12T00:24:00.000Z',
    registrationDeadlineAt: null, entryFee: 0, registrationCount: 0, venue: null, ...overrides,
  };
}

const listMock = vi.fn();
const mutateAsync = vi.fn();
let canWrite = true;

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: canWrite ? ['status:write'] : [] } }),
  useV1MockSeedAvailability: () => ({ data: { enabled: false } }),
  useV1CreateMockTournament: () => ({ mutate: vi.fn(), isPending: false }),
  useV1UpdateTournamentVisibility: (id: string) => ({
    mutateAsync: (body: { isPublic: boolean }) => mutateAsync(id, body),
    isPending: false,
  }),
  useV1AdminTournaments: (params: unknown) => listMock(params),
}));

beforeEach(() => {
  canWrite = true;
  mutateAsync.mockResolvedValue({});
  window.history.replaceState(null, '', '/admin/tournaments');
  listMock.mockReturnValue({
    data: {
      items: [row('a'), row('b', { isPublic: false }), row('c', { status: 'cancelled' })],
      pageInfo: { page: 1, limit: 20, totalPages: 1, total: 3 },
      summary: { total: 3, byStatus: {} },
    },
    isPending: false, isFetching: false, isError: false, error: null, refetch: vi.fn(),
  });
});
afterEach(() => cleanup());

describe('대회 목록 공개 여부', () => {
  it('공개 여부 필터가 조회 파라미터와 URL 로 간다 (선택 안 하면 파라미터 없음)', async () => {
    const user = userEvent.setup();
    render(<AdminTournamentsPage />);
    expect(listMock.mock.lastCall?.[0]).not.toHaveProperty('visibility');

    await user.selectOptions(screen.getByLabelText('공개 여부'), 'hidden');
    expect(listMock.mock.lastCall?.[0]).toMatchObject({ visibility: 'hidden', page: 1 });
    expect(window.location.search).toBe('?visibility=hidden');
  });

  it('행마다 공개/숨김을 글자로 보이고, 확인 모달을 거쳐서만 API 를 부른다', async () => {
    const user = userEvent.setup();
    render(<AdminTournamentsPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('숨김')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: '대회 a 숨기기' }));
    expect(mutateAsync).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '숨기기' }));
    expect(mutateAsync).toHaveBeenCalledWith('a', { isPublic: false });

    await user.click(within(table).getByRole('button', { name: '대회 b 다시 보이기' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '다시 보이기' }));
    expect(mutateAsync).toHaveBeenLastCalledWith('b', { isPublic: true });
  });

  it('취소된 대회는 상세와 같은 규칙으로 버튼이 없고 노출 안 됨으로 표시한다', () => {
    render(<AdminTournamentsPage />);
    const table = screen.getByRole('table');
    expect(within(table).getByText('노출 안 됨')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /대회 c/ })).not.toBeInTheDocument();
  });

  it('읽기 전용 계정은 비활성이고 사유가 접근성 이름에 들어간다', () => {
    canWrite = false;
    render(<AdminTournamentsPage />);
    const button = within(screen.getByRole('table')).getByRole('button', { name: /대회 a 숨기기/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleName(/권한이 없어요/);
  });
});
