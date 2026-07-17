import { describe, expect, it } from 'vitest';
import { appRoute } from './app-route';

describe('appRoute', () => {
  it('keeps absolute application routes at the root', () => {
    expect(appRoute('/tournaments/t-1/my')).toBe('/tournaments/t-1/my');
  });

  it('normalizes relative application routes to the root', () => {
    expect(appRoute('tournaments/t-1/my')).toBe('/tournaments/t-1/my');
  });
});
