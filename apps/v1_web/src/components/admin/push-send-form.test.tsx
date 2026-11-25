import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PushSendForm } from './push-send-form';

const sendMutate = vi.fn();
const audienceParams = vi.fn();
let audienceResult: { data?: { audience: number; noticeOff: number; recipients: number }; isError: boolean; refetch: () => void } = {
  data: { audience: 24, noticeOff: 2, recipients: 22 }, isError: false, refetch: vi.fn(),
};

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
  useV1AdminTournaments: () => ({ data: { items: [{ id: 'tournament-1', title: '11월 오픈 대회' }] }, isPending: false }),
  useV1AdminLeagueMatchList: () => ({ data: { items: [{ leagueId: 'league-1', title: '11월 여자부 리그' }] }, isPending: false }),
  useV1AdminPushAudience: (params: unknown) => { audienceParams(params); return params ? audienceResult : { data: undefined, isError: false, refetch: vi.fn() }; },
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
    audienceParams.mockReset();
    audienceResult = { data: { audience: 24, noticeOff: 2, recipients: 22 }, isError: false, refetch: vi.fn() };
  });

  it('previews the actual title and body before sending without invoking the send API', async () => {
    const user = userEvent.setup(); render(<PushSendForm />);
    await user.type(screen.getByLabelText(/제목/), '우승 혜택 안내');
    await user.type(screen.getByLabelText('내용'), '상금과 상품권 안내');
    expect(screen.getByTestId('phone-push-preview')).toHaveTextContent('우승 혜택 안내');
    expect(screen.getByTestId('inbox-push-preview')).toHaveTextContent('상금과 상품권 안내');
    expect(sendMutate).not.toHaveBeenCalled();
  });

  it('warns about history storage failure without asking the operator to send again', async () => {
    sendMutate.mockImplementation((_payload, options) => options.onSuccess({ sent: 1, skipped: 0, failed: 0, historyRecorded: false }));
    const user = userEvent.setup(); render(<PushSendForm />);
    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 안내');
    await user.click(screen.getByRole('button', { name: '발송하기' }));
    expect(await screen.findByText(/발송 처리는 끝났지만 이력 저장에 실패/)).toBeInTheDocument();
    expect(sendMutate).toHaveBeenCalledTimes(1);
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

    await user.click(screen.getByRole('radio', { name: /전체 회원/ }));
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

  describe('성별·대회/리그 참가팀 발송', () => {
    async function pickCompetition(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
      await user.click(screen.getByRole('radio', { name: /대회·리그 참가팀/ }));
      await user.type(screen.getByLabelText('대회·리그'), '11월');
      await user.click(await screen.findByRole('option', { name }));
    }

    it('전체 회원 + 여성: 성별이 담긴 payload 를 확인창을 거쳐서만 보내고, 확인창에 대상·성별·예상 인원을 보여 준다', async () => {
      const user = userEvent.setup();
      render(<PushSendForm />);
      await user.click(screen.getByRole('radio', { name: /전체 회원/ }));
      await user.click(screen.getByRole('radio', { name: '여성' }));
      await user.type(screen.getByLabelText(/제목/), '여자부 안내');
      expect(audienceParams).toHaveBeenLastCalledWith({ target: 'broadcast', gender: 'female' });
      expect(screen.getByTestId('push-audience-estimate')).toHaveTextContent('예상 인원 22명 (공지 알림을 끈 2명 제외)');

      await user.click(screen.getByRole('button', { name: '전체 발송 확인' }));
      expect(sendMutate).not.toHaveBeenCalled();
      const dialog = await screen.findByRole('alertdialog', { name: '전체 발송 확인' });
      expect(within(dialog).getByText('전체 회원 · 여성 (성별 미입력 포함)')).toBeInTheDocument();
      expect(within(dialog).getByTestId('push-confirm-audience')).toHaveTextContent('알림함에 저장할 예상 인원 22명');
      await user.click(within(dialog).getByRole('button', { name: '전체 발송' }));

      expect(sendMutate.mock.calls[0][0]).toEqual({ target: 'broadcast', gender: 'female', title: '여자부 안내' });
    });

    it('성별을 고르지 않으면 payload 에 성별이 없고 "구분 없음" 으로 안내한다', async () => {
      const user = userEvent.setup();
      render(<PushSendForm />);
      await user.click(screen.getByRole('radio', { name: /전체 회원/ }));
      expect(screen.getByRole('radio', { name: '구분 없음' })).toHaveAttribute('aria-checked', 'true');
      await user.type(screen.getByLabelText(/제목/), '전체 공지');
      await user.click(screen.getByRole('button', { name: '전체 발송 확인' }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '전체 발송' }));
      expect(sendMutate.mock.calls[0][0].gender).toBeUndefined();
    });

    it('대회·리그 참가팀: 고른 대회를 id 로 보내고, 대회를 고르기 전에는 발송할 수 없다', async () => {
      const user = userEvent.setup();
      render(<PushSendForm />);
      await user.click(screen.getByRole('radio', { name: /대회·리그 참가팀/ }));
      await user.type(screen.getByLabelText(/제목/), '일정 안내');
      expect(screen.getByRole('button', { name: '참가팀 발송 확인' })).toBeDisabled();
      expect(screen.getByTestId('push-audience-estimate')).toHaveTextContent('대회·리그를 고르면 예상 인원을 보여 드려요.');

      await user.type(screen.getByLabelText('대회·리그'), '11월');
      await user.click(await screen.findByRole('option', { name: /11월 여자부 리그/ }));
      await user.click(screen.getByRole('radio', { name: '여성' }));
      expect(audienceParams).toHaveBeenLastCalledWith({ target: 'competition', competitionId: 'league-1', gender: 'female' });

      await user.click(screen.getByRole('button', { name: '참가팀 발송 확인' }));
      const dialog = await screen.findByRole('alertdialog', { name: '참가팀 발송 확인' });
      expect(within(dialog).getByText('11월 여자부 리그 참가 확정 팀의 팀원 · 여성 (성별 미입력 포함)')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: '참가팀 발송' }));

      expect(sendMutate.mock.calls[0][0]).toEqual({ target: 'competition', competitionId: 'league-1', gender: 'female', title: '일정 안내' });
    });

    it('대회와 리그를 한 목록에서 고를 수 있다', async () => {
      const user = userEvent.setup();
      render(<PushSendForm />);
      await pickCompetition(user, /11월 오픈 대회/);
      await user.type(screen.getByLabelText(/제목/), '안내');
      await user.click(screen.getByRole('button', { name: '참가팀 발송 확인' }));
      await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '참가팀 발송' }));
      expect(sendMutate.mock.calls[0][0].competitionId).toBe('tournament-1');
    });

    it('특정 유저 발송에는 성별 선택이 없고 payload 에도 성별이 실리지 않는다', async () => {
      const user = userEvent.setup();
      render(<PushSendForm />);
      await user.click(screen.getByRole('radio', { name: /전체 회원/ }));
      await user.click(screen.getByRole('radio', { name: '남성' }));
      await user.click(screen.getByRole('radio', { name: /특정 유저/ }));
      expect(screen.queryByRole('radio', { name: '남성' })).not.toBeInTheDocument();
      await pickUser(user);
      await user.type(screen.getByLabelText(/제목/), '개인 안내');
      await user.click(screen.getByRole('button', { name: '발송하기' }));
      expect(sendMutate.mock.calls[0][0].gender).toBeUndefined();
    });

    it('예상 인원을 불러오지 못하면 확인창에서 발송 버튼을 막고 다시 세기를 안내한다', async () => {
      audienceResult = { data: undefined, isError: true, refetch: vi.fn() };
      const user = userEvent.setup();
      render(<PushSendForm />);
      await user.click(screen.getByRole('radio', { name: /전체 회원/ }));
      await user.type(screen.getByLabelText(/제목/), '전체 공지');
      await user.click(screen.getByRole('button', { name: '전체 발송 확인' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByRole('button', { name: '전체 발송' })).toBeDisabled();
      expect(within(dialog).getByTestId('push-confirm-audience')).toHaveTextContent('불러오지 못했어요');
      await user.click(within(dialog).getByRole('button', { name: '취소' }));
      await user.click(screen.getByRole('button', { name: '다시 세기' }));
      expect(audienceResult.refetch).toHaveBeenCalledTimes(1);
      expect(sendMutate).not.toHaveBeenCalled();
    });
  });

  it('restores focus to the trigger button after the broadcast confirm modal closes (cancel path)', async () => {
    const user = userEvent.setup();
    render(<PushSendForm />);

    await user.click(screen.getByRole('radio', { name: /전체 회원/ }));
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

  it('앱 결과가 없는 예전 응답은 앱 쪽을 알 수 없으므로 토스트에 나가지 않았다고 붙이지 않는다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 1,
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
      expect(screen.getByText(/발송 완료/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/푸시는 나가지 않았어요\)/)).not.toBeInTheDocument();
    // 결과 카드의 웹 줄은 여전히 사실을 말한다.
    expect(within(screen.getByTestId('push-send-result')).getByText(/브라우저 알림을 켠 사용자가 없어/)).toBeInTheDocument();
    expect(within(screen.getByTestId('push-send-result')).queryByText(/앱 푸시/)).not.toBeInTheDocument();
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

  it('앱 푸시 일부가 실패하면 토스트도 error 톤으로 띄운다', async () => {
    sendMutate.mockImplementation((_payload, options) => {
      options.onSuccess({
        sent: 2,
        skipped: 0,
        failed: 0,
        push: {
          subscriptions: 0,
          delivered: 0,
          failed: 0,
          disabled: false,
          native: { devices: 2, delivered: 1, failed: 1, disabled: false },
        },
      });
    });
    const user = userEvent.setup();
    render(<PushSendForm />);

    await pickUser(user);
    await user.type(screen.getByLabelText(/제목/), '테스트 알림');
    await user.click(screen.getByRole('button', { name: '발송하기' }));

    const toast = await screen.findByText(/푸시 일부가 실패했어요/);
    // 알림 생성은 전부 성공했지만(failed 0) 푸시 전송이 실패했으므로 success 로 흘려보내지 않는다.
    expect(toast.closest('[role="status"]')?.querySelector('.bg-red-500') ?? toast.closest('.bg-red-500')).not.toBeNull();
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
