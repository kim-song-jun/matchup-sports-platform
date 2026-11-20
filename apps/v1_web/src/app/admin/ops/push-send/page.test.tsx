import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPushSendPage from './page';

const state = vi.hoisted(() => ({ role: 'ops' as 'ops' | 'support' }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1AdminMe: () => ({ data: { adminRole: state.role } }) }));
vi.mock('@/components/admin/push-send-form', () => ({ PushSendForm: () => <input aria-label="입력 중인 제목" /> }));
vi.mock('@/components/admin/push-history-view', () => ({ PushHistoryView: () => <p>발송 이력 목록</p> }));

describe('Admin push tabs', () => {
  beforeEach(() => { state.role = 'ops'; });
  it('switches tabs by keyboard and preserves the unsent form draft', async () => {
    const user = userEvent.setup(); render(<AdminPushSendPage />);
    await user.type(screen.getByLabelText('입력 중인 제목'), '아직 발송하지 않은 내용');
    const send = screen.getByRole('tab', { name: '발송하기' }); send.focus();
    fireEvent.keyDown(send, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '발송 이력' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('발송 이력 목록')).toBeInTheDocument();
    await user.click(send);
    expect(screen.getByLabelText('입력 중인 제목')).toHaveValue('아직 발송하지 않은 내용');
  });
  it('opens history for support without exposing a send form', () => {
    state.role = 'support'; render(<AdminPushSendPage />);
    expect(screen.getByRole('tab', { name: '발송하기' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: '발송 이력' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('입력 중인 제목')).not.toBeInTheDocument();
  });
});
