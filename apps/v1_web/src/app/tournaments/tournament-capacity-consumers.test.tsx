import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentCard } from './tournament-card';
import { TournamentDetailView } from './[id]/tournament-detail-client';
import { TournamentApplyPageClient } from './[id]/apply/tournament-apply-client';
import { MyRegistrationPageClient } from './[id]/my/my-registration-client';
import {
  capacityCancelledRegistration, capacityTeam, capacityTournament, type CapacityTournamentFixture,
} from './tournament-capacity.fixtures';

const api = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(), useV1Tournament: vi.fn(), useV1MyTeams: vi.fn(), useV1MyRegistrations: vi.fn(),
  useV1Registration: vi.fn(), useV1CreateRegistration: vi.fn(), useV1SubmitRegistration: vi.fn(),
  useV1CurrentTerms: vi.fn(), useV1TournamentPlayers: vi.fn(), useV1CancelRegistrationRequest: vi.fn(),
  useV1WithdrawCancelRegistrationRequest: vi.fn(), useV1Team: vi.fn(),
}));
vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()), ...api,
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/my', useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/tournaments/tournament-inquiry-section', () => ({ TournamentInquirySection: () => null }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  // 순위표는 정원 계약과 별개이며 네트워크 응답 없이 로딩 상태로 유지해요.
  v1Get: vi.fn(() => new Promise(() => {})),
}));

function renderPage(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const scenarios = [
  { name: '확정 팀으로 가득 찬 리그', overrides: { maxTeams: 6, confirmedCount: 6, pendingPaymentCount: 0 }, limit: 6, occupied: 6, full: true },
  { name: '입금대기가 마지막 자리를 예약한 리그', overrides: { maxTeams: 6, confirmedCount: 4, pendingPaymentCount: 2 }, limit: 6, occupied: 6, full: true },
  { name: '활성 신청 999건과 팀당 선수 상한은 자리를 차지하지 않는 리그', overrides: { maxTeams: 6 }, limit: 6, occupied: 2, full: false },
  { name: '거울 teamCount보다 참가팀이 많은 무제한 리그', overrides: { maxTeams: null, teamCount: 1, confirmedCount: 20, pendingPaymentCount: 7 }, limit: null, occupied: 27, full: false },
  { name: 'maxTeams가 커도 teamCount로 마감하는 대회', overrides: { kind: 'regular_tournament', format: 'league', teamCount: 6, maxTeams: 30, confirmedCount: 4, pendingPaymentCount: 2 }, limit: 6, occupied: 6, full: true },
  { name: 'maxTeams가 작아도 teamCount가 남아 있는 대회', overrides: { kind: 'regular_tournament', format: 'league', teamCount: 20, maxTeams: 2, confirmedCount: 3, pendingPaymentCount: 1 }, limit: 20, occupied: 4, full: false },
] satisfies ReadonlyArray<{
  readonly name: string; readonly overrides: Partial<CapacityTournamentFixture>;
  readonly limit: number | null; readonly occupied: number; readonly full: boolean;
}>;

describe.each(scenarios)('공개 정원 소비자 — $name', ({ overrides, limit, occupied, full }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    api.useV1Tournament.mockReturnValue({ data: capacityTournament(overrides), isLoading: false, isError: false });
    api.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
    api.useV1MyTeams.mockReturnValue({ data: { items: [capacityTeam] }, isLoading: false, isError: false });
    api.useV1MyRegistrations.mockReturnValue({ data: [capacityCancelledRegistration], isLoading: false, isError: false });
    api.useV1Registration.mockReturnValue({ data: undefined });
    api.useV1CurrentTerms.mockReturnValue({ data: { ready: true, items: [] }, isPending: false, isError: false });
    api.useV1CreateRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    api.useV1SubmitRegistration.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    api.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    api.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    api.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    api.useV1Team.mockReturnValue({ data: undefined });
  });

  it('목록 카드는 실제 참가팀 정원과 별개로 리그 수명주기를 표시해요', () => {
    const item: V1TournamentListItem = capacityTournament(overrides);
    render(<TournamentCard item={item} />);
    const label = item.kind === 'regular_league' ? '모집완료' : full ? '모집 마감' : '모집 중';
    expect(screen.getByRole('link')).toHaveAccessibleName(`${item.title} — 풋살 — ${label}`);
    if (limit === null) {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(screen.getByText(`${occupied}팀 참가`)).toBeInTheDocument();
    } else {
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', String(limit));
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(occupied));
    }
  });

  it('상세가 참가팀 정원과 팀당 선수 상한을 별도로 보여 주고 가득 차면 신청 링크를 닫아요', () => {
    render(<TournamentDetailView tournament={capacityTournament(overrides)} myRegistration={null} />);
    expect(screen.getAllByText('팀당 1~2명').length).toBeGreaterThan(0);
    if (limit === null) {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    } else {
      const bars = screen.getAllByRole('progressbar');
      expect(bars.length).toBeGreaterThan(0);
      for (const bar of bars) {
        expect(bar).toHaveAttribute('aria-valuemax', String(limit));
        expect(bar).toHaveAttribute('aria-valuenow', String(occupied));
      }
    }
    if (full) {
      expect(screen.getAllByRole('button', { name: '모집 마감' }).length).toBeGreaterThan(0);
      expect(screen.queryByRole('link', { name: '참가 신청하기' })).not.toBeInTheDocument();
    } else {
      expect(screen.getAllByRole('link', { name: '참가 신청하기' }).length).toBeGreaterThan(0);
    }
  });

  it('신청 화면의 다음 단계 활성 여부가 실제 남은 참가팀 자리와 같아요', () => {
    renderPage(<TournamentApplyPageClient tournamentId="tournament-1" />);
    expect(screen.getByRole('radiogroup', { name: '참가 팀 선택' })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^다음 단계/ });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      if (full) expect(button).toBeDisabled();
      else expect(button).toBeEnabled();
    }
    if (full) expect(screen.getAllByText(/정원이 가득/).length).toBeGreaterThan(0);
    else expect(screen.queryByText(/정원이 가득/)).not.toBeInTheDocument();
  });

  it('내 신청 허브가 유한 정원을 설명하고 자리가 없으면 취소 팀의 재신청을 닫아요', () => {
    const { container } = renderPage(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(screen.getByText(overrides.kind === 'regular_tournament' ? '팀별 대회 신청' : '팀별 리그 참가')).toBeInTheDocument();
    if (limit !== null) {
      expect(screen.getByText(new RegExp(`^정원 확정 .* / 총 ${limit}팀$`))).toBeInTheDocument();
      if (full) expect(screen.getAllByText(/정원이 가득/).length).toBeGreaterThan(0);
      else expect(screen.getByText(`${limit - occupied}팀 더 신청할 수 있어요.`)).toBeInTheDocument();
    } else {
      expect(container.textContent).not.toContain('더 신청할 수 있어요');
    }
    const reapply = screen.queryByRole('link', { name: /다시 신청/ });
    if (full) expect(reapply).not.toBeInTheDocument();
    else expect(reapply).toHaveAttribute('href', expect.stringContaining('/tournaments/tournament-1/apply?team=team-1'));
  });
});
