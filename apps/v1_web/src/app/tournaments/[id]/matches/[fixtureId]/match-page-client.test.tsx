import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchPageClient } from './match-page-client';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1/matches/fx-1',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicMatch: () => ({ data: { gameId: 'g1', tournamentTitle: '대회' }, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/components/public-game-records/match-detail-content', () => ({
  MatchDetailContent: ({ from }: { from?: string }) => <div data-testid="detail-from">{from}</div>,
}));
vi.mock('@/components/public-game-records/attest-requests', () => ({ AttestRequestsSection: () => null }));
vi.mock('@/components/public-game-records/claim-my-record', () => ({ ClaimMyRecordSection: () => null }));
vi.mock('@/components/tournaments/tournament-inquiry-section', () => ({ TournamentInquirySection: () => null }));

describe('MatchPageClient', () => {
  // 경기 기록 안의 팀·다음 경기 링크에서 뒤로가면 받은 출처까지 담은 이 화면으로 돌아와야 한다.
  it.each([
    ['받은 출처가 있으면 그것까지 담은 현재 URL', 'from=%2Fteams%2Ft9%2Frecords', '/tournaments/t1/matches/fx-1?from=%2Fteams%2Ft9%2Frecords'],
    ['출처가 없으면 현재 경로', '', '/tournaments/t1/matches/fx-1'],
  ])('경기 기록 링크에 %s 를 출처로 넘긴다', (_label, search, expected) => {
    navigation.search = search;
    render(<MatchPageClient tournamentId="t1" fixtureId="fx-1" />);
    expect(screen.getByTestId('detail-from')).toHaveTextContent(expected);
    navigation.search = '';
  });
});
