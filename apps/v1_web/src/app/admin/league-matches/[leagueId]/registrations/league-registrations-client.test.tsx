import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueRegistrationsClient from './league-registrations-client';

const openMutate = vi.fn();
const feeMutateAsync = vi.fn();
const feeMutate = vi.fn();
const leagueData: {
  isPublic: boolean;
  state: 'draft' | 'active' | 'completed';
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
  title: string;
  entryFee: number;
  entryFeeConfiguredAt: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  activeRegistrationCount: number;
} = {
  isPublic: true,
  state: 'draft',
  registrationOpen: false,
  registrationDeadlineAt: null,
  title: '가을 리그',
  entryFee: 0,
  entryFeeConfiguredAt: '2026-10-01T00:00:00.000Z',
  bankName: null,
  bankAccount: null,
  bankHolder: null,
  activeRegistrationCount: 0,
};

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => ({ data: leagueData }),
  useV1OpenLeagueRegistration: () => ({ mutate: openMutate, isPending: false }),
  useV1UpdateLeagueEntryFee: () => ({ mutate: feeMutate, mutateAsync: feeMutateAsync, isPending: false }),
}));

// 목록은 이 화면의 관심사가 아니다 — 훅을 여덟 개 넘게 쓰므로 여기서는 자리만 확인한다.
vi.mock('@/app/admin/tournaments/[id]/registrations-tab', () => ({
  RegistrationsTab: ({ tournamentId }: { tournamentId: string }) => (
    <div data-testid="registrations-tab">{tournamentId}</div>
  ),
}));

function chooseCustom() {
  fireEvent.click(screen.getByRole('button', { name: '직접 정하기' }));
}

