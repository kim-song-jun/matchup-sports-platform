import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { scheduleTimesKey } from '@/hooks/use-fixture-schedule-times';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1LeagueFixture } from '@/types/league-match';
import { LeagueFixtureScheduleModal } from './league-fixture-schedule-modal';

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1TournamentFields: () => ({ data: { items: [{ id: 'a', name: '등록 A구장', active: true }] }, isPending: false, isError: false, refetch: vi.fn() }),
  useV1PlaceSearch: () => ({ data: undefined, isFetching: false, isError: false }),
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentMatchPeriods: () => ({ data: undefined, isPending: true, isError: false }),
  useTournamentPeriodSettings: () => ({ data: undefined, isPending: true, isError: false }),
  useUpdateTournamentPeriodSettings: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
beforeEach(() => { mocks.submit.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const startAt = '2026-10-20T10:00:00Z';
const fixture = { teamMatchId: 'fixture', title: '1경기', homeTeamId: 'h', awayTeamId: 'a', startAt, placeName: '기존 구장', status: 'matched' } as V1LeagueFixture;
const clash = { ...fixture, teamMatchId: 'clash', title: '겹치는 경기', fieldId: 'a' } as V1LeagueFixture;

function show(scheduleFixtures: V1LeagueFixture[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(scheduleTimesKey('league', 'league-matches'), { items: [] });
  render(<QueryClientProvider client={client}><LeagueFixtureScheduleModal leagueId="league" fixture={fixture} scheduleFixtures={scheduleFixtures}
    defaultPlace={null} matchupLabel="홈 vs 원정" teams={[]} teamLockedReason={null} isSubmitting={false}
    onSubmit={mocks.submit} onPeriodsSaved={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>);
  fireEvent.change(screen.getByRole('combobox', { name: '등록된 경기장(필드)' }), { target: { value: 'a' } });
  fireEvent.click(screen.getByRole('button', { name: '저장' }));
}

describe('리그 경기 수정창의 시간·구장 겹침 확인', () => {
  it.each([false, true])('겹치면 window.confirm 이 아니라 앱 확인 창을 띄운다 (그대로 저장: %s)', async accepted => {
    const native = vi.spyOn(window, 'confirm');
    try {
      show([fixture, clash]);
      const dialog = await screen.findByRole('dialog', { name: '시간·구장이 겹쳐요' });
      expect(native).not.toHaveBeenCalled();
      expect(dialog).toHaveTextContent('겹치는 경기');
      expect(mocks.submit).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: accepted ? '그대로 저장' : '취소' }));
      if (accepted) await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ fieldId: 'a' }));
      else await waitFor(() => expect(screen.queryByRole('dialog', { name: '시간·구장이 겹쳐요' })).toBeNull());
      expect(mocks.submit).toHaveBeenCalledTimes(accepted ? 1 : 0);
    } finally { native.mockRestore(); }
  });
  it('겹치는 경기가 없으면 확인 창 없이 바로 저장한다', async () => {
    show([fixture]);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith({ fieldId: 'a' }));
    expect(screen.queryByRole('dialog', { name: '시간·구장이 겹쳐요' })).toBeNull();
  });
});
