import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminReasonModal } from './admin-reason-modal';

const options = [{ value: 'active', label: '활성' }, { value: 'suspended', label: '정지' }, { value: 'blocked', label: '차단' }];

describe('AdminReasonModal selectable status contract', () => {
  it.each(['deleted', 'withdrawal_pending'])('submits the displayed status when %s is not selectable', (currentStatus) => {
    const submit = vi.fn();
    render(<AdminReasonModal open title="회원 상태 변경" currentStatus={currentStatus}
      statusOptions={options} onSubmit={submit} onClose={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('active');
    fireEvent.change(screen.getByLabelText(/사유/), { target: { value: '계정 복구 확인' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(submit).toHaveBeenCalledWith('active', '계정 복구 확인');
  });

  it('preserves a current status that remains selectable', () => {
    const submit = vi.fn();
    render(<AdminReasonModal open title="회원 상태 변경" currentStatus="suspended"
      statusOptions={options} onSubmit={submit} onClose={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveValue('suspended');
    fireEvent.change(screen.getByLabelText(/사유/), { target: { value: '상태 재확인' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(submit).toHaveBeenCalledWith('suspended', '상태 재확인');
  });

  it('cannot submit without a selectable status', () => {
    const submit = vi.fn();
    render(<AdminReasonModal open title="회원 상태 변경" currentStatus="deleted"
      statusOptions={[]} onSubmit={submit} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/사유/), { target: { value: '계정 복구 확인' } });
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });
});
