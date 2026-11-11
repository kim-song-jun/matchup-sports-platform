import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, TOURNAMENT_TIE_BREAK_PRESETS } from '@/lib/tournament-tie-break';
import type { V1TournamentTieBreakOrder } from '@/types/api';
import { TieBreakPresetPicker } from './tie-break-preset-picker';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }) }));

function Controlled({ initial = DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, onChange, ...props }: {
  initial?: V1TournamentTieBreakOrder;
  onChange?: (order: V1TournamentTieBreakOrder) => void;
  disabled?: boolean;
  lockedReason?: string | null;
}) {
  const [order, setOrder] = useState(initial);
  return <TieBreakPresetPicker order={order} onChange={(next) => { setOrder(next); onChange?.(next); }} {...props} />;
}

describe('TieBreakPresetPicker', () => {
  it('프리셋 셋과 직접 정하기를 라디오로 보여주고 지금 순서와 같은 프리셋을 고른 채로 둔다', () => {
    render(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: '동점일 때 순서' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /맞대결 우선/ })).toBeChecked();
    expect(screen.getByText('기본')).toBeInTheDocument();
    expect(screen.getByText('승점 → 맞대결 → 득실차 → 다득점 → 페어플레이 → 추첨')).toBeInTheDocument();
    expect(screen.getByText('기준을 한 칸씩 옮겨서 정해요')).toBeInTheDocument();
  });

  it('다른 프리셋을 고르면 그 프리셋의 순서를 알려준다', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /다득점 우선/ }));
    expect(onChange).toHaveBeenCalledWith(TOURNAMENT_TIE_BREAK_PRESETS[2].order);
    expect(screen.getByRole('radio', { name: /다득점 우선/ })).toBeChecked();
  });

  it('직접 정하기는 바텀시트를 열고, 취소하면 순서를 바꾸지 않는다', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /직접 정하기/ }));
    const sheet = screen.getByRole('dialog', { name: '직접 정하기' });
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(7);
    fireEvent.click(within(sheet).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /맞대결 우선/ })).toBeChecked();
  });

  it('시트에서 옮기고 이 순서로 정하기를 누르면 직접 정한 순서를 쓴다 — 직접 정하기 카드에 순서가 보인다', () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /직접 정하기/ }));
    const sheet = screen.getByRole('dialog', { name: '직접 정하기' });
    fireEvent.click(within(sheet).getByRole('button', { name: '다득점 한 칸 위로' }));
    fireEvent.click(within(sheet).getByRole('button', { name: '이 순서로 정하기' }));
    expect(onChange).toHaveBeenCalledWith(['points', 'head_to_head', 'goals_for', 'goal_difference', 'fair_play', 'fewest_goals_against', 'seeded_draw']);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('radio', { name: /직접 정하기/ })).toBeChecked();
  });

  it('직접 정한 순서를 이미 쓰고 있어도 직접 정하기를 누르면 시트가 그 순서로 다시 열린다', () => {
    render(<Controlled initial={['points', 'head_to_head', 'goals_for', 'goal_difference', 'fair_play', 'fewest_goals_against', 'seeded_draw']} />);
    const custom = screen.getByRole('radio', { name: /직접 정하기/ });
    expect(custom).toBeChecked();
    fireEvent.click(custom);
    const sheet = screen.getByRole('dialog', { name: '직접 정하기' });
    expect(within(sheet).getByRole('button', { name: '다득점 한 칸 위로' })).toBeEnabled();
    expect(within(sheet).getAllByRole('listitem')[2]).toHaveTextContent('다득점');
  });

  it('잠기면 사유를 보여주고 모든 카드가 꺼진다', () => {
    render(<Controlled lockedReason="이 순서를 따르는 단계의 경기 결과가 확정돼서 바꿀 수 없어요." />);
    expect(screen.getByText('이 순서를 따르는 단계의 경기 결과가 확정돼서 바꿀 수 없어요.')).toBeInTheDocument();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });

  it('저장 중(disabled)에도 모든 카드가 꺼진다', () => {
    render(<Controlled disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});
