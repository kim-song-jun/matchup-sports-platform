import { beforeEach, describe, expect, it, vi } from 'vitest';

const { v1Get } = vi.hoisted(() => ({ v1Get: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Get };
});

import { fetchAllV1Tournaments } from './use-v1-api';

describe('fetchAllV1Tournaments', () => {
  beforeEach(() => {
    v1Get.mockReset();
  });

  it('loads every cursor page and removes duplicate boundary items', async () => {
    v1Get
      .mockResolvedValueOnce({
        items: [{ id: 'tournament-1' }, { id: 'tournament-2' }],
        pageInfo: { hasNext: true, nextCursor: 'cursor-2' },
      })
      .mockResolvedValueOnce({
        items: [{ id: 'tournament-2' }, { id: 'tournament-3' }],
        pageInfo: { hasNext: false, nextCursor: null },
      });

    await expect(fetchAllV1Tournaments({ status: 'open' })).resolves.toEqual([
      { id: 'tournament-1' },
      { id: 'tournament-2' },
      { id: 'tournament-3' },
    ]);
    expect(v1Get).toHaveBeenNthCalledWith(1, '/tournaments', {
      status: 'open',
      cursor: undefined,
      limit: 50,
    });
    expect(v1Get).toHaveBeenNthCalledWith(2, '/tournaments', {
      status: 'open',
      cursor: 'cursor-2',
      limit: 50,
    });
  });

  it('fails visibly when the API repeats a cursor instead of looping forever', async () => {
    v1Get
      .mockResolvedValueOnce({
        items: [{ id: 'tournament-1' }],
        pageInfo: { hasNext: true, nextCursor: 'stale-cursor' },
      })
      .mockResolvedValueOnce({
        items: [{ id: 'tournament-2' }],
        pageInfo: { hasNext: true, nextCursor: 'stale-cursor' },
      });

    await expect(fetchAllV1Tournaments()).rejects.toThrow('대회 목록 cursor');
  });
});
