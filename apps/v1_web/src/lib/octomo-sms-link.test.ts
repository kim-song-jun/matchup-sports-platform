import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSmsLink } from './octomo-sms-link';

afterEach(() => vi.unstubAllGlobals());

describe('buildSmsLink', () => {
  it('uses ?body= on Android', () => {
    vi.stubGlobal('navigator', { userAgent: 'Android' });
    expect(buildSmsLink('16663538', 'ABC123')).toBe('sms:16663538?body=ABC123');
  });

  it('uses &body= on iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' });
    expect(buildSmsLink('16663538', 'ABC123')).toBe('sms:16663538&body=ABC123');
  });

  it('percent-encodes the body text', () => {
    vi.stubGlobal('navigator', { userAgent: 'Android' });
    expect(buildSmsLink('16663538', 'A B+C')).toBe('sms:16663538?body=A%20B%2BC');
  });
});
