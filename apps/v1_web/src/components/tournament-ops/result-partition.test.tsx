import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { partitionResultFixtures, usePendingResultCount } from './result-partition';

const row = (fixtureId: string, gameId: string | null, revisionId: string | null, currentRevisionState?: string) => ({ fixtureId, gameId, revisionId, currentRevisionState });

describe('partitionResultFixtures', () => {
  const none: ReadonlySet<string> = new Set();

  it('확정된 결과가 없으면 확정 대기다', () => {
    const { pending, confirmed, voided } = partitionResultFixtures([row('a', 'g-a', null)], none);
    expect(pending.map((r) => r.fixtureId)).toEqual(['a']);
    expect(confirmed).toEqual([]);
    expect(voided).toEqual([]);
  });

  it('확정된 결과가 있어도 검토 기한을 넘겼으면 확정 대기다', () => {
    const { pending, confirmed } = partitionResultFixtures([row('a', 'g-a', 'r-a')], new Set(['a']));
    expect(pending.map((r) => r.fixtureId)).toEqual(['a']);
    expect(confirmed).toEqual([]);
  });

  it('확정된 결과가 있으면 확정됨이다', () => {
    const { pending, confirmed } = partitionResultFixtures([row('a', 'g-a', 'r-a')], none);
    expect(pending).toEqual([]);
    expect(confirmed.map((r) => r.fixtureId)).toEqual(['a']);
  });

  it('무효 처리된 결과는 확정 대기도 확정됨도 아닌 무효 묶음이다(카드와 같은 분류)', () => {
    const { pending, confirmed, voided } = partitionResultFixtures(
      [row('a', 'g-a', 'r-a', 'VOID'), row('b', 'g-b', 'r-b', 'VOID'), row('c', 'g-c', 'r-c', 'OFFICIAL')],
      new Set(['b']),
    );
    expect(voided.map((r) => r.fixtureId)).toEqual(['a', 'b']);
    expect(pending).toEqual([]);
    expect(confirmed.map((r) => r.fixtureId)).toEqual(['c']);
  });

  it('경기가 만들어지지 않은 행(gameId 없음)은 어느 쪽에도 없다', () => {
    const { pending, confirmed } = partitionResultFixtures([row('a', null, null), row('b', null, 'r-b')], none);
    expect(pending).toEqual([]);
    expect(confirmed).toEqual([]);
  });

  it('한 경기는 한 묶음에만 있고 입력 순서를 지킨다', () => {
    const { pending, confirmed } = partitionResultFixtures(
      [row('a', 'g-a', null), row('b', 'g-b', 'r-b'), row('c', 'g-c', 'r-c'), row('d', 'g-d', null)],
      new Set(['c']),
    );
    expect(pending.map((r) => r.fixtureId)).toEqual(['a', 'c', 'd']);
    expect(confirmed.map((r) => r.fixtureId)).toEqual(['b']);
  });
});

const requests: string[] = [];
const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:id/operations', ({ request }) => {
    requests.push(new URL(request.url).search);
    return HttpResponse.json({
      status: 'success',
      timestamp: 't',
      data: {
        items: [
          { fixtureId: 'f1', gameId: 'g1', revisionId: null },
          { fixtureId: 'f2', gameId: 'g2', revisionId: 'r2' },
          { fixtureId: 'f3', gameId: 'g3', revisionId: 'r3' },
        ],
        nextCursor: null,
        watermark: 'w',
        liveWarnings: [{ fixtureId: 'f3', warnings: ['RESULT_REVIEW_OVERDUE'] }],
      },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  requests.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('usePendingResultCount', () => {
  it('확정 대기(결과 없음 + 검토 기한 초과)만 센다', async () => {
    const { result } = renderHook(() => usePendingResultCount('t-1', true), { wrapper });
    await waitFor(() => expect(result.current).toBe(2));
    expect(requests[0]).toContain('status=ENDED');
  });

  it('enabled 가 false 면 읽지 않고 0 이다', async () => {
    const { result } = renderHook(() => usePendingResultCount('t-1', false), { wrapper });
    expect(result.current).toBe(0);
    expect(requests).toHaveLength(0);
  });
});
