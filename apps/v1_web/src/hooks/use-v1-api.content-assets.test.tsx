import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useV1UploadAdminContentAsset } from './use-v1-api';

describe('useV1UploadAdminContentAsset', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the files multipart field and returns the direct API asset', async () => {
    const asset = {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      url: '/uploads/2026/07/123e4567-e89b-42d3-a456-426614174000.webp',
      status: 'temporary' as const,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({ status: 'success', data: asset, timestamp: new Date().toISOString() }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useV1UploadAdminContentAsset(), { wrapper });
    const file = new File(['image'], 'notice.webp', { type: 'image/webp' });

    await expect(act(() => result.current.mutateAsync(file))).resolves.toEqual(asset);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/admin/content-assets');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const body = init.body as FormData;
    expect(body.get('files')).toBe(file);
    expect(body.has('file')).toBe(false);
  });
});
