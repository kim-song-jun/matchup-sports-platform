import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BracketScheduleTab } from './bracket-page-client';

const playerRecords = {
  goals: [
    { userId: 'user-1', nickname: '득점왕', goals: 3, assists: 0, profileHref: '/users/user-1' },
    { userId: 'user-2', nickname: '두번째', goals: 1, assists: 0, profileHref: '/users/user-2' },
  ],
  assists: [{ userId: 'user-2', nickname: '두번째', goals: 1, assists: 2, profileHref: '/users/user-2' }],
};

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTournamentSchedule: () => ({
    data: {
      pages: [{
        tournamentId: 'tour-1',
        tournamentTitle: '테스트 대회',
        bracketPublished: true,
        items: [],
        unscheduled: [],
        standings: [],
        nextCursor: null,
      }],
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  usePublicTournamentPlayerRecords: () => ({ data: playerRecords, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTournamentFixtures: () => ({ data: undefined }),
  useV1Tournament: vi.fn(),
}));

describe('BracketScheduleTab — 개인 기록 순위의 프로필 링크', () => {
  it('득점·도움 순위 행이 이 화면을 from 으로 싣고 프로필로 간다', () => {
    const from = '/tournaments/tour-1/bracket';
    render(<BracketScheduleTab tournamentId="tour-1" fromHref={from} />);

    const expected = `/users/user-1?from=${encodeURIComponent(from)}`;
    expect(screen.getByRole('link', { name: /득점 순위 1위 득점왕/ })).toHaveAttribute('href', expected);
    expect(screen.getByRole('link', { name: /도움 순위 1위 두번째/ })).toHaveAttribute(
      'href',
      `/users/user-2?from=${encodeURIComponent(from)}`,
    );
  });

  it('대조군: 출처를 모르면(from 없음) 서버가 준 href 그대로 둔다', () => {
    render(<BracketScheduleTab tournamentId="tour-1" />);
    expect(screen.getByRole('link', { name: /득점 순위 1위 득점왕/ })).toHaveAttribute('href', '/users/user-1');
  });

  it('악성 from(외부 주소·프로토콜 상대)은 싣지 않는다', () => {
    render(<BracketScheduleTab tournamentId="tour-1" fromHref="//evil.example/x" />);
    expect(screen.getByRole('link', { name: /득점 순위 1위 득점왕/ })).toHaveAttribute('href', '/users/user-1');
  });
});
