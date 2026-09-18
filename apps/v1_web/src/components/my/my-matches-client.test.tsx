import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyMatchesPageClient } from './my-matches-client';
const mock = vi.hoisted(() => ({ query: vi.fn(), fetchNextPage: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1MyMatchesInfinite: mock.query }));
vi.mock('next/navigation', () => ({ usePathname: () => '/my/matches/joined', useRouter: () => ({ push: vi.fn() }) }));
describe('내 개인 매치 이력', () => {
  it('더 보기로 다음 페이지를 요청하고 추가 기록을 상세 링크로 보여준다', () => {
    const item = { id: 'm1', title: '첫 매치', startsAt: '2026-09-18T01:00:00Z', status: 'completed', viewerState: 'participant' };
    mock.query.mockReturnValue({ data: { pages: [{ items: [item] }] }, hasNextPage: true, fetchNextPage: mock.fetchNextPage });
    const { rerender } = render(<MyMatchesPageClient mode="joined" />);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(mock.fetchNextPage).toHaveBeenCalledOnce();
    mock.query.mockReturnValue({ data: { pages: [{ items: [item] }, { items: [{ ...item, id: 'm51', title: '51번째 매치' }] }] }, hasNextPage: false });
    rerender(<MyMatchesPageClient mode="joined" />);
    expect(screen.getByText('51번째 매치')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: '상세' }).at(-1)).toHaveAttribute('href', '/matches/m51');
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });
});
