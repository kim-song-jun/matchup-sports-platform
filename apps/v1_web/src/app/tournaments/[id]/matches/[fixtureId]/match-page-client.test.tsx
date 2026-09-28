import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useMyMatchRosterSide } from '@/components/game-roster/use-my-match-roster-side';
import { MatchPageClient } from './match-page-client';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/t1/matches/fx-1',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicMatch: () => ({
    data: {
      gameId: 'g1',
      tournamentTitle: '대회',
      home: { registrationId: 'r1', teamId: 'team-h', teamName: '홈' },
      away: { registrationId: 'r2', teamId: 'team-a', teamName: '원정' },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/components/public-game-records/match-detail-content', () => ({
  MatchDetailContent: ({ from, afterHeader }: { from?: string; afterHeader?: ReactNode }) => (
    <>
      <div data-testid="detail-from">{from}</div>
      <div data-testid="detail-after-header">{afterHeader}</div>
    </>
  ),
}));
vi.mock('@/components/public-game-records/attest-requests', () => ({ AttestRequestsSection: () => null }));
vi.mock('@/components/public-game-records/claim-my-record', () => ({ ClaimMyRecordSection: () => null }));
vi.mock('@/components/tournaments/tournament-inquiry-section', () => ({ TournamentInquirySection: () => null }));
// 우리 팀 판별·카드 내부는 match-team-roster-card.test.tsx 가 실제 훅으로 검증한다.
vi.mock('@/components/game-roster/use-my-match-roster-side', () => ({
  useMyMatchRosterSide: vi.fn(() => ({ status: 'resolved', teamId: 'team-a', gameId: 'g1', sideId: 's2' })),
}));
vi.mock('@/components/game-roster/match-team-roster-card', () => ({
  MatchTeamRosterCard: ({ side }: { side: { status: string } }) => <div data-testid="roster-card">{side.status}</div>,
}));

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

  it('두 팀 id·gameId·대진 id 로 우리 팀을 찾고, 우리 팀 출전 카드를 기록 헤더 바로 아래에 둔다', () => {
    render(<MatchPageClient tournamentId="t1" fixtureId="fx-1" />);
    expect(vi.mocked(useMyMatchRosterSide)).toHaveBeenLastCalledWith({
      teamIds: ['team-h', 'team-a'],
      gameId: 'g1',
      teamMatchId: 'fx-1',
    });
    expect(screen.getByTestId('detail-after-header')).toContainElement(screen.getByTestId('roster-card'));
  });
});
