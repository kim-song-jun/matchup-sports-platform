import { CallHandler, ExecutionContext, HttpException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PinoLogger } from 'nestjs-pino';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { UserMutationLoggingInterceptor } from './user-mutation-logging.interceptor';

const USER_ID = 'ab200000-0000-4000-8000-000000000001';

describe(UserMutationLoggingInterceptor.name, () => {
  const logger = { info: jest.fn(), warn: jest.fn() };
  const interceptor = new UserMutationLoggingInterceptor();
  const originalRootLogger = PinoLogger.root;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(PinoLogger, 'root', {
      configurable: true,
      value: logger,
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(PinoLogger, 'root', {
      configurable: true,
      value: originalRootLogger,
      writable: true,
    });
  });

  it('logs one compact event for an authenticated mutation', async () => {
    const context = httpContext({
      method: 'PATCH',
      route: { path: '/api/v1/teams/:teamId' },
      originalUrl: '/api/v1/teams/team-secret?email=hidden@example.com',
      body: { password: 'must-not-appear' },
      headers: { authorization: 'Bearer must-not-appear' },
      id: 'req-159',
      v1User: { id: USER_ID },
    });

    await firstValueFrom(interceptor.intercept(context, handler(of({ ok: true }))));

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'user_mutation',
        context: UserMutationLoggingInterceptor.name,
        actorUserIdHash: createHash('sha256').update(USER_ID).digest('hex').slice(0, 24),
        method: 'PATCH',
        route: '/api/v1/teams/:teamId',
        outcome: 'success',
        statusCode: 200,
        requestId: 'req-159',
      }),
      'Authenticated user mutation completed',
    );

    const payload = logger.info.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(
      [
        'actorUserIdHash',
        'context',
        'durationMs',
        'event',
        'method',
        'outcome',
        'requestId',
        'route',
        'statusCode',
      ].sort(),
    );
    expect(JSON.stringify(payload)).not.toContain(USER_ID);
    expect(JSON.stringify(payload)).not.toContain('team-secret');
    expect(JSON.stringify(payload)).not.toContain('hidden@example.com');
    expect(JSON.stringify(payload)).not.toContain('must-not-appear');
  });

  it('logs a failed mutation once and preserves the original error', async () => {
    const expected = new HttpException('denied', 403);
    const context = httpContext({
      method: 'DELETE',
      route: { path: '/api/v1/reviews/:reviewId' },
      id: 42,
      v1User: { id: USER_ID },
    });

    await expect(
      firstValueFrom(interceptor.intercept(context, handler(throwError(() => expected)))),
    ).rejects.toBe(expected);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'user_mutation',
        context: UserMutationLoggingInterceptor.name,
        method: 'DELETE',
        route: '/api/v1/reviews/:reviewId',
        outcome: 'failure',
        statusCode: 403,
        requestId: '42',
      }),
      'Authenticated user mutation failed',
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does not let a logger failure break a successful mutation', async () => {
    logger.info.mockImplementationOnce(() => {
      throw new Error('logger unavailable');
    });
    const context = httpContext({
      method: 'POST',
      route: { path: '/api/v1/teams' },
      v1User: { id: USER_ID },
    });

    await expect(
      firstValueFrom(interceptor.intercept(context, handler(of({ id: 'team-1' })))),
    ).resolves.toEqual({ id: 'team-1' });
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['read request', { method: 'GET', route: { path: '/api/v1/teams' }, v1User: { id: USER_ID } }],
    ['anonymous mutation', { method: 'POST', route: { path: '/api/v1/teams' } }],
    ['chat mutation', { method: 'POST', route: { path: '/api/v1/chat/rooms/:roomId/messages' }, v1User: { id: USER_ID } }],
    ['notification mutation', { method: 'PATCH', route: { path: '/api/v1/notifications/:id/read' }, v1User: { id: USER_ID } }],
    ['admin mutation', { method: 'PATCH', route: { path: '/api/v1/admin/users/:id' }, v1User: { id: USER_ID } }],
    ['operation mutation', { method: 'POST', route: { path: '/api/v1/tournament-ops/jobs/:id/retry' }, v1User: { id: USER_ID } }],
    ['unresolved route', { method: 'POST', route: undefined, v1User: { id: USER_ID } }],
  ])('does not log a %s', async (_label, request) => {
    const context = httpContext(request);
    await firstValueFrom(interceptor.intercept(context, handler(of({ ok: true }))));
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

function handler(stream: Observable<unknown>): CallHandler {
  return { handle: () => stream };
}

function httpContext(request: Record<string, unknown>): ExecutionContext {
  const response = { statusCode: 200 };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}
