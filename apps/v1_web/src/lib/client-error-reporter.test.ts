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

  it('never throws when the report request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(() => reportClientError({ message: 'unique-message-for-failure-test' })).not.toThrow();
  });
});
