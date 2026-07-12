import { afterEach, describe, expect, it } from 'vitest';
import { appRoute } from './app-route';

const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

afterEach(() => {
  if (originalBasePath === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  } else {
    process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;
  }
});

describe('appRoute', () => {
  it('keeps normal local routes unprefixed', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;

    expect(appRoute('/tournaments/t-1/my', '/home')).toBe('/tournaments/t-1/my');
  });

  it('keeps /v1 alias routes under /v1 when no configured basePath exists', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;

    expect(appRoute('/tournaments/t-1/registrations/r-1/roster', '/v1/tournaments/t-1/my')).toBe(
      '/v1/tournaments/t-1/registrations/r-1/roster',
    );
  });

  it('does not double-prefix an already-prefixed /v1 route', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;

    expect(appRoute('/v1/tournaments/t-1/my', '/v1/home')).toBe('/v1/tournaments/t-1/my');
  });

  it('strips configured basePath for Next router hrefs', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    expect(appRoute('/v1/tournaments/t-1/my', '/v1/home')).toBe('/tournaments/t-1/my');
  });
});
