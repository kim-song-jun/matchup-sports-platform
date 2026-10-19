import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BracketScheduleTab } from './bracket-page-client';

// 공개 순위·브래킷 일정 탭은 개인 득점·도움 순위를 그리지 않는다(PR #1999). 예전에는 이 순위 행이
// 선수 프로필 링크에 출처(from)를 실었다 — 그 출처 검증(외부·프로토콜 상대 주소 차단)은 이제
// `withFromPath` 단위 테스트(`lib/session-storage.test.ts`)가 맡는다.
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

describe('BracketScheduleTab — 개인 기록 순위를 그리지 않는다', () => {
  it.each([
    ['출처 있음', '/tournaments/tour-1/bracket'],
    ['출처 없음', undefined],
    ['악성 출처', '//evil.example/x'],
  ])('%s — 선수 기록이 있어도 득점·도움 순위와 선수 프로필 링크가 없다', (_label, from) => {
    render(<BracketScheduleTab tournamentId="tour-1" fromHref={from} />);

    expect(screen.queryByRole('link', { name: /득점 순위/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /도움 순위/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/users/'))).toHaveLength(0);
  });
});
