import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1StageTieBreakView } from '@/types/api';
import { StageTieBreakSettings } from './stage-tie-break-settings';

const hooks = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1SetStageTieBreakOrder: () => ({ mutate: hooks.mutate, isPending: hooks.isPending }),
}));

const DEFAULT = ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'] as const;
const GOALS_FOR = ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'] as const;

const view = (stages: V1StageTieBreakView['stages']): V1StageTieBreakView => ({ tournamentOrder: [...DEFAULT], stages });
const rankedStage = (overrides: Partial<V1StageTieBreakView['stages'][number]> = {}): V1StageTieBreakView['stages'][number] => ({
  stageKey: 'preliminary', stageName: '예선 조별리그', ranked: true, order: null, resolvedOrder: [...DEFAULT], lockedReason: null, ...overrides,
});

function renderCard(stageTieBreak: V1StageTieBreakView, canWrite = true) {
  return render(<StageTieBreakSettings tournamentId="t-1" stageTieBreak={stageTieBreak} stagePlanRevision={4} canWrite={canWrite} />);
}

describe('StageTieBreakSettings', () => {
  beforeEach(() => { hooks.mutate.mockReset(); hooks.isPending = false; });

  it('단계마다 라벨 붙은 select 와 대회 규정 따름 기본값, 규정 한 줄을 보여준다', () => {
    renderCard(view([rankedStage()]));
    expect(screen.getByRole('heading', { name: '단계별 동점 순서' })).toBeInTheDocument();
    const select = screen.getByLabelText('1단계 · 예선 조별리그');
    expect(select).toHaveValue('inherit');
    expect(within(select).getByRole('option', { name: '대회 설정 따름 · 맞대결 우선' })).toBeInTheDocument();
    expect(screen.getByText('승점 → 맞대결 → 득실차 → 다득점 → 페어플레이 → 추첨')).toBeInTheDocument();
    expect(screen.queryByText('따로 정함')).toBeNull();
  });

  it('프리셋을 고르면 revision 과 순서를 바로 저장한다', () => {
    renderCard(view([rankedStage()]));
    fireEvent.change(screen.getByLabelText('1단계 · 예선 조별리그'), { target: { value: 'goals_for_first' } });
    expect(hooks.mutate).toHaveBeenCalledWith({ stageKey: 'preliminary', expectedRevision: 4, order: [...GOALS_FOR] }, expect.any(Object));
  });

  it('따로 정한 단계는 배지를 달고, 대회 설정 따름을 고르면 null 을 보낸다', () => {
    renderCard(view([rankedStage({ order: [...GOALS_FOR], resolvedOrder: [...GOALS_FOR] })]));
    expect(screen.getByText('따로 정함')).toBeInTheDocument();
    const select = screen.getByLabelText('1단계 · 예선 조별리그');
    expect(select).toHaveValue('goals_for_first');
    fireEvent.change(select, { target: { value: 'inherit' } });
    expect(hooks.mutate).toHaveBeenCalledWith({ stageKey: 'preliminary', expectedRevision: 4, order: null }, expect.any(Object));
  });

  it('이미 대회 설정을 따르는 단계에서 다시 따름을 골라도 저장하지 않는다', () => {
    renderCard(view([rankedStage()]));
    fireEvent.change(screen.getByLabelText('1단계 · 예선 조별리그'), { target: { value: 'inherit' } });
    expect(hooks.mutate).not.toHaveBeenCalled();
  });

  it('직접 정하기…는 시트를 열고, 적용하면 그 순서를 저장한다', () => {
    renderCard(view([rankedStage()]));
    fireEvent.change(screen.getByLabelText('1단계 · 예선 조별리그'), { target: { value: 'custom-open' } });
    const sheet = screen.getByRole('dialog', { name: '직접 정하기' });
    fireEvent.click(within(sheet).getByRole('button', { name: '다득점 한 칸 위로' }));
    fireEvent.click(within(sheet).getByRole('button', { name: '이 순서로 정하기' }));
    expect(hooks.mutate).toHaveBeenCalledWith(
      { stageKey: 'preliminary', expectedRevision: 4, order: ['points', 'head_to_head', 'goals_for', 'goal_difference', 'fair_play', 'fewest_goals_against', 'seeded_draw'] },
      expect.any(Object),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('잠긴 단계는 select 를 끄고 잠김 배지와 사유를 보여준다', () => {
    renderCard(view([rankedStage({ lockedReason: '이 단계 경기 결과가 확정돼서 바꿀 수 없어요.' })]));
    expect(screen.getByLabelText('1단계 · 예선 조별리그')).toBeDisabled();
    expect(screen.getByText('잠김')).toBeInTheDocument();
    expect(screen.getByText('이 단계 경기 결과가 확정돼서 바꿀 수 없어요.')).toBeInTheDocument();
  });

  it('토너먼트만 있는 단계는 select 대신 동점 순서 없음을 알린다', () => {
    renderCard(view([rankedStage(), rankedStage({ stageKey: 'final', stageName: '결선 토너먼트', ranked: false, resolvedOrder: [] })]));
    expect(screen.queryByLabelText('2단계 · 결선 토너먼트')).toBeNull();
    expect(screen.getByText('2단계 · 결선 토너먼트')).toBeInTheDocument();
    expect(screen.getByText('토너먼트는 승부로 가려서 동점 순서가 없어요.')).toBeInTheDocument();
  });

  it('쓰기 권한이 없거나 저장 중이면 select 가 꺼진다', () => {
    const { unmount } = renderCard(view([rankedStage()]), false);
    expect(screen.getByLabelText('1단계 · 예선 조별리그')).toBeDisabled();
    unmount();
    hooks.isPending = true;
    renderCard(view([rankedStage()]));
    expect(screen.getByLabelText('1단계 · 예선 조별리그')).toBeDisabled();
  });

  it('저장이 실패하면 서버 메시지를 알린다', () => {
    hooks.mutate.mockImplementation((_input: unknown, options: { onError: (error: unknown) => void }) => options.onError(new Error('다른 곳에서 단계 구성이 바뀌었어요.')));
    renderCard(view([rankedStage()]));
    fireEvent.change(screen.getByLabelText('1단계 · 예선 조별리그'), { target: { value: 'goals_for_first' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/단계 구성이 바뀌었어요|저장하지 못했어요/);
  });
});
