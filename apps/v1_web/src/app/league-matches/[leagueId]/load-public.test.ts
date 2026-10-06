import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchPublicV1: vi.fn() }));

vi.mock('@/lib/seo', () => ({ fetchPublicV1: mocks.fetchPublicV1 }));

const { loadPublic } = await import('./load-public');

beforeEach(() => {
  mocks.fetchPublicV1.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadPublic', () => {
  it('bypasses cached public data for publication-sensitive league SSR reads', async () => {
    mocks.fetchPublicV1.mockResolvedValue({ leagueId: 'league-1' });

    await expect(loadPublic('/league-matches/league-1')).resolves.toEqual({
      ok: true,
      data: { leagueId: 'league-1' },
    });
    expect(mocks.fetchPublicV1).toHaveBeenCalledWith('/league-matches/league-1', { cache: 'no-store' });
  });
});
