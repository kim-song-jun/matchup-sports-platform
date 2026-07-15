import { describe, expect, it } from 'vitest';
import { appRoute } from './app-route';

describe('appRoute', () => {
  it('returns absolute paths unchanged', () => {
    expect(appRoute('/tournaments/t-1/my')).toBe('/tournaments/t-1/my');
  });

  it('normalizes relative paths to root-absolute', () => {
    expect(appRoute('tournaments/t-1/my')).toBe('/tournaments/t-1/my');
  });

  it('handles root path', () => {
    expect(appRoute('/')).toBe('/');
  });

  it('handles empty segment with leading slash', () => {
    expect(appRoute('/home')).toBe('/home');
  });
});
