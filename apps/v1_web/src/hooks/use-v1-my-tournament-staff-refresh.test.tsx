import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { createV1QueryClient } from '@/lib/query-client';
import type { V1MyTournamentStaffResponse } from '@/types/api';
import { useV1MyTournamentStaffAssignments } from './use-v1-api';

vi.mock('@/lib/api-client', async () => ({
  ...await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client'),
  v1Get: vi.fn(),
}));

describe('담당 대회 권한 갱신', () => {
  it('다른 세션에서 배정과 해제 후 창으로 돌아오면 최신 담당 목록을 읽는다', async () => {
    const client = createV1QueryClient();
    let response: V1MyTournamentStaffResponse = { platformRole: null, items: [] };
    vi.mocked(v1Get).mockImplementation(async () => response as never);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(() => useV1MyTournamentStaffAssignments(), { wrapper });
    try {
      await waitFor(() => expect(hook.result.current.data?.items).toEqual([]));
      response = {
        platformRole: null,
        items: [{ tournamentId: 'assigned', tournamentTitle: '담당 대회', tournamentStatus: 'draft', assignments: [], fixtures: [] }],
      };
      act(() => { window.dispatchEvent(new Event('focus')); });
      await waitFor(() => expect(hook.result.current.data?.items[0]?.tournamentId).toBe('assigned'));
      response = { platformRole: null, items: [] };
      act(() => { window.dispatchEvent(new Event('focus')); });
      await waitFor(() => expect(hook.result.current.data?.items).toEqual([]));
    } finally {
      hook.unmount();
      client.clear();
      vi.clearAllMocks();
    }
  });
});
