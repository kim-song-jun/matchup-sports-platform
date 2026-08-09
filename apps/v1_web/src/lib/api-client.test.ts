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

  it('strips the query string from the reported path so PII in query params is never sent to the log endpoint', async () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          status: 'error',
          statusCode: 409,
          code: 'EMAIL_TAKEN',
          message: '이미 사용중인 이메일이에요.',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    await expect(v1Get('/auth/check-email', { email: 'x@example.com' })).rejects.toThrow();

    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ path: '/auth/check-email' }),
      }),
    );
    const [[reportedPayload]] = reportSpy.mock.calls;
    const reportedContext = reportedPayload.context as Record<string, unknown>;
    expect(String(reportedContext.path)).toBe('/auth/check-email');
    expect(String(reportedContext.path)).not.toContain('?');
    expect(String(reportedContext.path)).not.toContain('x@example.com');
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

  // v1Delete 의 2번째 인자는 fetch 의 init 이 아니라 body 다. 이 구분을 놓쳐서
  // { body: JSON.stringify(payload) } 를 넘긴 호출부가 있었고, 값이 한 겹 더 감싸진 채
  // 전송돼 어드민 사용자 삭제가 프로덕션에서 계속 400 을 받았다(2026-08-03, 두 번 다 실패).
  // 타입이 unknown 이라 컴파일러가 잡아 주지 못하므로 전송되는 바이트로 못박아 둔다.
  it('두 번째 인자를 그대로 JSON body 로 보낸다 — 한 겹 더 감싸지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: { ok: true } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await v1Delete('/admin/users/user-1', { reason: '이용약관 위반' });

    const sent = fetchMock.mock.calls[0][1];
    expect(sent.method).toBe('DELETE');
    expect(JSON.parse(sent.body as string)).toEqual({ reason: '이용약관 위반' });
    // 회귀 형태를 직접 배제한다 — 감싸졌다면 최상위 키가 body 하나뿐이었을 것이다.
    expect(Object.keys(JSON.parse(sent.body as string))).not.toContain('body');
  });
});
