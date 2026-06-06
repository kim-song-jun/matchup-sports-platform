import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { v1Post } from '@/lib/api-client';
import { AdminStatusMutationPanel } from './admin-api-clients';

vi.mock('@/lib/api-client', () => ({
  v1Post: vi.fn(),
}));

const mockedV1Post = vi.mocked(v1Post);

function renderPanel(canWriteStatus = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AdminStatusMutationPanel canWriteStatus={canWriteStatus} />
    </QueryClientProvider>,
  );
}

describe('AdminStatusMutationPanel', () => {
  beforeEach(() => {
    mockedV1Post.mockReset();
  });

  it('submits a selected target status change to the real admin status endpoint', async () => {
    mockedV1Post.mockResolvedValueOnce({
      userId: 'user-2',
      previousStatus: 'active',
      status: 'suspended',
      actionLogId: 'admin-log-2',
      statusChangeLogId: 'status-log-2',
    });
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(screen.getByLabelText('대상 종류'), 'user');
    await user.type(screen.getByLabelText('대상 ID'), 'user-2');
    await user.selectOptions(screen.getByLabelText('변경 상태'), 'suspended');
    await user.type(screen.getByLabelText('처리 사유'), '반복 신고 검토');
    await user.click(screen.getByRole('button', { name: '상태 변경 기록' }));

    await waitFor(() => {
      expect(mockedV1Post).toHaveBeenCalledWith('/admin/users/user-2/status', {
        status: 'suspended',
        reason: '반복 신고 검토',
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('감사 기록이 생성되었습니다');
    expect(screen.getByRole('status')).toHaveTextContent('일시 정지');
  });

  it('shows the real failure reason and does not render a success state when the API rejects', async () => {
    mockedV1Post.mockRejectedValueOnce(new Error('Active admin access is required'));
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('대상 ID'), 'user-2');
    await user.type(screen.getByLabelText('처리 사유'), '권한 검증');
    await user.click(screen.getByRole('button', { name: '상태 변경 기록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자 권한이 필요합니다');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps mutation controls disabled for read-only admin authority', () => {
    renderPanel(false);

    expect(screen.getByText('현재 권한은 읽기 전용입니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('대상 종류')).toBeDisabled();
    expect(screen.getByLabelText('대상 ID')).toBeDisabled();
    expect(screen.getByRole('button', { name: '상태 변경 기록' })).toBeDisabled();
  });

  it('distinguishes authority loading from read-only authority', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AdminStatusMutationPanel canWriteStatus={false} authorityState="loading" />
      </QueryClientProvider>,
    );

    expect(screen.getByText('권한을 확인하는 중입니다.')).toBeInTheDocument();
    expect(screen.queryByText('현재 권한은 읽기 전용입니다.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상태 변경 기록' })).toBeDisabled();
  });

  it('clears target-specific fields when the mutation target type changes', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('대상 ID'), 'user-2');
    await user.type(screen.getByLabelText('처리 사유'), '대상 변경 전 입력');
    await user.selectOptions(screen.getByLabelText('대상 종류'), 'match');

    expect(screen.getByLabelText('대상 ID')).toHaveValue('');
    expect(screen.getByLabelText('처리 사유')).toHaveValue('');
    expect(screen.getByRole('button', { name: '상태 변경 기록' })).toBeDisabled();
  });
});
