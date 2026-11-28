import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StagePlan } from '@/types/stage-plan';
import type { TournamentPeriodSettingsResponse } from '@/hooks/use-tournament-period-settings';
import { StagePeriodSettings } from './stage-period-settings';

const state = vi.hoisted(() => ({
  settings: undefined as TournamentPeriodSettingsResponse | undefined,
  mutate: vi.fn(), refetch: vi.fn(), confirm: vi.fn(), pending: false,
}));
vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentPeriodSettings: () => ({ data: state.settings, refetch: state.refetch, isError: false, isFetching: false }),
  useUpdateTournamentPeriodSettings: () => ({ mutateAsync: state.mutate, isPending: state.pending }),
}));
vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: state.confirm, ConfirmModal: null }),
}));
const plan: StagePlan = { version: 1, stages: [{ key: 'pre', name: '예선', pools: [
  { key: 'pool-a', name: 'A조', format: 'league', capacity: 4, legs: 1, sources: [] },
] }] };
const props = { tournamentId: 't-1', plan, canWrite: true };

beforeEach(() => {
  vi.clearAllMocks(); state.pending = false;
  state.settings = { tournamentId: 't-1', kind: 'regular_tournament', competitionConfigVersionId: 'c-1', expectedVersion: 'v-1',
    periods: [{ code: 'SINGLE_PERIOD', label: '단판', durationMinutes: 20, extraTime: false }],
    legacyPeriodCount: null, requiresDurationInput: false, stageOverrides: [], groupOverrides: [], compositionOverrides: [] };
  state.mutate.mockResolvedValue({});
  state.refetch.mockImplementation(async () => ({ data: state.settings, isError: false }));
  state.confirm.mockResolvedValue(true);
});

describe('단계·편성별 경기 시간', () => {
  it('조회 갱신으로 편집 기준 버전이 바뀌면 입력을 보존하고 저장을 막는다', () => {
    const view = render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: '15 / 15' } });
    state.settings = { ...state.settings!, expectedVersion: 'v-2' };
    view.rerender(<StagePeriodSettings {...props} />);
    expect(screen.getByLabelText('경기 시간 · 분')).toHaveValue('15 / 15');
    expect(screen.getByRole('button', { name: '경기 시간 저장' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '경기 시간 저장' }));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/작성 중인 경기 시간은 보존/)).toBeInTheDocument();
  });

  it('409 뒤 자동 재조회가 새 버전을 받아도 명시 확인 전에는 다시 저장하지 않는다', async () => {
    state.mutate.mockRejectedValueOnce({ response: { data: { code: 'TOURNAMENT_VERSION_CONFLICT', message: '다른 곳에서 수정했어요.' } } });
    const view = render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: '15' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '경기 시간 저장' })));
    expect(state.mutate).toHaveBeenCalledWith({ expectedVersion: 'v-1', stageKey: 'pre', inheritDefault: false, periods: [{ durationMinutes: 15 }] });
    state.settings = { ...state.settings!, expectedVersion: 'v-2' };
    view.rerender(<StagePeriodSettings {...props} />);
    expect(screen.getByRole('button', { name: '경기 시간 저장' })).toBeDisabled();
    state.confirm.mockResolvedValueOnce(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '최신 경기 시간 다시 불러오기' })));
    expect(state.refetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('경기 시간 · 분')).toHaveValue('15');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '최신 경기 시간 다시 불러오기' })));
    expect(state.confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('경기 시간 · 분')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: '25' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '경기 시간 저장' })));
    expect(state.mutate).toHaveBeenLastCalledWith({ expectedVersion: 'v-2', stageKey: 'pre', inheritDefault: false, periods: [{ durationMinutes: 25 }] });
  });

  it('최신 조회 실패 시 입력과 충돌 차단을 유지한다', async () => {
    state.refetch.mockResolvedValue({ isError: true, error: new Error('조회 실패') });
    const view = render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: '15' } });
    state.settings = { ...state.settings!, expectedVersion: 'v-2' };
    view.rerender(<StagePeriodSettings {...props} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '최신 경기 시간 다시 불러오기' })));
    expect(screen.getByLabelText('경기 시간 · 분')).toHaveValue('15');
    expect(screen.getByRole('button', { name: '경기 시간 저장' })).toBeDisabled();
    expect(screen.getByText('조회 실패')).toBeInTheDocument();
  });

  it('저장 중 적용 범위를 잠가 다른 편성 입력을 지우지 않는다', () => {
    state.pending = true;
    render(<StagePeriodSettings {...props} />);
    expect(screen.getByLabelText('적용 범위')).toBeDisabled();
  });

  it('작성 중 범위 변경을 취소하면 선택 범위와 입력을 유지한다', async () => {
    state.confirm.mockResolvedValueOnce(false);
    render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: '15' } });
    await act(async () => fireEvent.change(screen.getByLabelText('적용 범위'), { target: { value: 'pool:pool-a' } }));
    expect(screen.getByLabelText('적용 범위')).toHaveValue('stage:pre');
    expect(screen.getByLabelText('경기 시간 · 분')).toHaveValue('15');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '경기 시간 저장' })));
    expect(state.mutate).toHaveBeenCalledWith({ expectedVersion: 'v-1', stageKey: 'pre', inheritDefault: false, periods: [{ durationMinutes: 15 }] });
  });

  it('서버에서 편성이 제거되면 옛 입력을 다른 범위로 저장하지 않는다', () => {
    const view = render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('적용 범위'), { target: { value: 'pool:pool-a' } });
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: '15' } });
    const nextPlan: StagePlan = { version: 1, stages: [{ ...plan.stages[0], pools: [{ ...plan.stages[0].pools[0], key: 'pool-b', name: 'B조' }] }] };
    view.rerender(<StagePeriodSettings {...props} plan={nextPlan} />);
    expect(screen.getByLabelText('경기 시간 · 분')).toHaveValue('15');
    expect(screen.getByRole('button', { name: '경기 시간 저장' })).toBeDisabled();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('조회 권한으로는 저장 동작을 노출하지 않는다', () => {
    render(<StagePeriodSettings {...props} canWrite={false} />);
    expect(screen.queryByRole('button', { name: '경기 시간 저장' })).toBeNull();
  });

  it('서버 계약에 맞춰 240분 초과와 10개 초과 경기 시간 구간도 편성 범위에 저장한다', async () => {
    render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('적용 범위'), { target: { value: 'pool:pool-a' } });
    const durations = Array.from({ length: 11 }, () => 241);
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value: durations.join(' / ') } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '경기 시간 저장' })));
    expect(state.mutate).toHaveBeenCalledWith({ expectedVersion: 'v-1', poolKey: 'pool-a', inheritDefault: false, periods: durations.map(durationMinutes => ({ durationMinutes })) });
  });

  it.each(['0', '-1', '1.5', '15 / ', 'Infinity'])('잘못된 시간 %s는 저장하지 않는다', async value => {
    render(<StagePeriodSettings {...props} />);
    fireEvent.change(screen.getByLabelText('경기 시간 · 분'), { target: { value } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '경기 시간 저장' })));
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByText(/1분 이상/)).toBeInTheDocument();
  });
});
