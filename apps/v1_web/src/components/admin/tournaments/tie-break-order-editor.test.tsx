import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TOURNAMENT_TIE_BREAK_ORDER } from '@/lib/tournament-tie-break';
import type { V1TournamentTieBreakOrder } from '@/types/api';
import { TieBreakOrderEditor } from './tie-break-order-editor';

function Controlled({ initial = DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, ...props }: {
  initial?: V1TournamentTieBreakOrder;
  disabled?: boolean;
  lockedReason?: string | null;
}) {
  const [order, setOrder] = useState(initial);
  return <TieBreakOrderEditor order={order} onChange={setOrder} {...props} />;
}

const labelsInOrder = () => screen.getAllByRole('listitem').map((item) => item.textContent?.replace(/\d+\s*/, '').split(/항상|위로|아래로/)[0].trim());

describe('TieBreakOrderEditor', () => {
  it('일곱 기준을 순서대로 보여 주고 승점은 처음, 추첨은 마지막에 고정이라고 알린다', () => {
    render(<Controlled />);
    expect(labelsInOrder()).toEqual(['승점', '맞대결', '득실차', '다득점', '페어플레이', '최소 실점', '추첨']);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]).getByText('항상 처음')).toBeInTheDocument();
    expect(within(items[6]).getByText('항상 마지막')).toBeInTheDocument();
    expect(within(items[0]).queryByRole('button')).toBeNull();
    expect(within(items[6]).queryByRole('button')).toBeNull();
  });

  it('득실차를 위로 누르면 맞대결과 자리를 바꾼다', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole('button', { name: '득실차 한 칸 위로' }));
    expect(labelsInOrder()).toEqual(['승점', '득실차', '맞대결', '다득점', '페어플레이', '최소 실점', '추첨']);
  });

  it('최소 실점을 아래로 누르면 추첨 앞에서 더 내려가지 않는다 — 마지막 가운데 칸의 아래로 버튼은 꺼져 있다', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    expect(screen.getByRole('button', { name: '최소 실점 한 칸 아래로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '맞대결 한 칸 위로' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '페어플레이 한 칸 위로' }));
    expect(labelsInOrder()).toEqual(['승점', '맞대결', '득실차', '페어플레이', '다득점', '최소 실점', '추첨']);
  });

  it('기본 순서가 아닐 때만 기본 순서로 되돌리는 버튼이 보이고 누르면 되돌린다', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    expect(screen.queryByRole('button', { name: '기본 순서로 되돌리기' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '다득점 한 칸 위로' }));
    await user.click(screen.getByRole('button', { name: '기본 순서로 되돌리기' }));
    expect(labelsInOrder()).toEqual(['승점', '맞대결', '득실차', '다득점', '페어플레이', '최소 실점', '추첨']);
    expect(screen.queryByRole('button', { name: '기본 순서로 되돌리기' })).toBeNull();
  });

  it('결과가 확정돼 잠기면 이유를 보여 주고 모든 버튼이 꺼진다', () => {
    render(<Controlled initial={['points', 'goal_difference', 'head_to_head', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw']} lockedReason="예선 경기 결과가 확정된 뒤에는 동점일 때 순서를 바꿀 수 없어요." />);
    expect(screen.getByText('예선 경기 결과가 확정된 뒤에는 동점일 때 순서를 바꿀 수 없어요.')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    expect(labelsInOrder()).toEqual(['승점', '득실차', '맞대결', '다득점', '페어플레이', '최소 실점', '추첨']);
  });

  it('제목을 숨겨도 접근 가능한 이름은 남는다', () => {
    render(<TieBreakOrderEditor order={DEFAULT_TOURNAMENT_TIE_BREAK_ORDER} onChange={() => {}} showHeading={false} />);
    expect(screen.queryByRole('heading', { name: '동점일 때 순서' })).toBeNull();
    expect(screen.getByRole('region', { name: '동점일 때 순서' })).toBeInTheDocument();
  });

  it('저장 중(disabled)에도 버튼이 모두 꺼진다', () => {
    render(<Controlled disabled />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
