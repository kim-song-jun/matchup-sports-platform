import { render, screen } from '@testing-library/react';
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
