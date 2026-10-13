import { act, fireEvent, render, screen } from '@testing-library/react';
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
    fireEvent.change(screen.getByLabelText('전반'), { target: { value: '40' } });
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
    fireEvent.change(screen.getByLabelText('전반'), { target: { value: '40' } });
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

  // 2026-10-13 alpha: 기본 장소를 저장한 뒤 피리어드를 저장하면 리그 행 수정 시각이 바뀌어 409 가 났다.
  it('버전 충돌이어도 서버 피리어드가 편집 시작 때와 같으면 새 버전으로 한 번 더 저장한다', async () => {
    const base = {
      ...state.settings,
      expectedVersion: 'version-1',
      periods: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
      ],
      legacyPeriodCount: null,
      requiresDurationInput: false,
    };
    state.settings = base;
    state.mutate.mockClear();
    state.refetch.mockResolvedValue({ data: { ...base, expectedVersion: 'version-2' } });
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('후반'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    const [, callbacks] = state.mutate.mock.calls[0] as [unknown, { onError: (error: unknown) => Promise<void> }];
    await act(() => callbacks.onError({ response: { data: { code: 'TOURNAMENT_VERSION_CONFLICT' } } }));

    expect(state.mutate).toHaveBeenCalledTimes(2);
    expect(state.mutate.mock.calls[1][0]).toEqual({ expectedVersion: 'version-2', periods: [{ durationMinutes: 45 }, { durationMinutes: 40 }] });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('버전 충돌이고 서버 피리어드도 바뀌었으면 덮어쓰지 않고 알린다', async () => {
    const base = { ...state.settings, expectedVersion: 'version-1' };
    state.settings = base;
    state.mutate.mockClear();
    state.refetch.mockResolvedValue({
      data: { ...base, expectedVersion: 'version-2', periods: [{ code: 'FULL_TIME', label: '단판', durationMinutes: 30, extraTime: false }] },
    });
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('전반'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    const [, callbacks] = state.mutate.mock.calls[0] as [unknown, { onError: (error: unknown) => Promise<void> }];
    await act(() => callbacks.onError({ response: { data: { code: 'TOURNAMENT_VERSION_CONFLICT' } } }));

    expect(state.mutate).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('피리어드 설정이 먼저 바뀌었어요'), 'error');
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
