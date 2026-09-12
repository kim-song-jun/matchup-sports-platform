import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentPeriodSettingsEditor } from './tournament-period-settings-editor';
import type { TournamentPeriodSettingsResponse } from '@/hooks/use-tournament-period-settings';

const { state } = vi.hoisted(() => {
  const settings: TournamentPeriodSettingsResponse = {
      tournamentId: 'tournament-1',
      competitionConfigVersionId: 'config-1',
      expectedVersion: 'version-1',
      periods: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
      ],
      legacyPeriodCount: null,
      requiresDurationInput: false,
  };
  return { state: { settings, mutate: vi.fn(), refetch: vi.fn() } };
});

vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => ({
    data: state.settings,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: state.refetch,
  }),
  useUpdateTournamentPeriodSettings: () => ({ mutate: state.mutate, isPending: false, error: null }),
}));

describe('TournamentPeriodSettingsEditor', () => {
  it('hydrates current durations and sends a durations-only update', () => {
    state.mutate.mockClear();
    state.settings = { ...state.settings, expectedVersion: 'version-1', periods: [
      { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
      { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
    ], legacyPeriodCount: null, requiresDurationInput: false };
    const showToast = vi.fn();
    const view = render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    expect(screen.getByText('2개 · 45분 / 45분')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    // A background query refresh must not silently change the CAS token for this draft.
    state.settings = { ...state.settings, expectedVersion: 'version-2' };
    view.rerender(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);
    fireEvent.change(screen.getByLabelText('피리어드 1'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(state.mutate).toHaveBeenCalledWith(
      { expectedVersion: 'version-1', periods: [{ durationMinutes: 40 }, { durationMinutes: 45 }] },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('keeps the draft and query data when a generic server save fails', () => {
    state.settings = {
      ...state.settings,
      expectedVersion: 'version-1',
      periods: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
      ],
      legacyPeriodCount: null,
      requiresDurationInput: false,
    };
    state.mutate.mockClear();
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('피리어드 1'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    const [, callbacks] = state.mutate.mock.calls[0] as [
      unknown,
      { onSuccess: () => void; onError: (error: Error) => void },
    ];
    callbacks.onError(new Error('server unavailable'));

    expect(screen.getByDisplayValue('40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
    expect(state.settings.expectedVersion).toBe('version-1');
    expect(state.settings.periods?.map((period) => period.durationMinutes)).toEqual([45, 45]);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('server unavailable', 'error');
    expect(showToast).not.toHaveBeenCalledWith(expect.stringContaining('저장했어요'), 'success');
  });

  it('blocks save when write permission is revoked during editing', () => {
    state.mutate.mockClear();
    const showToast = vi.fn();
    const view = render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    view.rerender(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite={false} showToast={showToast} />);
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('keeps legacy count explicit until every duration is entered', () => {
    state.settings = {
      ...state.settings,
      periods: null,
      legacyPeriodCount: 3,
      requiresDurationInput: true,
    };
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    expect(screen.getByText('기존 설정에 각 피리어드 길이 입력 필요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(showToast).toHaveBeenCalledWith('각 피리어드 시간을 1분 이상 입력해 주세요.', 'error');
  });
});
