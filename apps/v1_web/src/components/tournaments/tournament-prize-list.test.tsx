import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PrizeRow } from '@/lib/prize-breakdown';
import { TournamentPrizeList } from './tournament-prize-list';

const rows: PrizeRow[] = [];
rows.push(
  { category: '개인 시상', label: '베스트 골레이로', amount: '장갑' },
  ...['1위', '2위', '3위', '4위', '5위'].map((label): PrizeRow => ({ category: '팀 시상', label, amount: `${label} 상품` })),
  { category: '개인 시상', label: 'MVP', amount: '축구화' },
  { category: '기타 시상', label: '참가상', amount: '기념품' },
);

describe('TournamentPrizeList', () => {
  it('shows every team prize before and after disclosure, and keeps custom personal awards in their category', async () => {
    const user = userEvent.setup();
    render(<TournamentPrizeList rows={rows} />);
    const list = screen.getByRole('group', { name: '상품 상세 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('5위 상품')).toBeVisible();
    expect(screen.queryByRole('region', { name: '개인 시상' })).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: '상품 전체 보기 (총 8개)' });
    expect(button).toHaveAttribute('aria-controls', list.id);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('region', { name: '개인 시상' })).getByText('베스트 골레이로')).toBeVisible();
    expect(screen.getByRole('list', { name: '개인 시상 · 베스트 골레이로' })).toHaveTextContent('장갑');
    await user.click(screen.getByRole('button', { name: '접기' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(button).toHaveFocus();
  });

  it('uses canonical rank grouping and packs shorter prizes ahead of long descriptions', () => {
    const long = '우승팀 전원에게 제공하는 프리미엄 유니폼과 스포츠 가방 세트';
    render(<TournamentPrizeList rows={[
      { category: '팀 시상', label: '1위', amount: '트로피' },
      { category: '팀 시상', label: '우승', amount: long },
      { category: '팀 시상', label: '1위', amount: '장갑' },
      { category: '팀 시상', label: '준우승', amount: '100000' },
      { category: '팀 시상', label: '2위', amount: '유니폼' },
    ]} />);
    expect(screen.getAllByText('1위', { exact: true })).toHaveLength(1);
    expect(within(screen.getByRole('list', { name: '팀 시상 · 1위' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['장갑', '트로피', long]);
    expect(screen.getAllByText('준우승', { exact: true })).toHaveLength(1);
    expect(screen.queryByText('2위', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('100,000원')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps three preview prizes when only non-team awards exist', async () => {
    const user = userEvent.setup();
    render(<TournamentPrizeList rows={Array.from({ length: 4 }, (_, i) => ({ category: '개인 시상', label: 'MVP', amount: `상품 ${i}` }))} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: '상품 전체 보기 (총 4개)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('does not leave empty category headings or a disclosure button for empty prizes', () => {
    const { container } = render(<TournamentPrizeList rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
