import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1SixTeamCriterion } from '@/types/api';
import { SixTeamOrderEditor } from './six-team-order-editor';

function Controlled({ lockedReason = null, disabled = false }: { lockedReason?: string | null; disabled?: boolean }) {
  const [order, setOrder] = useState<V1SixTeamCriterion[]>(['goals_for', 'goal_difference', 'fewest_goals_against']);
  return <SixTeamOrderEditor order={order} onChange={setOrder} lockedReason={lockedReason} disabled={disabled} />;
}

const labels = () => screen.getAllByRole('listitem').map((item) => item.textContent?.replace(/^\d+/, '').replace(/위로|아래로|항상 마지막/g, '').trim());

describe('SixTeamOrderEditor', () => {
  it('세 기준 뒤에 운영자 선택을 항상 마지막으로 고정해 보여준다', () => {
    render(<Controlled />);
    expect(labels()).toEqual(['다득점', '득실차', '최소 실점', '운영자 선택']);
    expect(screen.getByText('항상 마지막')).toBeInTheDocument();
  });

  it('위아래로 옮기고, 첫 칸의 위로·마지막 칸의 아래로는 꺼져 있다', () => {
    render(<Controlled />);
    expect(screen.getByRole('button', { name: '다득점 한 칸 위로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '최소 실점 한 칸 아래로' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '최소 실점 한 칸 위로' }));
    expect(labels()).toEqual(['다득점', '최소 실점', '득실차', '운영자 선택']);
  });

  it('기본 순서가 아닐 때만 되돌리기 버튼이 보인다', () => {
    render(<Controlled />);
    expect(screen.queryByRole('button', { name: '기본 순서로 되돌리기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '득실차 한 칸 위로' }));
    fireEvent.click(screen.getByRole('button', { name: '기본 순서로 되돌리기' }));
    expect(labels()).toEqual(['다득점', '득실차', '최소 실점', '운영자 선택']);
  });

  it('잠기면 사유를 보여주고 모든 버튼이 꺼진다', () => {
    render(<Controlled lockedReason="6강 경기 결과가 확정돼서 바꿀 수 없어요." />);
    expect(screen.getByText('6강 경기 결과가 확정돼서 바꿀 수 없어요.')).toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });
});