describe('리그 참가 신청 관리', () => {
  beforeEach(() => {
    openMutate.mockClear();
    feeMutate.mockReset();
    feeMutateAsync.mockReset();
    leagueData.state = 'draft';
    leagueData.registrationOpen = false;
    leagueData.registrationDeadlineAt = null;
    leagueData.entryFee = 0;
    leagueData.entryFeeConfiguredAt = '2026-10-01T00:00:00.000Z';
    leagueData.bankName = null;
    leagueData.bankAccount = null;
    leagueData.bankHolder = null;
    leagueData.activeRegistrationCount = 0;
  });

  it('끝난 리그는 마감이 미래여도 "마감됐어요" 라고 하지 않는다', () => {
    // Copilot 리뷰가 잡은 자리다. 끝난 리그의 마감은 보통 미래로 남아 있는데, 닫힌 이유를
    // 안 가르면 화면이 **마감 탓**으로 말한다 → 운영자는 마감을 다시 넣어 보고 서버가
    // 409 `LEAGUE_REGISTRATION_NOT_ALLOWED` 로 막는다. 화면이 원인을 숨긴 것이다.
    leagueData.state = 'completed';
    leagueData.registrationOpen = false;
    leagueData.registrationDeadlineAt = '2099-01-01T00:00:00.000Z';
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByText('끝났거나 취소된 리그라 신청을 받지 않아요.')).toBeInTheDocument();
    expect(screen.queryByText(/마감됐어요/)).not.toBeInTheDocument();
  });

  it('진행중 리그는 마감이 지났으면 마감 탓이라고 말한다 — 마감을 바꾸면 다시 열린다', () => {
    leagueData.state = 'active';
    leagueData.registrationOpen = false;
    leagueData.registrationDeadlineAt = '2020-01-01T00:00:00.000Z';
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByText(/신청이 마감됐어요/)).toBeInTheDocument();
  });

  it('안 받는 중이고 마감도 없으면, 왜 입구가 없는지 알려 준다', () => {
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByText('신청 안 받는 중')).toBeInTheDocument();
    expect(
      screen.getByText('마감을 정해야 신청을 받아요. 정하기 전에는 팀장 화면에 신청 입구가 보이지 않아요.'),
    ).toBeInTheDocument();
  });

  it('마감이 없으면 열려 있을 수 없다 — 판정자가 마감 하나다', () => {
    // 2026-09-04 사용자 확정 이후 `status` 는 수동주기 표시 전용이고 신청 판정은 마감이 한다.
    // 정본 §6 이 대가를 명시한다: "안 정하면(null) 그 리그는 신청을 안 받는다."
    // 앞선 PR 에서 내가 이 계약을 반대로("기한 없이 열림") 적었던 것을 정본대로 되돌린다.
    leagueData.registrationOpen = false;
    leagueData.registrationDeadlineAt = null;
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByText('신청 안 받는 중')).toBeInTheDocument();
    expect(
      screen.getByText('마감을 정해야 신청을 받아요. 정하기 전에는 팀장 화면에 신청 입구가 보이지 않아요.'),
    ).toBeInTheDocument();
  });

  it('신청 목록에 리그 id 를 그대로 넘긴다 — 어드민 신청 API 는 이미 리그를 받는다', () => {
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByTestId('registrations-tab')).toHaveTextContent('league-1');
  });

  it('지난 시각으로는 열지 않는다 — 열자마자 닫힌 리그가 된다', () => {
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    chooseCustom();
    fireEvent.change(screen.getByLabelText(/신청 마감 \(한국/), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
    expect(openMutate).not.toHaveBeenCalled();
  });

  it('마감이 지금과 정확히 같은 순간이면 막는다 — 서버가 그 순간을 422 로 거부한다', () => {
    // 서버 조건은 `deadline <= now` 다. 화면이 `<` 를 쓰면 이 한 순간만 통과시키고
    // 서버가 거부해, 운영자는 값을 바꾸지 않았는데 실패를 본다.
    //
    // **시계를 고정해야 진짜 경계를 잡는다.** `datetime-local` 은 분 단위라 "지금" 을
    // 분으로 자르면 초가 잘려 **항상 지금보다 이르다** — 그러면 `<` 로도 막혀서 이 테스트가
    // 부등호를 구분하지 못한다(처음에 그렇게 썼다가 변이가 red 를 안 내서 잡았다).
    // 초·밀리초가 0 인 시각으로 고정하면 입력값과 `Date.now()` 가 **정확히 같아진다**.
    vi.useFakeTimers();
    try {
      const at = new Date(2026, 8, 20, 14, 59, 0, 0); // 로컬 시각, 초·밀리초 0
      vi.setSystemTime(at);
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      chooseCustom();
      const local = new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
      // 전제 확인: 이 입력값이 정말 "지금" 과 같은 순간이다.
      expect(new Date(local).getTime()).toBe(Date.now());
      fireEvent.change(screen.getByLabelText(/신청 마감 \(한국/), { target: { value: local } });
      fireEvent.click(screen.getByRole('button', { name: /신청 열기|마감 변경/ }));
      expect(openMutate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('미래 시각이면 입력값을 KST 로 해석한 ISO 로 보낸다', () => {
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    chooseCustom();
    // 테스트 러너는 TZ=UTC 라 브라우저 로컬 해석이면 23:59Z 가 된다 — KST 면 14:59Z.
    fireEvent.change(screen.getByLabelText(/신청 마감 \(한국/), { target: { value: '2099-10-01T23:59' } });
    fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
    expect(openMutate).toHaveBeenCalledTimes(1);
    expect(openMutate.mock.calls[0][0]).toEqual({ registrationDeadlineAt: '2099-10-01T14:59:00.000Z' });
  });

  it('이미 열려 있으면 버튼이 "마감 변경" 이다 — 같은 경로로 연장한다', () => {
    leagueData.registrationOpen = true;
    leagueData.registrationDeadlineAt = '2026-09-20T14:59:00.000Z';
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByText('모집 중')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7일 뒤까지' }));
    expect(screen.getByRole('button', { name: '마감 변경' })).toBeInTheDocument();
  });

  describe('신청 마감 빠른 선택 칩', () => {
    afterEach(() => vi.useRealTimers());

    it('아무것도 안 고르면 입력과 실행 버튼이 없다', () => {
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      expect(screen.queryByLabelText(/신청 마감 \(/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /신청 열기|다시 열기|마감 변경/ })).not.toBeInTheDocument();
    });

    it('칩을 고르면 미리보기가 나오고, 그 프리셋 시각(KST 23:59)이 서버에 그대로 간다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-07T03:00:00Z')); // KST 10/07 낮
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      const group = screen.getByRole('group', { name: '신청 마감 빠른 선택' });
      fireEvent.click(within(group).getByRole('button', { name: '7일 뒤까지' }));

      expect(within(group).getByRole('button', { name: '7일 뒤까지' })).toHaveAttribute('aria-pressed', 'true');
      expect(within(group).getByRole('button', { name: '3일 뒤까지' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('status')).toHaveTextContent('2026년 10월 14일');
      expect(screen.getByRole('status')).toHaveTextContent('오후 11:59까지 받아요');
      // 프리셋은 날짜 입력을 거치지 않는다.
      expect(screen.queryByLabelText(/신청 마감 \(/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
      expect(openMutate.mock.calls[0][0]).toEqual({ registrationDeadlineAt: '2026-10-14T14:59:00.000Z' });
    });

    it('3일을 고르면 3일 뒤 시각이 간다 — 칩마다 값이 다르다', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-07T03:00:00Z'));
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      fireEvent.click(screen.getByRole('button', { name: '3일 뒤까지' }));
      fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
      expect(openMutate.mock.calls[0][0]).toEqual({ registrationDeadlineAt: '2026-10-10T14:59:00.000Z' });
    });

    it('"직접 정하기"만 날짜 입력을 보여 준다', () => {
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      chooseCustom();
      expect(screen.getByLabelText(/신청 마감 \(/)).toBeInTheDocument();
    });

    it('마감이 지난 리그는 "다시 열기", 열린 리그는 "마감 변경", 마감 없는 리그는 "신청 열기"', () => {
      leagueData.registrationDeadlineAt = '2020-01-01T00:00:00.000Z';
      const { unmount } = render(<LeagueRegistrationsClient leagueId="league-1" />);
      fireEvent.click(screen.getByRole('button', { name: '3일 뒤까지' }));
      expect(screen.getByRole('button', { name: '다시 열기' })).toBeInTheDocument();
      unmount();

      leagueData.registrationDeadlineAt = null;
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      fireEvent.click(screen.getByRole('button', { name: '3일 뒤까지' }));
      expect(screen.getByRole('button', { name: '신청 열기' })).toBeInTheDocument();
    });

    it('끝난 리그는 칩도 버튼도 없다', () => {
      leagueData.state = 'completed';
      leagueData.registrationDeadlineAt = '2099-01-01T00:00:00.000Z';
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      expect(screen.queryByRole('group', { name: '신청 마감 빠른 선택' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /신청 열기|다시 열기|마감 변경/ })).not.toBeInTheDocument();
    });
  });

  describe('참가비를 정하지 않고 여는 경우의 확인', () => {
    const openWith7Days = () => {
      fireEvent.click(screen.getByRole('button', { name: '7일 뒤까지' }));
      fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
    };

    it('미설정이면 열기 전에 확인창이 뜨고, 확인 전에는 아무것도 보내지 않는다', () => {
      leagueData.entryFeeConfiguredAt = null;
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      openWith7Days();
      expect(screen.getByRole('dialog')).toHaveTextContent('참가비가 설정되지 않아 무료로 열려요');
      expect(openMutate).not.toHaveBeenCalled();
      expect(feeMutateAsync).not.toHaveBeenCalled();
    });

    it('설정된 리그는 확인창 없이 바로 연다 (대조)', () => {
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      openWith7Days();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(openMutate).toHaveBeenCalledTimes(1);
    });

    it('이미 열려 있는 미설정 리그의 마감 변경은 확인창이 없다 (대조)', () => {
      leagueData.entryFeeConfiguredAt = null;
      leagueData.registrationOpen = true;
      leagueData.registrationDeadlineAt = '2099-01-01T00:00:00.000Z';
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      fireEvent.click(screen.getByRole('button', { name: '7일 뒤까지' }));
      fireEvent.click(screen.getByRole('button', { name: '마감 변경' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(openMutate).toHaveBeenCalledTimes(1);
    });

    it('"무료로 열기"는 0원 확정이 성공한 뒤에만 열기를 호출한다', async () => {
      leagueData.entryFeeConfiguredAt = null;
      feeMutateAsync.mockResolvedValue({});
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      openWith7Days();
      fireEvent.click(screen.getByRole('button', { name: '무료로 열기' }));

      await waitFor(() => expect(openMutate).toHaveBeenCalledTimes(1));
      expect(feeMutateAsync).toHaveBeenCalledWith({ entryFee: 0 });
      expect(feeMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(openMutate.mock.invocationCallOrder[0]);
    });

    it('0원 확정이 실패하면 열기를 호출하지 않는다', async () => {
      leagueData.entryFeeConfiguredAt = null;
      feeMutateAsync.mockRejectedValue(new Error('boom'));
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      openWith7Days();
      fireEvent.click(screen.getByRole('button', { name: '무료로 열기' }));

      await waitFor(() => expect(feeMutateAsync).toHaveBeenCalled());
      expect(openMutate).not.toHaveBeenCalled();
    });

    it('"참가비 먼저 정할게요"는 열기도 저장도 하지 않고 참가비 입력으로 포커스를 보낸다', () => {
      leagueData.entryFeeConfiguredAt = null;
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      openWith7Days();
      fireEvent.click(screen.getByRole('button', { name: '참가비 먼저 정할게요' }));

      expect(openMutate).not.toHaveBeenCalled();
      expect(feeMutateAsync).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByLabelText('팀당 참가비 (원)')).toHaveFocus();
    });

    it('이어받은 유료 설정은 0원으로 덮지 않고 그 값 그대로 확정한다', async () => {
      leagueData.entryFeeConfiguredAt = null;
      leagueData.entryFee = 70000;
      leagueData.bankName = '국민은행';
      leagueData.bankAccount = '123-456-789012';
      leagueData.bankHolder = '팀밋';
      feeMutateAsync.mockResolvedValue({});
      render(<LeagueRegistrationsClient leagueId="league-1" />);
      openWith7Days();
      expect(screen.getByRole('dialog')).toHaveTextContent('이어받은 참가비로 열려요');
      fireEvent.click(screen.getByRole('button', { name: '이대로 열기' }));

      await waitFor(() => expect(openMutate).toHaveBeenCalledTimes(1));
      expect(feeMutateAsync).toHaveBeenCalledWith({
        entryFee: 70000,
        bankName: '국민은행',
        bankAccount: '123-456-789012',
        bankHolder: '팀밋',
      });
    });
  });

  it('신청 준비 순서는 텍스트로 상태를 말한다', () => {
    leagueData.entryFeeConfiguredAt = null;
    leagueData.activeRegistrationCount = 2;
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    const steps = within(screen.getByRole('list', { name: '신청 준비 순서' })).getAllByRole('listitem');
    expect(steps.map((li) => li.textContent)).toEqual(['① 참가비 설정 필요', '② 신청 열기 대기', '③ 직접 신청 2팀']);
  });
});
