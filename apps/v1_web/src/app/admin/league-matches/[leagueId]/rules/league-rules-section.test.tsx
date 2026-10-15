import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueRulesSection from './league-rules-section';

const { leagueQuery, periodSettings, updatePeriods } = vi.hoisted(() => ({
  leagueQuery: { value: {} as Record<string, unknown> },
  periodSettings: { value: {} as Record<string, unknown> },
  updatePeriods: vi.fn(),
}));

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => leagueQuery.value,
  useV1UpdateLeagueDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => periodSettings.value,
  useUpdateTournamentPeriodSettings: () => ({ mutate: updatePeriods, isPending: false, error: null }),
}));

function periodSettingsOf(minutes: number[]) {
  return {
    data: {
      tournamentId: 'league-1',
      competitionConfigVersionId: 'cfg-1',
      expectedVersion: 'v-1',
      periods: minutes.map((durationMinutes, i) => ({ code: `P${i}`, label: `${i + 1}`, durationMinutes, extraTime: false })),
      legacyPeriodCount: null,
      requiresDurationInput: false,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
}

describe('LeagueRulesSection', () => {
  beforeEach(() => {
    updatePeriods.mockClear();
    leagueQuery.value = {
      data: { leagueId: 'league-1', yellowAccumulationLimit: null, redCardSuspensionMatches: null, fixtures: [] },
    };
    periodSettings.value = periodSettingsOf([25, 25]);
  });

  it('피리어드 설정과 출전정지 규정을 한 화면에 둔다', () => {
    render(<LeagueRulesSection leagueId="league-1" />);

    expect(screen.getByRole('region', { name: '피리어드 설정' })).toBeInTheDocument();
    expect(screen.getByText('출전정지 규정')).toBeInTheDocument();
  });

  it('피리어드 설정에서 수정하면 저장 API(expectedVersion 포함)를 호출한다', () => {
    render(<LeagueRulesSection leagueId="league-1" />);

    const section = screen.getByRole('region', { name: '피리어드 설정' });
    fireEvent.click(within(section).getByRole('button', { name: '수정' }));
    fireEvent.change(within(section).getByLabelText('전반'), { target: { value: '30' } });
    fireEvent.click(within(section).getByRole('button', { name: '저장' }));

    expect(updatePeriods).toHaveBeenCalledWith(
      { expectedVersion: 'v-1', periods: [{ durationMinutes: 30 }, { durationMinutes: 25 }] },
      expect.any(Object),
    );
  });

  it('리그 정보가 오기 전에는 아무것도 그리지 않는다 — 불러오는 중·실패는 셸이 보여 준다', () => {
    leagueQuery.value = { data: undefined };
    const { container } = render(<LeagueRulesSection leagueId="league-1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
