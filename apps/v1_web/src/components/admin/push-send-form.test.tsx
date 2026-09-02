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

  /**
   * 회귀 방지: 앱 알림 생성 건수만 보여주면 "푸시도 갔다"고 읽힌다. 구독이 0건이면
   * 푸시는 한 건도 나가지 않는데(alpha 에서 실제로 겪은 상황), 예전 화면은 그걸
   * 성공으로만 표시해 운영자가 원인을 알 수 없었다.
   */
  it('푸시 구독이 0건이면 앱 알림만 남았다고 결과에 밝힌다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 5,
        skipped: 0,
        failed: 0,
        push: { subscriptions: 0, delivered: 0, failed: 0, disabled: false },
      });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    await waitFor(() => {
      const result = screen.getByTestId('push-send-result');
      expect(within(result).getByText(/브라우저 알림을 켠 사용자가 없어 푸시는 나가지 않았어요/)).toBeInTheDocument();
    });
  });

  it('서버 VAPID 가 꺼져 있으면 그 사실을 결과에 밝힌다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 3,
        skipped: 0,
        failed: 0,
        push: { subscriptions: 0, delivered: 0, failed: 0, disabled: true },
      });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    await waitFor(() => {
      const result = screen.getByTestId('push-send-result');
      expect(within(result).getByText(/VAPID 키가 설정되지 않아/)).toBeInTheDocument();
    });
  });

  /**
   * 회귀 방지: 앱 기기만 가진 사용자에게 보낸 발송이 "구독 0건 · 나가지 않음" 으로만 보였다
   * (2026-09-02 alpha 실측 — 시뮬레이터에 배너가 도착했는데 화면은 0건). 앱 줄이 따로 있고,
   * 토스트도 "나가지 않았다" 를 붙이지 않아야 한다.
   */
  it('앱 기기로만 전송된 경우 앱 푸시 줄에 건수를 보여주고 나가지 않았다고 말하지 않는다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 1,
        skipped: 0,
        failed: 0,
        push: {
          subscriptions: 0,
          delivered: 0,
          failed: 0,
          disabled: false,
          native: { devices: 1, delivered: 1, failed: 0, disabled: false },
        },
      });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    await waitFor(() => {
      const result = screen.getByTestId('push-send-result');
      expect(within(result).getByText(/기기 1대 중 1대 전송/)).toBeInTheDocument();
      expect(within(result).getByText(/브라우저 알림을 켠 사용자가 없어/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/푸시는 나가지 않았어요\)/)).not.toBeInTheDocument();
  });

  it('앱 푸시 어댑터가 꺼져 있으면 그 사실을 앱 줄에 밝힌다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 1,
        skipped: 0,
        failed: 0,
        push: {
          subscriptions: 0,
          delivered: 0,
          failed: 0,
          disabled: false,
          native: { devices: 0, delivered: 0, failed: 0, disabled: true },
        },
      });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    await waitFor(() => {
      const result = screen.getByTestId('push-send-result');
      expect(within(result).getByText(/APNs·FCM 키가 설정되지 않아/)).toBeInTheDocument();
    });
  });

  it('실제로 푸시가 전송되면 구독·전송 건수를 보여준다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 2,
        skipped: 0,
        failed: 0,
        push: { subscriptions: 3, delivered: 2, failed: 1, disabled: false },
      });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    await waitFor(() => {
      const result = screen.getByTestId('push-send-result');
      expect(within(result).getByText(/구독 3건 중 2건 전송, 1건 실패/)).toBeInTheDocument();
    });
  });
});
