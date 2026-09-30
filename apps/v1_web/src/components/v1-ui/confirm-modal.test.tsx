import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal } from './confirm-modal';

describe('ConfirmModal acknowledgement', () => {
  function renderAck(open: boolean, onConfirm = vi.fn()) {
    return (
      <ConfirmModal
        open={open}
        title="팀장 넘기기"
        message="김하나님이 새 팀장이 되고, 나는 매니저가 돼요."
        confirmLabel="팀장 넘기기"
        acknowledgement="이해했어요"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />
    );
  }

  it('keeps confirm off until the box is checked, and starts unchecked again on the next opening', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = render(renderAck(true, onConfirm));

    const confirmButton = screen.getByRole('button', { name: '팀장 넘기기' });
    expect(confirmButton).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: '이해했어요' }));
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    rerender(renderAck(false, onConfirm));
    rerender(renderAck(true, onConfirm));
    expect(screen.getByRole('checkbox', { name: '이해했어요' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '팀장 넘기기' })).toBeDisabled();
  });
});

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
        title="매니저로 지정"
        message="매니저로 지정할까요?"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
