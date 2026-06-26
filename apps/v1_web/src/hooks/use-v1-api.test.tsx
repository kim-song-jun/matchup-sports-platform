import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { v1Get } from '@/lib/api-client';
import { useV1MyRegistration } from './use-v1-api';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    v1Get: vi.fn(),
  };
});

const v1GetMock = vi.mocked(v1Get);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function TestQueryProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useV1MyRegistration', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not call the protected my-registration endpoint when disabled', () => {
    const { result } = renderHook(
      () => useV1MyRegistration('tournament-1', { enabled: false }),
      { wrapper: createWrapper() },
    );

    expect(result.current.fetchStatus).toBe('idle');
    expect(v1GetMock).not.toHaveBeenCalled();
  });

  it('keeps the default my-registration query enabled for authenticated flows', async () => {
    v1GetMock.mockResolvedValue({ id: 'registration-1', status: 'confirmed' });

    const { result } = renderHook(
      () => useV1MyRegistration('tournament-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(v1GetMock).toHaveBeenCalledWith('/tournaments/tournament-1/registrations/my-registration');
  });
});
