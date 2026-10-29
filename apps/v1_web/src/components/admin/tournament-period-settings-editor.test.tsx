import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentPeriodSettingsEditor } from './tournament-period-settings-editor';
import type { TournamentPeriodSettingsResponse } from '@/hooks/use-tournament-period-settings';

const { state } = vi.hoisted(() => {
  const settings: TournamentPeriodSettingsResponse = {
    tournamentId: 'tournament-1',
    kind: 'regular_tournament',
    competitionConfigVersionId: 'config-1',
    expectedVersion: 'version-1',
    periods: [
      { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
      { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
    ],
    legacyPeriodCount: null,
    requiresDurationInput: false,
    stageOverrides: [], groupOverrides: [],
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

  it.each([[3, '피리어드 설정을 저장했어요. 시작 전 경기 3개에도 적용했어요.'], [0, '피리어드 설정을 저장했어요.']])(
    '저장 토스트는 실제로 옮긴 시작 전 경기 수(%i)만 말한다', (fixturesRepointed, message) => {
      state.mutate.mockClear();
      const showToast = vi.fn();
      render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);
      fireEvent.click(screen.getByRole('button', { name: '수정' }));
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      const [, callbacks] = state.mutate.mock.calls[0] as [unknown, { onSuccess: (data: { fixturesRepointed: number }) => void }];
      act(() => callbacks.onSuccess({ fixturesRepointed }));
      expect(showToast).toHaveBeenCalledWith(message, 'success');
    },
  );

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

  it('adds a stage override using the current default as its initial value', () => {
    state.settings = {
      ...state.settings,
      expectedVersion: 'version-stage-1',
      kind: 'regular_tournament',
      periods: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
      ],
      stageOverrides: [], groupOverrides: [],
    };
    state.mutate.mockClear();
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    fireEvent.change(screen.getByLabelText('추가할 대회 단계'), { target: { value: 'final' } });
    fireEvent.click(screen.getByRole('button', { name: '단계 추가' }));
    expect(screen.getByText('결승 설정')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('후반 (분)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(state.mutate).toHaveBeenCalledWith(
      {
        expectedVersion: 'version-stage-1',
        phase: 'final',
        inheritDefault: false,
        periods: [{ durationMinutes: 10 }, { durationMinutes: 10 }],
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it('can remove a stage override and return that phase to the tournament default', () => {
    state.settings = {
      ...state.settings,
      expectedVersion: 'version-stage-2',
      kind: 'regular_tournament',
      stageOverrides: [{
        phase: 'final',
        competitionConfigVersionId: 'config-final',
        periods: [
          { code: 'FIRST_HALF', label: '전반', durationMinutes: 10, extraTime: false },
          { code: 'SECOND_HALF', label: '후반', durationMinutes: 10, extraTime: false },
        ],
        legacyPeriodCount: null,
      }],
    };
    state.mutate.mockClear();
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    fireEvent.click(screen.getAllByRole('button', { name: '수정' })[1]);
    fireEvent.click(screen.getByRole('button', { name: '기본값 사용' }));

    expect(state.mutate).toHaveBeenCalledWith(
      { expectedVersion: 'version-stage-2', phase: 'final', inheritDefault: true },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  describe('stage save version conflict', () => {
    const finalOverride = (minutes: number) => ({
      phase: 'final' as const,
      competitionConfigVersionId: 'config-final',
      periods: [
        { code: 'FIRST_HALF', label: '전반', durationMinutes: minutes, extraTime: false },
        { code: 'SECOND_HALF', label: '후반', durationMinutes: minutes, extraTime: false },
      ],
      legacyPeriodCount: null,
    });

    function saveFinalAfterConflict(freshOverrideMinutes: number) {
      const base = { ...state.settings, expectedVersion: 'version-stage-3', kind: 'regular_tournament' as const, stageOverrides: [finalOverride(10)] };
      state.settings = base;
      state.mutate.mockClear();
      state.refetch.mockResolvedValue({ data: { ...base, expectedVersion: 'version-stage-4', stageOverrides: [finalOverride(freshOverrideMinutes)] } });
      const showToast = vi.fn();
      render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

      fireEvent.click(screen.getAllByRole('button', { name: '수정' })[1]);
      fireEvent.change(screen.getByLabelText('전반 (분)'), { target: { value: '12' } });
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
      const [, callbacks] = state.mutate.mock.calls[0] as [unknown, { onError: (error: unknown) => Promise<void> }];
      return { showToast, conflict: () => act(() => callbacks.onError({ response: { data: { code: 'TOURNAMENT_VERSION_CONFLICT' } } })) };
    }

    it('retries once with the fresh version when only other settings changed', async () => {
      const { showToast, conflict } = saveFinalAfterConflict(10);
      await conflict();

      expect(state.mutate).toHaveBeenCalledTimes(2);
      expect(state.mutate.mock.calls[1][0]).toEqual({
        expectedVersion: 'version-stage-4', phase: 'final', inheritDefault: false,
        periods: [{ durationMinutes: 12 }, { durationMinutes: 10 }],
      });
      expect(showToast).not.toHaveBeenCalled();
    });

    it('does not overwrite when the same stage changed elsewhere', async () => {
      const { showToast, conflict } = saveFinalAfterConflict(15);
      await conflict();

      expect(state.mutate).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('결승 경기 시간이 먼저 바뀌었어요'), 'error');
    });
  });

  it('keeps legacy count explicit until every duration is entered', () => {
    state.settings = {
      ...state.settings,
      periods: null,
      legacyPeriodCount: 3,
      requiresDurationInput: true,
      stageOverrides: [], groupOverrides: [],
    };
    const showToast = vi.fn();
    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={showToast} />);

    expect(screen.getByText('기존 설정에 각 피리어드 길이 입력 필요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(showToast).toHaveBeenCalledWith('각 피리어드 시간을 1분 이상 입력해 주세요.', 'error');
  });

  it('shows which narrower overrides will stay unchanged when a parent setting changes', () => {
    state.settings = {
      ...state.settings,
      requiresDurationInput: false,
      stageOverrides: [],
      groupOverrides: [{
        groupId: 'group-b',
        name: 'B조',
        competitionConfigVersionId: 'config-group-b',
        periods: [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 15, extraTime: false }],
        legacyPeriodCount: null,
      }],
      matchOverrideCount: 2,
    };

    render(<TournamentPeriodSettingsEditor tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    expect(screen.getByLabelText('별도 경기 시간 안내')).toHaveTextContent('따로 정한 조·경기는 위 기본값이나 단계별 경기 시간을 바꿔도 그대로 유지돼요.');
    expect(screen.getByText('따로 정한 조: B조')).toBeInTheDocument();
    expect(screen.getByText('따로 정한 경기: 2개')).toBeInTheDocument();
  });
});
