import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueRegistrationsClient from './league-registrations-client';

const leagueData: {
  isPublic: boolean;
  state: 'draft' | 'active' | 'completed' | 'on_hold';
  lifecycleStatus: string;
  registrationOpen: boolean;
  registrationDeadlineAt: string | null;
  title: string;
  entryFee: number;
  entryFeeConfiguredAt: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankHolder: string | null;
  activeRegistrationCount: number;
  confirmedRegistrationCount: number;
} = {
  isPublic: true,
  state: 'draft',
  lifecycleStatus: 'draft',
  registrationOpen: false,
  registrationDeadlineAt: null,
  title: '가을 리그',
  entryFee: 0,
  entryFeeConfiguredAt: '2026-10-01T00:00:00.000Z',
  bankName: null,
  bankAccount: null,
  bankHolder: null,
  activeRegistrationCount: 0,
  confirmedRegistrationCount: 0,
};

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => ({ data: leagueData }),
  useV1UpdateLeagueEntryFee: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

// 목록은 이 화면의 관심사가 아니다 — 훅을 여덟 개 넘게 쓰므로 여기서는 자리만 확인한다.
vi.mock('@/app/admin/tournaments/[id]/registrations-tab', () => ({
  RegistrationsTab: ({ tournamentId }: { tournamentId: string }) => (
    <div data-testid="registrations-tab">{tournamentId}</div>
  ),
}));

/**
 * 2026-10-27: 접수를 여닫는 버튼은 리그 상단으로 옮겼다(대회 어드민과 같은 자리). 이 화면은 참가비·접수 상태·
 * 신청 목록만 보여 주고, 마감 날짜를 고르는 옛 '신청 받기' 카드와 '지금 마감' 카드는 없다.
 */
describe('리그 참가 신청 관리', () => {
  beforeEach(() => {
    leagueData.state = 'draft';
    leagueData.lifecycleStatus = 'draft';
    leagueData.registrationOpen = false;
    leagueData.registrationDeadlineAt = null;
    leagueData.entryFeeConfiguredAt = '2026-10-01T00:00:00.000Z';
    leagueData.activeRegistrationCount = 0;
  });

  it('여닫는 버튼 없이 상태와 다음 행동만 안내한다', () => {
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    const status = screen.getByRole('region', { name: '접수 상태' });
    expect(within(status).getByText('초안')).toBeInTheDocument();
    expect(within(status).getByText("아직 접수를 시작하지 않았어요. 리그 위의 '접수 시작하기'를 누르면 신청을 받아요.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /접수 시작|접수 마감|신청 열기|지금 마감/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '신청 마감 빠른 선택' })).not.toBeInTheDocument();
    expect(screen.getByTestId('registrations-tab')).toHaveTextContent('league-1');
  });

  it('접수 중이면 언제까지 받는지 말하고 준비 순서도 접수 중으로 바뀐다', () => {
    leagueData.lifecycleStatus = 'open';
    leagueData.registrationOpen = true;
    leagueData.registrationDeadlineAt = '2026-09-30T02:00:00.000Z';
    leagueData.activeRegistrationCount = 2;
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    const status = screen.getByRole('region', { name: '접수 상태' });
    expect(within(status).getByText('신청 받는 중')).toBeInTheDocument();
    expect(within(status).getByText(/까지 신청을 받아요\./)).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: '신청 준비 순서' });
    expect(within(steps).getByText('② 접수 중')).toBeInTheDocument();
    expect(within(steps).getByText('③ 직접 신청 2팀')).toBeInTheDocument();
  });

  it('시작한 리그는 신청을 다시 열 수 없다고 알려 준다', () => {
    leagueData.state = 'active';
    leagueData.lifecycleStatus = 'in_progress';
    leagueData.registrationDeadlineAt = '2099-01-01T00:00:00.000Z';
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    const status = screen.getByRole('region', { name: '접수 상태' });
    expect(within(status).getByText('시즌 진행 중')).toBeInTheDocument();
    expect(within(status).getByText('시작한 리그라 신청을 받지 않아요. 팀은 참가팀 관리에서 직접 넣어 주세요.')).toBeInTheDocument();
  });

  it('참가비를 정하지 않았으면 준비 순서가 참가비 설정을 먼저 짚는다', () => {
    leagueData.entryFeeConfiguredAt = null;
    render(<LeagueRegistrationsClient leagueId="league-1" />);
    expect(within(screen.getByRole('list', { name: '신청 준비 순서' })).getByText('① 참가비 설정 필요')).toBeInTheDocument();
  });
});
