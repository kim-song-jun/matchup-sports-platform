import { afterEach, describe, expect, it, vi } from 'vitest';
import { getV1ApiBaseUrl, getV1DevAuthHeaders, v1Delete, v1Get } from './api-client';
import { V1_USER_EMAIL_KEY, V1_USER_ID_KEY } from './session-storage';
import * as clientErrorReporter from './client-error-reporter';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe('getV1ApiBaseUrl', () => {
  it('uses the root-mounted backend API by default', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');

    expect(getV1ApiBaseUrl()).toBe('/api/v1');
  });
});

describe('getV1DevAuthHeaders', () => {
  it('never forwards local identity values in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    window.localStorage.setItem(V1_USER_ID_KEY, 'admin-user');
    window.localStorage.setItem(V1_USER_EMAIL_KEY, 'admin@example.com');

    const headers = getV1DevAuthHeaders() as Record<string, string>;

    expect(headers['x-v1-user-id']).toBeUndefined();
    expect(headers['x-v1-user-email']).toBeUndefined();
    expect(headers['x-v1-search-session-id']).toBeTruthy();
  });
});

describe('v1Api error reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports API errors to the client-error reporter before rethrowing', async () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          status: 'error',
          statusCode: 409,
          code: 'ALREADY_JOINED',
          message: '이미 참가했어요.',
          requestId: 'req-abc',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    await expect(v1Get('/matches/1')).rejects.toThrow('이미 참가했어요.');

    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '이미 참가했어요.',
        level: 'warn',
        context: expect.objectContaining({ statusCode: 409, code: 'ALREADY_JOINED', requestId: 'req-abc' }),
      }),
    );
  });

  it('reports 5xx as level "error"', async () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          status: 'error',
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: '서버 오류가 발생했어요.',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    await expect(v1Get('/matches/1')).rejects.toThrow();

    expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
  });

  it('resolves without throwing on a 204 No Content response with an empty body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      }),
    );

    await expect(v1Delete('/notifications/push-unsubscribe', { endpoint: 'https://push.example/abc' })).resolves.toBeUndefined();
  });
});
