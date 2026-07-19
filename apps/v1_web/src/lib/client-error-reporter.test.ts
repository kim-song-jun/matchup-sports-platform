import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from './client-error-reporter';

describe('reportClientError', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts the error payload to the client-error endpoint', () => {
    reportClientError({ message: 'boom', level: 'error', context: { path: '/matches' } });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/logs/client-error',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ message: 'boom', level: 'error', context: { path: '/matches' } });
  });

  it('defaults to level "error" when not specified', () => {
    reportClientError({ message: 'unspecified-level' });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).level).toBe('error');
  });

  it('dedupes identical messages within the 10s window', () => {
    reportClientError({ message: 'repeat-me' });
    reportClientError({ message: 'repeat-me' });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT dedupe a same-text report when severity level differs (a 4xx warn must not suppress a genuinely different 5xx error)', () => {
    reportClientError({ message: 'Request failed', level: 'warn' });
    reportClientError({ message: 'Request failed', level: 'error' });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT dedupe a same-text, same-level report when the stack differs (different call sites are different errors)', () => {
    reportClientError({ message: 'Request failed', level: 'error', stack: 'at siteA.ts:1:1' });
    reportClientError({ message: 'Request failed', level: 'error', stack: 'at siteB.ts:2:2' });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never throws when the report request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(() => reportClientError({ message: 'unique-message-for-failure-test' })).not.toThrow();
  });

  it('never sends the query string or hash, so OAuth codes/CSRF state in the URL cannot leak', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: '/callback/kakao',
        search: '?code=super-secret-auth-code&state=csrf-token',
        hash: '',
        href: 'https://teameet.co.kr/callback/kakao?code=super-secret-auth-code&state=csrf-token',
      },
    });

    reportClientError({ message: 'oauth-callback-failed' });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.url).toBe('/callback/kakao');
    expect(body.url).not.toContain('super-secret-auth-code');
    expect(body.url).not.toContain('csrf-token');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });
});
