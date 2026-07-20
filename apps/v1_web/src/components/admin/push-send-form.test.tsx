import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PushSendForm } from './push-send-form';

const sendMutate = vi.fn();

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminUsers: () => ({
    data: {
      items: [
        { userId: 'user-1', nickname: '테스터', displayName: null, email: 'tester@example.com' },
      ],
    },
    isPending: false,
  }),
  useV1AdminSendPush: () => ({ mutate: sendMutate, isPending: false }),
}));

async function pickUser(user: ReturnType<typeof userEvent.setup>) {
  const searchInput = screen.getByLabelText('받는 사람');
  await user.type(searchInput, '테스터');
  const option = await screen.findByRole('option', { name: /테스터/ });
  await user.click(option);
}

describe('PushSendForm', () => {
  beforeEach(() => {
    sendMutate.mockReset();
  });

  it('sends the correct payload for a user-target push', async () => {
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');

    await user.click(screen.getByRole('button', { name: '발송하기' }));

    expect(sendMutate).toHaveBeenCalledTimes(1);
    const [payload] = sendMutate.mock.calls[0];
    expect(payload).toEqual({
      target: 'user',
      userId: 'user-1',
      title: '테스트 알림',
      body: undefined,
      url: undefined,
    });
  });

  it('does not send a broadcast push until the confirm modal is accepted', async () => {
    const user = userEvent.setup();
    render(<PushSendForm />);

    await user.click(screen.getByRole('radio', { name: /전체 구독자/ }));
    await user.type(screen.getByLabelText(/제목/), '전체 공지');

    // Submitting only opens the confirmation dialog — no send yet.
    await user.click(screen.getByRole('button', { name: '전체 발송 확인' }));
    expect(sendMutate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog', { name: '전체 발송 확인' });
    await user.click(within(dialog).getByRole('button', { name: '전체 발송' }));

    expect(sendMutate).toHaveBeenCalledTimes(1);
    const [payload] = sendMutate.mock.calls[0];
    expect(payload).toEqual({
      target: 'broadcast',
      userId: undefined,
      title: '전체 공지',
      body: undefined,
      url: undefined,
    });
  });

  it('restores focus to the trigger button after the broadcast confirm modal closes (cancel path)', async () => {
    const user = userEvent.setup();
    render(<PushSendForm />);

    await user.click(screen.getByRole('radio', { name: /전체 구독자/ }));
    await user.type(screen.getByLabelText(/제목/), '전체 공지');

    const triggerButton = screen.getByRole('button', { name: '전체 발송 확인' });
    await user.click(triggerButton);

    const dialog = await screen.findByRole('alertdialog', { name: '전체 발송 확인' });
    await user.click(within(dialog).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(triggerButton).toHaveFocus());
  });

  it('shows the sent/skipped/failed result summary after a successful send', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({ sent: 5, skipped: 2, failed: 1 });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    await waitFor(() => {
      const result = screen.getByTestId('push-send-result');
      expect(within(result).getByText('5')).toBeInTheDocument();
      expect(within(result).getByText('2')).toBeInTheDocument();
      expect(within(result).getByText('1')).toBeInTheDocument();
    });
  });
});
