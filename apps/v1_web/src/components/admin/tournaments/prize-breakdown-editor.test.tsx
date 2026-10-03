import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PrizeBreakdownEditor, type TournamentPrizeRow } from './prize-breakdown-editor';

const initialRows: TournamentPrizeRow[] = [
  { id: 'first', label: '1위', value: '' },
  { id: 'second', label: '2위', value: '' },
  { id: 'third', label: '3위', value: '' },
];

function ControlledEditor({ rows = initialRows, pool = '', disabled = false }: {
  rows?: TournamentPrizeRow[];
  pool?: string;
  disabled?: boolean;
}) {
  const [currentRows, setRows] = useState(rows);
  const [currentPool, setPool] = useState(pool);
  return <PrizeBreakdownEditor rows={currentRows} onChange={setRows} prizePool={currentPool} onPrizePoolChange={setPool} disabled={disabled} />;
}

describe('PrizeBreakdownEditor — 모바일 내용 전체폭 (#1439 A)', () => {
  it('실제 행의 내용은 모바일 전체폭2행이고 sm부터 기존3열이며 이름·내용·삭제 DOM을 유지한다', () => {
    render(<ControlledEditor />);
    const name = screen.getByRole('combobox', { name: '상금 항목 1 이름' });
    const value = screen.getByRole('textbox', { name: '상금 항목 1 내용' });
    const remove = screen.getByRole('button', { name: '상금 항목 1 삭제' });
    const row = name.parentElement;

    expect(row).toHaveClass('grid-cols-[minmax(0,1fr)_44px]', 'sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_44px]');
    expect(value).toHaveClass('col-span-2', 'col-start-1', 'row-start-2', 'sm:col-span-1', 'sm:col-start-2', 'sm:row-start-1');
    expect(remove).toHaveClass('col-start-2', 'row-start-1', 'sm:col-start-3', 'h-[44px]', 'w-[44px]');
    expect(Array.from(row!.children)).toEqual([name, value, remove]);
    expect(value).toHaveAttribute('placeholder', '예: 600,000원 또는 우승 트로피');
    expect(value).toHaveClass('h-[44px]', 'w-full');
    // 실제 media geometry·픽셀/가시성은 별도 alpha after 범위다.
  });

  it('이름→내용→삭제→다음 이름의 기존 DOM Tab 순서를 유지한다 (jsdom focus)', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    screen.getByRole('combobox', { name: '상금 항목 1 이름' }).focus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '상금 항목 1 삭제' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: '상금 항목 2 이름' })).toHaveFocus();
  });

  it('연속 제어형 입력은 같은 input을 유지하고 현금·물품 미리보기를 갱신한다', () => {
    render(<ControlledEditor />);
    const name = screen.getByRole('combobox', { name: '상금 항목 1 이름' });
    const value = screen.getByRole('textbox', { name: '상금 항목 1 내용' });
    fireEvent.change(value, { target: { value: '600000' } });
    expect(screen.getByText('600,000원')).toBeInTheDocument();
    fireEvent.change(name, { target: { value: '우승/공동' } });
    expect(name).toHaveValue('우승·공동');
    fireEvent.change(value, { target: { value: '트로피/상품권' } });
    expect(value).toHaveValue('트로피·상품권');
    expect(screen.getByText('트로피·상품권')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toBe(value);
    expect(screen.getByRole('combobox', { name: '상금 항목 1 이름' })).toBe(name);
    expect(name).toHaveAttribute('maxLength', '20');
    expect(value).toHaveAttribute('maxLength', '80');
  });

  it('앞 항목을 삭제해도 남은 row.id의 input과 내용을 유지한다', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor rows={[{ id: 'a', label: '1위', value: '600000' }, { id: 'b', label: 'MVP', value: '우승 트로피' }]} />);
    const second = screen.getByRole('textbox', { name: '상금 항목 2 내용' });
    await user.click(screen.getByRole('button', { name: '상금 항목 1 삭제' }));
    expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toBe(second);
    expect(second).toHaveValue('우승 트로피');
    expect(screen.queryByDisplayValue('600000')).not.toBeInTheDocument();
  });

  it('추가·삭제와12개 제한은 기존 입력을 유지한다', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor />);
    const first = screen.getByRole('textbox', { name: '상금 항목 1 내용' });
    fireEvent.change(first, { target: { value: '상품권 10만원 상당' } });
    for (let count = 3; count < 12; count += 1) await user.click(screen.getByRole('button', { name: '항목 추가' }));
    expect(screen.getAllByRole('button', { name: /상금 항목 \d+ 삭제/ })).toHaveLength(12);
    expect(screen.getByRole('button', { name: '항목 추가' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toBe(first);
    expect(first).toHaveValue('상품권 10만원 상당');
    await user.click(screen.getByRole('button', { name: '상금 항목 12 삭제' }));
    expect(screen.getByRole('button', { name: '항목 추가' })).toBeEnabled();
  });

  it('disabled는 입력·추가·삭제를 잠그고 합성 값을 보존한다', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor disabled rows={[{ id: 'a', label: '1위', value: '우승 트로피' }]} />);
    for (const input of [...screen.getAllByRole('textbox'), ...screen.getAllByRole('combobox')]) expect(input).toBeDisabled();
    const add = screen.getByRole('button', { name: '항목 추가' });
    const remove = screen.getByRole('button', { name: '상금 항목 1 삭제' });
    expect(add).toBeDisabled();
    expect(remove).toBeDisabled();
    await user.click(add);
    await user.click(remove);
    expect(screen.getAllByRole('button', { name: /상금 항목 \d+ 삭제/ })).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toHaveValue('우승 트로피');
  });

  it('배분 합계 불일치와 총상금 맞추기를 유지한다', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor pool="1000000" rows={[{ id: 'a', label: '1위', value: '600000' }, { id: 'b', label: '2위', value: '300000' }]} />);
    expect(screen.getByText('배분 합계 900,000원 · 총상금과 달라요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '합계를 총상금으로' }));
    expect(screen.getByLabelText('총상금')).toHaveValue('900,000');
    expect(screen.queryByText(/총상금과 달라요/)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '상금 항목 1 내용' })).toHaveValue('600000');
  });
});
