import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/seo')>();
  return { ...original, fetchPublicV1: vi.fn() };
});

vi.mock('./league-match-standings-client', () => ({ default: () => null }));

import LeagueMatchPage from './page';

const LEAGUE_ID = '00000000-0000-4000-8000-000000000001';
const params = { params: Promise.resolve({ leagueId: LEAGUE_ID }) };

describe('league detail page for a league the public cannot see', () => {
  beforeEach(() => {
    vi.mocked(fetchPublicV1).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders the generic not-found screen when the API answers 404 (held, private, deleted)', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(LeagueMatchPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('keeps rendering the page when the server read fails, so the client can retry', async () => {
    vi.mocked(fetchPublicV1).mockRejectedValue(new Error('SEO metadata request failed: 503'));
    await expect(LeagueMatchPage(params)).resolves.toBeTruthy();
  });
});
