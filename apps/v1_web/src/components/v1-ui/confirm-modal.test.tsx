import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('ConfirmModal focus after a failed request', () => {
  function FailingHost({ request }: { request: () => Promise<void> }) {
    const [reason, setReason] = useState('우천 취소');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
      <ConfirmModal
        open
        title="일정을 취소할까요?"
        message="되돌릴 수 없어요."
        confirmLabel="일정 취소"
        tone="danger"
        reasonField={{ label: '취소 사유', value: reason, onChange: setReason, required: true }}
        busy={busy}
        error={error}
        onConfirm={() => {
          setBusy(true);
          request().catch(() => {
            setBusy(false);
            setError('일정을 취소하지 못했어요.');
          });
        }}
        onCancel={() => undefined}
      />
    );
  }

  function failingRequest() {
    let reject = () => undefined as void;
    const promise = new Promise<void>((_, rejectPromise) => {
      reject = () => rejectPromise(new Error('500'));
    });
    return { promise, reject };
  }

  async function submitAndLock({ focusDroppedToBody }: { focusDroppedToBody: boolean }) {
    const input = screen.getByRole('textbox', { name: '취소 사유' });
    await waitFor(() => expect(input).toHaveFocus()); // 열릴 때의 60ms 초기 포커스가 끝난 뒤부터 잰다
    const confirmButton = screen.getByRole('button', { name: '일정 취소' });
    confirmButton.focus();
    // Chrome 은 disabled 가 된 컨트롤의 포커스를 body 로 옮긴다(focus fixup). jsdom 은 그러지 않고
    // disabled 요소의 blur() 도 무시하므로, 잠기기 직전에 body 로 떨어뜨려 같은 상태를 만든다.
    if (focusDroppedToBody) confirmButton.blur();
    fireEvent.click(confirmButton);
    expect(confirmButton).toBeDisabled();
    return { input, confirmButton };
  }

  it('returns focus to the reason field when the lock had dropped it to body', async () => {
    const request = failingRequest();
    render(<FailingHost request={() => request.promise} />);
    const { input } = await submitAndLock({ focusDroppedToBody: true });
    expect(document.activeElement).toBe(document.body);

    await act(async () => request.reject());

    expect(screen.getByRole('alert')).toHaveTextContent('일정을 취소하지 못했어요.');
    expect(input).toHaveFocus();
  });

  it('leaves focus where it is when it never left the dialog', async () => {
    const request = failingRequest();
    render(<FailingHost request={() => request.promise} />);
    const { confirmButton } = await submitAndLock({ focusDroppedToBody: false });

    await act(async () => request.reject());

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(confirmButton).toHaveFocus();
  });
});
