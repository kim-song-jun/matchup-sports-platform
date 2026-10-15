import { describe, expect, it, vi } from 'vitest';
vi.mock('@next/bundle-analyzer', () => ({ default: () => (config: unknown) => config }));
import config from '../../next.config';

describe('historical league detail redirects', () => {
  it('redirects only detail roots to the canonical page', async () => {
    const redirects = await config.redirects!();
    expect(redirects).toEqual(expect.arrayContaining([
      { source: '/league-matches/:id', destination: '/tournaments/:id', permanent: false },
      { source: '/leagues/:id', destination: '/tournaments/:id', permanent: false },
    ]));
    expect(redirects.filter(r => r.source.startsWith('/league')).map(r => r.source)).toEqual(['/league-matches/:id', '/leagues/:id']);
  });
});
