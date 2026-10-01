import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import AdminTeamDetailPage from './page';

const hooks = vi.hoisted(() => ({
  status: 'active',
  capabilities: [] as string[],
  renameMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'team-1' }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminMe: () => ({ data: { capabilities: hooks.capabilities } }),
  useV1RenameArchivedTeam: () => ({ mutate: hooks.renameMutate, isPending: false }),
  useV1AdminTeam: () => ({
    data: {
      teamId: 'team-1',
      name: '성수 풋살 크루',
      status: hooks.status,
      sportName: '풋살',
      regionName: '서울 성동구',
      ownerName: '김도윤',
      ownerUserId: 'user-owner',
      memberCount: 7,
      managerCount: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      trustScore: null,
      recentHostedTeamMatches: [],
      members: [],
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('AdminTeamDetailPage — 상태와 인원은 한 번씩만', () => {
  it('상태는 원문("active") 없이 한글 배지로 한 번만 보인다', () => {
    render(<AdminTeamDetailPage />);

    expect(screen.queryByText('active')).not.toBeInTheDocument();
    expect(screen.getAllByText('활성')).toHaveLength(1);
  });

  it('멤버·매니저 수는 운영 요약에만 있고 상세 표에는 되풀이하지 않는다', () => {
    render(<AdminTeamDetailPage />);

    expect(screen.getAllByText('7')).toHaveLength(1);
    expect(screen.getAllByText('3')).toHaveLength(1);
    expect(screen.queryByText('멤버 수')).not.toBeInTheDocument();
    expect(screen.queryByText('매니저 수')).not.toBeInTheDocument();
  });
});

describe('AdminTeamDetailPage — 보관 팀 이름 바꾸기', () => {
  afterEach(() => {
    hooks.status = 'active';
    hooks.capabilities = [];
    hooks.renameMutate.mockReset();
  });

  function openRenameDialog() {
    render(<AdminTeamDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: '이름 바꾸기' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/새 팀 이름/), { target: { value: ' 성수 풋살 크루 2기 ' } });
    fireEvent.change(within(dialog).getByLabelText(/사유/), { target: { value: '이름 중복으로 복구 불가' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '이름 바꾸기' }));
    return dialog;
  }

  it('쓰기 권한이 있는 운영자에게 보관 팀만 이름 바꾸기를 보여 준다', () => {
    const visible = (status: string, capabilities: string[]) => {
      hooks.status = status;
      hooks.capabilities = capabilities;
      const { unmount } = render(<AdminTeamDetailPage />);
      const shown = screen.queryByRole('button', { name: '이름 바꾸기' }) !== null;
      unmount();
      return shown;
    };
    expect(visible('archived', ['status:write'])).toBe(true);
    expect(visible('active', ['status:write'])).toBe(false);
    expect(visible('archived', [])).toBe(false);
  });

  it('새 이름(앞뒤 공백 제외)과 사유로 요청하고, 서버가 거절하면 그 이유를 창 안에 남긴다', () => {
    hooks.status = 'archived';
    hooks.capabilities = ['status:write'];
    hooks.renameMutate.mockImplementation((_vars, options: { onError: (err: unknown) => void }) =>
      options.onError(
        new V1ApiError({
          status: 'error', statusCode: 409, code: 'TEAM_NAME_TAKEN',
          message: '같은 종목·지역에 같은 이름의 팀이 있어요. 다른 이름을 써 주세요.', details: null, timestamp: '2026-10-01T00:00:00.000Z',
        }),
      ),
    );
    const dialog = openRenameDialog();

    expect(hooks.renameMutate).toHaveBeenCalledWith(
      { id: 'team-1', name: '성수 풋살 크루 2기', reason: '이름 중복으로 복구 불가' },
      expect.anything(),
    );
    expect(within(dialog).getByRole('alert')).toHaveTextContent('같은 종목·지역에 같은 이름의 팀이 있어요.');
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('지금 이름 그대로면 보낼 수 없다', () => {
    hooks.status = 'archived';
    hooks.capabilities = ['status:write'];
    render(<AdminTeamDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: '이름 바꾸기' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/사유/), { target: { value: '사유' } });

    expect(within(dialog).getByRole('button', { name: '이름 바꾸기' })).toBeDisabled();
    expect(within(dialog).getByText('지금 이름과 달라야 해요.')).toBeInTheDocument();
  });
});
