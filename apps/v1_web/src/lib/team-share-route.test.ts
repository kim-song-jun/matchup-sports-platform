import { afterEach, describe, expect, it } from 'vitest';
import { teamSharePath } from './team-share-route';

describe('teamSharePath', () => {
  const originalBasePath = process.env.NEXT_PUBLIC_BASE_PATH;

  afterEach(() => {
    if (originalBasePath == null) {
      delete process.env.NEXT_PUBLIC_BASE_PATH;
    } else {
      process.env.NEXT_PUBLIC_BASE_PATH = originalBasePath;
    }
  });

  it('uses the /v1 route for shared team links', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;

    expect(teamSharePath('team-1', '/teams/team-1')).toBe('/v1/teams/team-1');
  });

  it('does not double-prefix when the current route is already under /v1', () => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;

    expect(teamSharePath('team-1', '/v1/teams/team-1')).toBe('/v1/teams/team-1');
  });

  it('uses the configured base path when provided', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/v1';

    expect(teamSharePath('team-1', '/teams/team-1')).toBe('/v1/teams/team-1');
  });
});
