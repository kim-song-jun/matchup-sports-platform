import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import { server } from '@/test/msw/server';
import type { V1TeamMatch, V1TeamMatchPeriod } from '@/types/api';
import { TeamMatchDetailPageClient } from './team-matches-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/team-matches/mdqa141-detail',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean }) => <a {...props} href={href} />,
}));

const matchId = 'mdqa141-detail';
const queryClients: QueryClient[] = [];
const singlePeriod = (durationMinutes: number): readonly V1TeamMatchPeriod[] => [
  { code: 'SINGLE_PERIOD', label: '단판', durationMinutes, extraTime: false },
];

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((queryClient) => queryClient.clear());
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

describe('MD-QA #141 actual detail API periods readback', () => {
  it('displays pinned minutes instead of reservation length and refreshes from the current detail response', async () => {
    // Given: the real detail hook receives a 37-minute pinned rule inside a 120-minute reservation.
    let periods = singlePeriod(37);
    let detailReads = 0;
    server.use(
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
      http.get('*/api/v1/team-matches/' + matchId, () => {
        detailReads += 1;
        const detail: V1TeamMatch = {
          id: matchId, teamMatchId: matchId, title: '저장 규칙 상세 조회 경기',
          sportName: '풋살', sport: { sportId: 'sport-futsal', name: '풋살' },
          placeName: '합성 규칙 경기장', startsAt: '2030-10-10T09:00:00.000Z',
          endsAt: '2030-10-10T11:00:00.000Z', capacityText: '1/2', status: 'recruiting',
          hostTeam: { teamId: 'mdqa141-host', name: '합성 규칙 팀' },
          viewerState: 'guest', viewer: {
            state: 'guest', applicationId: null, participantId: null, canApply: false, canChat: false,
          }, periods,
        };
        return HttpResponse.json({ status: 'success', data: detail, timestamp: new Date().toISOString() });
      }),
    );
    const queryClient = createV1QueryClient();
    queryClients.push(queryClient);
    render(<QueryClientProvider client={queryClient}><TeamMatchDetailPageClient teamMatchId={matchId} /></QueryClientProvider>);
    await screen.findAllByText('저장 규칙 상세 조회 경기');
    expect(screen.getByText('경기 규칙').closest('.tm-info-row')).toHaveTextContent('단판 · 37분');
    expect(screen.queryByText('단판 · 120분')).not.toBeInTheDocument();

    // When: the same current route re-reads an updated server-pinned duration.
    periods = singlePeriod(43);
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: v1Keys.teamMatch(matchId), exact: true });
    });

    // Then: both the actual hook-to-model mapping and actual detail view use the new API value.
    await waitFor(() => expect(screen.getByText('경기 규칙').closest('.tm-info-row')).toHaveTextContent('단판 · 43분'));
    expect(screen.queryByText('단판 · 37분')).not.toBeInTheDocument();
    expect(detailReads).toBe(2);
  });
});
