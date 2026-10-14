import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { OPERATIONS_BOARD_POLL_INTERVAL_MS } from '@/lib/operations-board-polling';
import { useV1TournamentFields } from './use-v1-api';

let fields = [{ id: 'a', name: 'A구장' }];
const clients: ReturnType<typeof createV1QueryClient>[] = [];
const server = setupServer(http.get('*/api/v1/tournament-ops/tournaments/league-1/fields', () =>
  HttpResponse.json({ status: 'success', data: { items: fields } }),
));
function createTab(enabled = true) {
  const client = createV1QueryClient();
  clients.push(client);
  return renderHook(() => useV1TournamentFields('league-1', { enabled }), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { fields = [{ id: 'a', name: 'A구장' }]; focusManager.setFocused(true); });
afterEach(() => {
  cleanup(); clients.splice(0).forEach((client) => client.clear());
  focusManager.setFocused(undefined); vi.useRealTimers();
});
afterAll(() => server.close());

describe('MD-QA #152 — 별도 탭에서 추가한 필드 조회', () => {
  it('60초 캐시가 fresh여도 화면 복귀 시 새 선택지를 다시 읽는다', async () => {
    const tab = createTab();
    await waitFor(() => expect(tab.result.current.data?.items).toHaveLength(1));
    fields = [...fields, { id: 'c', name: 'C구장' }];
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(tab.result.current.data?.items.map((field) => field.name)).toEqual(['A구장', 'C구장']));
  });

  it('창이 계속 열려 있어도 운영 보드와 같은 주기로 새 선택지를 읽는다', async () => {
    const tab = createTab();
    await waitFor(() => expect(tab.result.current.data?.items).toHaveLength(1));
    fields = [...fields, { id: 'c', name: 'C구장' }];
    await waitFor(() => expect(tab.result.current.data?.items).toHaveLength(2), { timeout: OPERATIONS_BOARD_POLL_INTERVAL_MS + 2_000 });
  }, OPERATIONS_BOARD_POLL_INTERVAL_MS + 5_000);

  it('조회가 비활성화된 화면은 창 복귀나 타이머로 요청하지 않는다', async () => {
    const tab = createTab(false);
    act(() => { window.dispatchEvent(new Event('focus')); focusManager.setFocused(false); focusManager.setFocused(true); });
    expect(tab.result.current.fetchStatus).toBe('idle');
    expect(tab.result.current.data).toBeUndefined();
  });
});
