import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamMatch } from '@/types/api';
import { TeamMatchOperateEntry } from './team-match-operate-entry';

const teamMatchQuery = vi.hoisted(() => ({
  current: {
    data: undefined as V1TeamMatch | undefined,
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  calls: [] as Array<{
    teamMatchId: string;
    options: { refetchInterval: number; refetchOnWindowFocus: 'always' };
  }>,
}));
const operateConsole = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1TeamMatch: (teamMatchId: string, options: { refetchInterval: number; refetchOnWindowFocus: 'always' }) => {
    teamMatchQuery.calls.push({ teamMatchId, options });
    return teamMatchQuery.current;
  },
}));
vi.mock('@/components/tournament-live/operate/operate-console', () => ({
  TeamMatchOperateConsole: (props: unknown) => operateConsole.render(props),
}));

function renderEntry(teamMatchId = 'team-match-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TeamMatchOperateEntry teamMatchId={teamMatchId} />
    </QueryClientProvider>,
  );
}

function recruitingMatch(overrides: Partial<V1TeamMatch> = {}): V1TeamMatch {
  const baseViewer: NonNullable<V1TeamMatch['viewer']> = {
    state: 'none',
    applicationId: null,
    participantId: null,
    canApply: false,
    manageableHostTeam: true,
    manageableOpponentTeam: false,
  };
  const base: V1TeamMatch = {
    id: 'team-match-1',
    teamMatchId: 'team-match-1',
    title: '수요일 풋살 매치',
    sportName: '풋살',
    placeName: '시민 풋살장',
    startsAt: '2026-11-04T10:00:00.000Z',
    capacityText: '5:5',
    status: 'recruiting',
    gameId: 'game-1',
    periods: [
      { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
      { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
    ],
    viewer: baseViewer,
    league: null,
  };
  const viewerOverrides = overrides.viewer;
  const viewer: NonNullable<V1TeamMatch['viewer']> = viewerOverrides
    ? { ...baseViewer, ...viewerOverrides }
    : baseViewer;
  return { ...base, ...overrides, viewer };
}

describe('TeamMatchOperateEntry recruiting preview', () => {
  beforeEach(() => {
    operateConsole.render.mockClear();
    teamMatchQuery.calls = [];
    teamMatchQuery.current = {
      data: recruitingMatch(),
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    };
  });

  afterEach(() => cleanup());

  it('shows the saved two-period durations without exposing live controls', () => {
    renderEntry();

    expect(screen.getByRole('heading', { name: '경기 규칙 미리보기' })).toBeInTheDocument();
    expect(screen.getByText('전반')).toBeInTheDocument();
    expect(screen.getAllByText('20분')).toHaveLength(2);
    expect(screen.getByText('후반')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /경기 시작|경기 종료|골|파울/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '팀매치 상세로' })).toHaveAttribute('href', '/team-matches/team-match-1');
    expect(operateConsole.render).not.toHaveBeenCalled();
  });

  it('shows a saved single-period duration from the TeamMatch response', () => {
    teamMatchQuery.current.data = recruitingMatch({
      periods: [{ code: 'SINGLE', label: '단판', durationMinutes: 35, extraTime: false }],
    });

    renderEntry();

    expect(screen.getByText('단판')).toBeInTheDocument();
    expect(screen.getByText('35분')).toBeInTheDocument();
    expect(screen.queryByText(/전반|후반/)).not.toBeInTheDocument();
  });

  it('does not disclose rule details to a viewer without host-management permission', () => {
    teamMatchQuery.current.data = recruitingMatch({
      periods: [{ code: 'SINGLE', label: '단판', durationMinutes: 35, extraTime: false }],
      viewer: {
        state: 'none',
        applicationId: null,
        participantId: null,
        canApply: false,
        manageableHostTeam: false,
        manageableOpponentTeam: false,
      },
    });

    renderEntry();

    expect(screen.getByRole('alert')).toHaveTextContent('호스트 팀장이나 매니저만 볼 수 있어요.');
    expect(screen.queryByText('단판')).not.toBeInTheDocument();
  });

  it('does not show guessed rules when the saved periods are absent', () => {
    teamMatchQuery.current.data = recruitingMatch({ periods: null });

    renderEntry();

    expect(screen.getByText('저장된 경기 시간 정보가 없어요.')).toBeInTheDocument();
    expect(screen.queryByText(/분/)).not.toBeInTheDocument();
  });

  it('shows loading and retryable error states', () => {
    teamMatchQuery.current = {
      data: undefined,
      isLoading: true,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    };
    const { rerender } = renderEntry();
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중이에요.');

    teamMatchQuery.current = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network'),
      refetch: vi.fn(),
    };
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <TeamMatchOperateEntry teamMatchId="team-match-1" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
  });

  it('polls and refetches on window focus so live match state and host access stay current', () => {
    renderEntry();

    expect(teamMatchQuery.calls.at(-1)).toEqual({
      teamMatchId: 'team-match-1',
      options: { refetchInterval: 15_000, refetchOnWindowFocus: 'always' },
    });
  });

  it('reflects a refreshed completion or changed host permission instead of keeping the old live entry', () => {
    const { rerender } = renderEntry();
    teamMatchQuery.current = {
      data: recruitingMatch({ status: 'completed' }),
      isLoading: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    };

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <TeamMatchOperateEntry teamMatchId="team-match-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('link', { name: '경기 결과 보기' })).toHaveAttribute(
      'href',
      '/team-matches/team-match-1/result',
    );
    expect(operateConsole.render).not.toHaveBeenCalled();
  });
});
