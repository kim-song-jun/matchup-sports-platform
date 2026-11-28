import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecordGrid, type RecordCellKey } from './record-grid';

const FUTSAL_CELLS: ReadonlyArray<{ key: RecordCellKey; label: string; disabled?: boolean }> = [
  { key: 'GOAL', label: '골' },
  { key: 'OWN_GOAL', label: '자책골' },
  { key: 'YELLOW', label: '옐로카드' },
  { key: 'RED', label: '레드카드' },
  { key: 'FOUL', label: '파울' },
  { key: 'MORE', label: '더보기' },
];

describe('RecordGrid — 큰 기록 버튼 격자', () => {
  it('칸마다 이름 있는 버튼이고 누르면 key 로 onSelect', () => {
    const onSelect = vi.fn();
    render(<RecordGrid cells={FUTSAL_CELLS} onSelect={onSelect} />);

    const grid = screen.getByRole('group', { name: '기록하기' });
    expect(grid).toHaveAttribute('data-console-guide', 'events');
    expect(grid).toHaveClass('grid-cols-2', 'sm:grid-cols-6');
    const buttons = within(grid).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['골', '자책골', '옐로카드', '레드카드', '파울', '더보기']);
    for (const button of buttons) expect(button).toHaveClass('h-[68px]');
    // 칸마다 선수 시트나 더보기 시트를 연다.
    for (const button of buttons) expect(button).toHaveAttribute('aria-haspopup', 'dialog');

    for (const cell of FUTSAL_CELLS) fireEvent.click(within(grid).getByRole('button', { name: cell.label }));
    expect(onSelect.mock.calls.map(([key]) => key)).toEqual(['GOAL', 'OWN_GOAL', 'YELLOW', 'RED', 'FOUL', 'MORE']);
  });

  it('disabled 칸은 눌리지 않고 나머지는 눌린다', () => {
    const onSelect = vi.fn();
    render(
      <RecordGrid
        cells={FUTSAL_CELLS.map((cell) => (cell.key === 'MORE' ? cell : { ...cell, disabled: true }))}
        onSelect={onSelect}
      />,
    );

    const goal = screen.getByRole('button', { name: '골' });
    expect(goal).toBeDisabled();
    fireEvent.click(goal);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('MORE');
  });

  it('여섯째 칸이 교체인 종목도 같은 격자를 쓴다', () => {
    const onSelect = vi.fn();
    render(
      <RecordGrid cells={[...FUTSAL_CELLS.slice(0, 5), { key: 'SUBSTITUTION', label: '교체' }]} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '교체' }));
    expect(onSelect).toHaveBeenCalledWith('SUBSTITUTION');
    expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  });

  it('칸을 한쪽 색 띠나 굵은 색 테두리로 강조하지 않는다', () => {
    render(<RecordGrid cells={FUTSAL_CELLS} onSelect={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).not.toMatch(/border-l|border-2|before:|inset/);
    }
  });
});
