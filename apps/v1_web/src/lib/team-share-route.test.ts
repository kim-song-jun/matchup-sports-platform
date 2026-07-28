import { describe, expect, it } from 'vitest';
import { teamSharePath } from './team-share-route';

describe('teamSharePath', () => {
  it('uses the root route for shared team links', () => {
    expect(teamSharePath('team-1')).toBe('/teams/team-1');
  });
});
