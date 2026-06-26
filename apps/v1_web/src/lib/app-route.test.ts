import { describe, expect, it } from 'vitest';
import { appRoute } from './app-route';

describe('appRoute', () => {
  it('keeps normal local routes unprefixed', () => {
    expect(appRoute('/tournaments/t-1/my', '/home')).toBe('/tournaments/t-1/my');
  });

  it('keeps /v1 alias routes under /v1 when no configured basePath exists', () => {
    expect(appRoute('/tournaments/t-1/registrations/r-1/roster', '/v1/tournaments/t-1/my')).toBe(
      '/v1/tournaments/t-1/registrations/r-1/roster',
    );
  });

  it('does not double-prefix an already-prefixed /v1 route', () => {
    expect(appRoute('/v1/tournaments/t-1/my', '/v1/home')).toBe('/v1/tournaments/t-1/my');
  });
});
