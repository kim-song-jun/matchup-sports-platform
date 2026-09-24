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
    // 뒤로가기가 이 목록으로 돌아오도록 `?from=`을 함께 실어 보낸다(MD-QA #15 후속).
    expect(screen.getAllByRole('link', { name: '상세' }).at(-1)).toHaveAttribute('href', '/matches/m51?from=%2Fmy%2Fmatches%2Fjoined');
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  // 상세 href 가 `?from=` 을 달게 되면서 `${href}/applications` 가 쿼리 뒤에 경로를 붙여 깨졌다.
  it('만든 매치의 참가 관리 링크는 쿼리 없는 관리 경로로 간다', () => {
    const item = { id: 'm1', title: '만든 매치', startsAt: '2026-09-18T01:00:00Z', status: 'recruiting', viewerState: 'host' };
    mock.query.mockReturnValue({ data: { pages: [{ items: [item] }] }, hasNextPage: false });
    render(<MyMatchesPageClient mode="created" />);
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute('href', '/matches/m1?from=%2Fmy%2Fmatches%2Fcreated');
    expect(screen.getByRole('link', { name: '참가 관리' })).toHaveAttribute('href', '/matches/m1/applications');
  });
});
