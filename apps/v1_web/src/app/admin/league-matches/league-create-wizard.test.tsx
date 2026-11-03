/**
 * 다음 시즌 만들기 — 지난 시즌 설정을 채운 리그 개설 화면(2026-11-03 사용자 선택 A안).
 * 처음부터 리그를 만드는 흐름은 `new/page.test.tsx` 가 지킨다.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useV1ActivePopup, useV1CreateLeagueMatch, useV1MasterRegions, useV1MasterSports, useV1Teams } from '@/hooks/use-v1-api';
import { LeagueCreateWizard, type LeagueCreatePrefill } from './league-create-wizard';

const { pushMock, savePeriodsMock, v1GetMock } = vi.hoisted(() => ({ pushMock: vi.fn(), savePeriodsMock: vi.fn(), v1GetMock: vi.fn() }));

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Get: v1GetMock,
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useSaveTournamentPeriodSettings: () => ({ mutateAsync: savePeriodsMock, isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin/league-matches/league-0/next-season',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1CreateLeagueMatch: vi.fn(),
  useV1MasterRegions: vi.fn(),
  useV1MasterSports: vi.fn(),
  useV1Teams: vi.fn(),
  useV1LineupSizeOptions: vi.fn(() => ({
    data: { sportId: 'sport-futsal', supported: true, options: [], defaultMaxPlayers: null, substitutionModes: [], defaultSubstitutionMode: null,
      defaultMaxSubstitutions: null, defaultPeriods: [{ label: '전반', durationMinutes: 20 }, { label: '후반', durationMinutes: 20 }] },
  })),
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const prefill: LeagueCreatePrefill = {
  previousLeagueId: 'league-0', previousTitle: '가을 풋살 리그', title: '가을 풋살 리그 다음 시즌',
  sportId: 'sport-futsal', regionId: 'region-1', genderCategory: 'mixed',
  entryFee: 30000, bankName: '팀밋은행', bankAccount: '110-123', bankHolder: '운영자',
  rosterLimit: { unlimited: false, minPlayers: '6', maxPlayers: '12' },
  maxTeams: '8', plannedFixtureCount: '14', periodMinutes: ['25', '25'],
};

function setup() {
  vi.mocked(useV1ActivePopup, { partial: true }).mockReturnValue({ data: undefined, isPending: false } as never);
  vi.mocked(useV1MasterSports, { partial: true }).mockReturnValue({
    data: [{ id: 'sport-futsal', name: '풋살', levels: [] }, { id: 'sport-soccer', name: '축구', levels: [] }],
  } as never);
  vi.mocked(useV1MasterRegions, { partial: true }).mockReturnValue({
    data: [{ id: 'region-seoul', name: '서울특별시', parentId: null, level: 1, children: [{ id: 'region-1', name: '중구', parentId: 'region-seoul', level: 2 }] }],
  } as never);
  vi.mocked(useV1Teams, { partial: true }).mockReturnValue({ data: { items: [], nextCursor: null }, isFetching: false } as never);
  const mutateAsync = vi.fn().mockResolvedValue({ leagueId: 'league-1', title: prefill.title, state: 'draft' });
  vi.mocked(useV1CreateLeagueMatch, { partial: true }).mockReturnValue({ mutateAsync, isPending: false } as never);
  v1GetMock.mockResolvedValue({ expectedVersion: 'v1', periods: [] });
  savePeriodsMock.mockResolvedValue(undefined);
  render(<Providers><LeagueCreateWizard prefill={prefill} /></Providers>);
  return mutateAsync;
}

const next = () => fireEvent.click(screen.getByRole('button', { name: '다음' }));

describe('LeagueCreateWizard — 다음 시즌 만들기', () => {
  it('지난 시즌을 알리고 종목을 잠근 채 설정을 채워 둔다 — 리그 체계 안내는 두지 않는다', () => {
    setup();
    expect(screen.getByRole('heading', { name: '다음 시즌 만들기' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('"가을 풋살 리그"의 다음 시즌으로 이어져요.');
    expect(screen.queryByRole('link', { name: '리그 체계 만들기' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('리그 이름')).toHaveValue('가을 풋살 리그 다음 시즌');
    expect(screen.getByLabelText('종목')).toBeDisabled();
    expect(screen.getByText('다음 시즌은 지난 시즌과 같은 종목이에요')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '혼성' })).toBeChecked();
  });

  it('기간만 정하면 확인까지 가고, 지난 시즌을 이어 만들며 옮긴 경기 시간을 저장한다', async () => {
    const mutateAsync = setup();
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2027-03-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2027-05-31' } });
    next();
    next();
    next();

    expect(screen.getByText('가을 풋살 리그', { selector: 'dd' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '리그 만들기' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      title: '가을 풋살 리그 다음 시즌',
      sportId: 'sport-futsal',
      regionId: 'region-1',
      genderCategory: 'mixed',
      previousLeagueId: 'league-0',
      entryFee: 30000,
      bankName: '팀밋은행', bankAccount: '110-123', bankHolder: '운영자',
      minPlayers: 6, maxPlayers: 12, maxTeams: 8, plannedFixtureCount: 14,
      teamIds: [],
    })));
    await waitFor(() => expect(savePeriodsMock).toHaveBeenCalledWith({
      tournamentId: 'league-1', expectedVersion: 'v1', periods: [{ durationMinutes: 25 }, { durationMinutes: 25 }],
    }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/league-matches/league-1'));
  });
});
