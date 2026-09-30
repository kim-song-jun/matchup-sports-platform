import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './confirm-modal';

describe('ConfirmModal confirmation phrase', () => {
  it('requires an exact phrase before confirming a destructive action', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmModal
        open
        title="멤버 내보내기"
        message="선택한 멤버를 팀에서 내보낼까요?"
        confirmLabel="내보내기"
        tone="danger"
        confirmationPhrase="확인했습니다"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const input = screen.getByRole('textbox', { name: /확인했습니다/ });
    const confirmButton = screen.getByRole('button', { name: '내보내기' });
    expect(confirmButton).toBeDisabled();

    await user.type(input, '확인했어요');
    expect(confirmButton).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, ' 확인했습니다 ');
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, '확인했습니다');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps existing confirmations usable when no phrase is configured', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmModal
        open
        title="운영진 지정"
        message="운영진으로 지정할까요?"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('ConfirmModal reason field', () => {
  function ReasonHost({ onConfirm, busy = false, error = null }: { onConfirm: () => void; busy?: boolean; error?: string | null }) {
    const [reason, setReason] = useState('');
    return (
      <ConfirmModal
        open
        title="일정을 취소할까요?"
        message="되돌릴 수 없어요."
        confirmLabel="일정 취소"
        tone="danger"
        reasonField={{ label: '취소 사유', value: reason, onChange: setReason, required: true, maxLength: 500, hint: '변경 이력에 남아요.' }}
        busy={busy}
        error={error}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />
    );
  }

  it('keeps confirm disabled until a non-blank reason is typed, and counts characters', async () => {
    const onConfirm = vi.fn();
    render(<ReasonHost onConfirm={onConfirm} />);

    const input = screen.getByRole('textbox', { name: '취소 사유' });
    const confirmButton = screen.getByRole('button', { name: '일정 취소' });
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAccessibleDescription('변경 이력에 남아요.');
    expect(input).toHaveAttribute('maxlength', '500');
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: '   ' } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(input, { target: { value: '우천 취소' } });
    expect(screen.getByText('5/500')).toBeInTheDocument();
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('locks both buttons while busy and shows the failure inside the dialog', () => {
    render(<ReasonHost onConfirm={() => undefined} busy error="일정을 취소하지 못했어요." />);

    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '일정 취소' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '취소 사유' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('일정을 취소하지 못했어요.');
  });
});
