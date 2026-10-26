import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parsePrizeRows } from '@/lib/prize-breakdown';
import { GroupedPrizes } from './grouped-prizes';

describe('GroupedPrizes', () => {
  const rows = parsePrizeRows('우승 1000000 / 우승 트로피 / 우승 칼치오 상품권 30만원 / 준우승 300000 / 3위 칼치오 상품권 10만원 / MVP 트레이닝복 / MVP 삭스 / 추첨 경품');

  it('각 시상과 수상팀을 한 번 표시하고 현금·상품은 모두 보존한다', () => {
    render(<GroupedPrizes rows={rows} teamByPosition={{ 1: '공동팀 A · 공동팀 B', 3: '펌킨FS' }} />);
    const team = screen.getByRole('region', { name: '팀 시상' });
    expect(within(team).getAllByText('우승', { exact: true })).toHaveLength(1);
    const winner = within(team).getByText('우승', { exact: true }).parentElement!;
    expect(winner).toHaveTextContent('공동팀 A · 공동팀 B');
    expect(winner).toHaveTextContent('1,000,000원');
    expect(winner).toHaveTextContent('트로피');
    expect(winner).toHaveTextContent('칼치오 상품권 30만원');
    expect(screen.getAllByText('공동팀 A · 공동팀 B')).toHaveLength(1);
    expect(screen.getByText('펌킨FS')).toBeInTheDocument();
    const mvp = within(screen.getByRole('region', { name: '개인 시상' })).getByText('MVP').parentElement!;
    expect(mvp).toHaveTextContent('트레이닝복');
    expect(mvp).toHaveTextContent('삭스');
    expect(screen.getByRole('region', { name: '추첨·이벤트' })).toHaveTextContent('경품');
    expect(screen.queryByRole('region', { name: '기타 시상' })).not.toBeInTheDocument();
  });

  it('안내·미리보기에서는 수상자를 만들지 않고 빈 목록은 빈 분류를 남기지 않는다', () => {
    const { rerender } = render(<GroupedPrizes rows={rows} />);
    expect(screen.queryByText('펌킨FS')).not.toBeInTheDocument();
    expect(screen.getAllByText('MVP')).toHaveLength(1);
    rerender(<GroupedPrizes rows={[]} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
