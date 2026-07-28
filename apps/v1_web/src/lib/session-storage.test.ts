import { describe, expect, it } from 'vitest';
import { sanitizeRedirectPath } from './session-storage';

describe('sanitizeRedirectPath', () => {
  it('keeps safe root redirects', () => {
    expect(sanitizeRedirectPath('/my?tab=teams')).toBe('/my?tab=teams');
  });

  it('rejects login redirect loops', () => {
    expect(sanitizeRedirectPath('/login?redirect=%2Fmy')).toBeNull();
  });

  it('rejects protocol-relative redirects', () => {
    expect(sanitizeRedirectPath('//example.com')).toBeNull();
  });
});
