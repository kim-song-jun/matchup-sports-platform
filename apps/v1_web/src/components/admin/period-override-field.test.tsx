import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGroupPeriodOverride, useMatchPeriodOverride } from './period-override-field';

const state = vi.hoisted(() => ({ minutes: 20, save: vi.fn() }));
const periods = () => [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: state.minutes, extraTime: false }];

vi.mock('@/hooks/use-tournament-period-settings', () => ({
  useTournamentMatchPeriods: (_id: string, teamMatchId: string | null) => ({
    isPending: false, isError: false,
    data: teamMatchId ? {
      teamMatchId, expectedVersion: 'version-1', overridden: false, editable: true,
      periods: periods(), inherited: { source: 'default', periods: periods() },
    } : undefined,
  }),
  useTournamentPeriodSettings: () => ({
    isPending: false, isError: false,
    data: { expectedVersion: 'version-1', periods: periods(), groupOverrides: [], stageOverrides: [] },
  }),
  useUpdateTournamentPeriodSettings: () => ({ isPending: false, mutateAsync: state.save }),
}));

describe.each(['match', 'group'] as const)('%s 경기 시간 편집', (scope) => {
  function useOverride(id: string | null) {
    // 테스트마다 같은 훅만 실행한다. 두 실제 진입점의 닫기/재진입 계약을 함께 검사한다.
    const useScope = scope === 'match' ? useMatchPeriodOverride : useGroupPeriodOverride;
    return useScope('tournament-1', id, '대회 기본값');
  }

  beforeEach(() => { state.minutes = 20; state.save.mockReset(); });

  it('취소 후 같은 대상을 다시 열면 서버 값으로 돌아가고 취소한 시간을 저장하지 않는다', async () => {
    const { result, rerender } = renderHook<ReturnType<typeof useOverride>, { id: string | null }>(({ id }) => useOverride(id), { initialProps: { id: 'target-a' } });
    act(() => result.current.setChoice({ mode: 'custom', minutes: ['12'] }));
    expect(result.current.payload).toEqual({ periods: [{ durationMinutes: 12 }] });

    rerender({ id: null });
    rerender({ id: 'target-a' });

    expect(result.current.choice).toEqual({ mode: 'inherit', minutes: ['20'] });
    expect(result.current.payload).toBeNull();
    await act(async () => { expect(await result.current.save()).toBe(false); });
    expect(state.save).not.toHaveBeenCalled();
  });

  it('다른 대상을 거쳐 돌아와도 이전 대상의 미저장 입력을 되살리지 않는다', () => {
    const { result, rerender } = renderHook(({ id }) => useOverride(id), { initialProps: { id: 'target-a' } });
    act(() => result.current.setChoice({ mode: 'custom', minutes: ['12'] }));
    rerender({ id: 'target-b' });
    rerender({ id: 'target-a' });
    expect(result.current.choice).toEqual({ mode: 'inherit', minutes: ['20'] });
    expect(result.current.payload).toBeNull();
  });

  it('같은 대상을 편집 중인 조회 갱신은 입력을 지우지 않고, 닫았다 열면 최신 값을 사용한다', () => {
    const { result, rerender } = renderHook<ReturnType<typeof useOverride>, { id: string | null }>(({ id }) => useOverride(id), { initialProps: { id: 'target-a' } });
    act(() => result.current.setChoice({ mode: 'custom', minutes: ['12'] }));
    state.minutes = 30;
    rerender({ id: 'target-a' });
    expect(result.current.choice).toEqual({ mode: 'custom', minutes: ['12'] });
    rerender({ id: null });
    rerender({ id: 'target-a' });
    expect(result.current.choice).toEqual({ mode: 'inherit', minutes: ['30'] });
  });
});
