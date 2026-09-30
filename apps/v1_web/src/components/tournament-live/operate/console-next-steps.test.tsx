import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleNextSteps } from './console-next-steps';

const mocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: (...args: unknown[]) => mocks.useV1Tournament(...args),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.usePathname(),
}));

const LEAGUE_DETAIL = {
  kind: 'regular_league',
  fixtures: [],
  leagueFixtures: [
    { teamMatchId: 'm1', title: '1주차 1경기', startAt: '2026-09-30T01:10:00Z', status: 'completed' },
    { teamMatchId: 'm2', title: '2주차 1경기', startAt: '2026-10-07T01:10:00Z', status: 'matched' },
  ],
};

describe('ConsoleNextSteps', () => {
  beforeEach(() => {
    mocks.usePathname.mockReturnValue('/admin/live/league-1/fixtures/m1/operate');
  });

  it('리그: 리그 순위표와 어드민 콘솔 경로의 다음 경기로 이어진다', () => {
    mocks.useV1Tournament.mockReturnValue({ data: LEAGUE_DETAIL });
    render(<ConsoleNextSteps tournamentId="league-1" fixtureId="m1" />);

    expect(screen.getByRole('link', { name: '순위표 보기' })).toHaveAttribute('href', '/league-matches/league-1');
    expect(screen.getByRole('link', { name: /다음 경기 · 2주차 1경기/ })).toHaveAttribute(
      'href',
      '/admin/live/league-1/fixtures/m2/operate',
    );
  });

  it('스태프 표면에서 열었으면 스태프 콘솔 경로로 이어진다', () => {
    mocks.usePathname.mockReturnValue('/tournament-ops/tournaments/league-1/fixtures/m1/operate');
    mocks.useV1Tournament.mockReturnValue({ data: LEAGUE_DETAIL });
    render(<ConsoleNextSteps tournamentId="league-1" fixtureId="m1" />);

    expect(screen.getByRole('link', { name: /다음 경기/ })).toHaveAttribute(
      'href',
      '/tournament-ops/tournaments/league-1/fixtures/m2/operate',
    );
  });

  it('대회: 대회 결과 화면으로 이어지고, 남은 경기가 없으면 다음 경기 링크가 없다', () => {
    mocks.usePathname.mockReturnValue('/tournament-ops/tournaments/t-1/fixtures/f1/operate');
    mocks.useV1Tournament.mockReturnValue({
      data: {
        kind: 'regular_tournament',
        leagueFixtures: [],
        fixtures: [{ id: 'f1', scheduledAt: '2026-09-30T01:00:00Z', liveStatus: 'ended', homeTeamName: 'A', awayTeamName: 'B' }],
      },
    });
    render(<ConsoleNextSteps tournamentId="t-1" fixtureId="f1" />);

    expect(screen.getByRole('link', { name: '대회 결과 보기' })).toHaveAttribute('href', '/tournaments/t-1/results');
    expect(screen.queryByRole('link', { name: /다음 경기/ })).toBeNull();
  });

  it('대회 상세를 아직 못 받았으면 다음 경기를 지어내지 않는다', () => {
    mocks.useV1Tournament.mockReturnValue({ data: undefined });
    render(<ConsoleNextSteps tournamentId="league-1" fixtureId="m1" />);

    expect(screen.queryByRole('link', { name: /다음 경기/ })).toBeNull();
  });
});
