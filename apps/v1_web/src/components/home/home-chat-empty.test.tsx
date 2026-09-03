/**
 * 홈 "최근 채팅" 빈 상태는 공용 EmptyState(chat-empty 그래픽 + 다음 행동)다 — 2026-09-04 감사 전엔
 * 테두리 카드 + 문구 2줄이었고 홈에 EmptyState 사용이 0건이었다.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { HomePageView } from './home-page';
import { getHomeViewModel } from './home.view-model';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/home', useRouter: () => router }));
vi.mock('@/components/v1-ui/shell-override', () => ({ useShellOverride: () => undefined }));
vi.mock('@/components/lineup/lineup-todo-card', () => ({ LineupTodoCard: () => null }));
vi.mock('@/components/tournaments/pending-review-card', () => ({ PendingReviewsCard: () => null }));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AllTournaments: () => ({ data: undefined, isLoading: false, isError: false }),
  useV1LeagueMatches: () => ({ data: undefined, isLoading: false, isError: false }),
}));

describe('홈 최근 채팅 빈 상태', () => {
  it('chat-empty 그래픽과 매치 둘러보기 CTA 를 그린다', () => {
    const model = { ...getHomeViewModel(), signedOut: false, chatStatus: 'ready' as const, chatRooms: [], chatUnreadCount: 0 };
    const { container } = render(<HomePageView model={model} />);
    expect(screen.getByText('아직 열려 있는 채팅방이 없어요')).toBeInTheDocument();
    expect(queryImageBySrc(container, '/illustrations/chat-empty-640.webp')).not.toBeNull();
    expect(container.querySelector('.tm-home-chat-block .tm-home-chat-empty')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '매치 둘러보기' }));
    expect(router.push).toHaveBeenCalledWith('/matches');
  });
});
