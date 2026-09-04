import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueRegistrationsClient from './league-registrations-client';

const openMutate = vi.fn();
const leagueData: { registrationOpen: boolean; registrationDeadlineAt: string | null; title: string } = {
  registrationOpen: false,
  registrationDeadlineAt: null,
  title: '가을 리그',
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => ({ data: leagueData }),
  useV1OpenLeagueRegistration: () => ({ mutate: openMutate, isPending: false }),
}));

// 목록은 이 화면의 관심사가 아니다 — 훅을 여덟 개 넘게 쓰므로 여기서는 자리만 확인한다.
vi.mock('@/app/admin/tournaments/[id]/registrations-tab', () => ({
  RegistrationsTab: ({ tournamentId }: { tournamentId: string }) => (
    <div data-testid="registrations-tab">{tournamentId}</div>
  ),
}));

describe('리그 참가 신청 관리', () => {
  beforeEach(() => {
    openMutate.mockClear();
    leagueData.registrationOpen = false;
    leagueData.registrationDeadlineAt = null;
  });

  it('마감이 없으면 "신청 안 받는 중" 이고, 왜 입구가 없는지 알려 준다', () => {
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
    fireEvent.change(screen.getByLabelText(/신청 마감/), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
    expect(openMutate).not.toHaveBeenCalled();
  });

  it('미래 시각이면 ISO 로 보낸다', () => {
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // `datetime-local` 은 로컬 시각 문자열이다 — 리터럴로 쓰면 TZ 가 다른 CI 에서 결과가 갈린다.
    const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16);
    fireEvent.change(screen.getByLabelText(/신청 마감/), { target: { value: local } });
    fireEvent.click(screen.getByRole('button', { name: '신청 열기' }));
    expect(openMutate).toHaveBeenCalledTimes(1);
    expect(openMutate.mock.calls[0][0]).toEqual({ registrationDeadlineAt: new Date(local).toISOString() });
  });

  it('이미 열려 있으면 버튼이 "마감 변경" 이다 — 같은 경로로 연장한다', () => {
    leagueData.registrationOpen = true;
    leagueData.registrationDeadlineAt = '2026-09-20T14:59:00.000Z';
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(screen.getByText('모집 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '마감 변경' })).toBeInTheDocument();
  });
});
