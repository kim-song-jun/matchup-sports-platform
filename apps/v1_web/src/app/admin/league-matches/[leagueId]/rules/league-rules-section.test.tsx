import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueRulesSection from './league-rules-section';

const { leagueQuery, periodSettings, patchPeriods } = vi.hoisted(() => ({
  leagueQuery: { value: {} as Record<string, unknown> },
  periodSettings: { value: {} as Record<string, unknown> },
  patchPeriods: vi.fn(async () => {}),
}));

vi.mock('@/hooks/use-admin-can-write', () => ({ useAdminCanWrite: () => true }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminLeagueMatch: () => leagueQuery.value,
  useV1UpdateLeagueDiscipline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => periodSettings.value,
  usePatchPeriods: () => patchPeriods,
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
      kind: 'regular_league',
      stageOverrides: [], groupOverrides: [],
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  };
}

describe('LeagueRulesSection', () => {
  beforeEach(() => {
    patchPeriods.mockClear();
    leagueQuery.value = {
      data: { leagueId: 'league-1', yellowAccumulationLimit: null, redCardSuspensionMatches: null, fixtures: [] },
    };
    periodSettings.value = periodSettingsOf([25, 25]);
  });

  it('경기 시간과 출전정지 규정을 한 화면에 둔다', () => {
    render(<LeagueRulesSection leagueId="league-1" />);

    expect(within(screen.getByRole('region', { name: '경기 시간' })).getByText('전·후반 25분 / 25분')).toBeInTheDocument();
    expect(screen.getByText('출전정지 규정')).toBeInTheDocument();
  });

  it('경기 시간을 수정 시트에서 바꾸면 바뀐 시간으로 저장을 부른다', async () => {
    render(<LeagueRulesSection leagueId="league-1" />);

    fireEvent.click(within(screen.getByRole('region', { name: '경기 시간' })).getByRole('button', { name: '경기 시간 수정' }));
    const sheet = within(screen.getByRole('dialog', { name: '경기 시간' }));
    fireEvent.change(sheet.getByLabelText('전반'), { target: { value: '30' } });
    fireEvent.click(sheet.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(patchPeriods).toHaveBeenCalledWith({ periods: [{ durationMinutes: 30 }, { durationMinutes: 25 }] }));
  });

  it('리그 정보가 오기 전에는 아무것도 그리지 않는다 — 불러오는 중·실패는 셸이 보여 준다', () => {
    leagueQuery.value = { data: undefined };
    const { container } = render(<LeagueRulesSection leagueId="league-1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
