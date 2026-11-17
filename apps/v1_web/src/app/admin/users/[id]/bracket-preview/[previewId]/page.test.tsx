import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MemberBracketPreviewPage from './page';
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'member', previewId: 'audit' }) }));
vi.mock('@/lib/api-client', async original => ({ ...await original<typeof import('@/lib/api-client')>(), v1Get: mocks.get }));
vi.mock('@/app/tournaments/[id]/bracket/bracket-page-client', () => ({
  BracketPageClient: ({ tournamentId }: { tournamentId: string }) => <div>대진표 {tournamentId}<a href="/my">다른 화면</a></div>,
}));
const data = { tournamentId: 'cup', member: { id: 'member', name: '테스트 회원' }, teamIds: ['team'], myFixtures: { teams: [] },
  expiresAt: new Date(Date.now() + 600_000).toISOString() };
describe('MemberBracketPreviewPage', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(data); });
  it('loads only the audited member endpoint and displays an explicit read-only identity', async () => {
    render(<MemberBracketPreviewPage />);
    expect(await screen.findByText('테스트 회원 기준 · 조회 전용')).toBeInTheDocument();
    expect(screen.getByText('대진표 cup')).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith('/admin/users/member/bracket-preview/audit');
    fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
    expect(screen.getByRole('alert')).toHaveTextContent('대진표만 조회');
  });
  it('removes the bracket immediately when the issued preview has expired', async () => {
    mocks.get.mockResolvedValue({ ...data, expiresAt: new Date(Date.now() - 1).toISOString() });
    render(<MemberBracketPreviewPage />);
    expect(await screen.findByText('조회 시간이 끝났어요')).toBeInTheDocument();
    expect(screen.queryByText('대진표 cup')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '회원 상세로 돌아가기' })).toHaveAttribute('href', '/admin/users/member');
  });
  it('shows permission errors instead of rendering member content', async () => {
    mocks.get.mockRejectedValue(new Error('관리자 권한이 없어요.'));
    render(<MemberBracketPreviewPage />);
    expect(await screen.findByText('관리자 권한이 없어요.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('대진표 cup')).not.toBeInTheDocument());
  });
});
