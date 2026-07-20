import { ArgumentsHost, HttpException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function buildHost(request: Record<string, unknown>) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter(logger as never);
  });

  it('logs HttpException(4xx) at warn level with route context and includes requestId in the response', () => {
    const request = {
      id: 'req-1',
      method: 'POST',
      originalUrl: '/api/v1/matches/1/join',
      v1User: { id: 'user-1' },
    };
    const { host, response } = buildHost(request);
    const exception = new HttpException(
      { code: 'ALREADY_JOINED', message: '이미 참가했어요.' },
      HttpStatus.CONFLICT,
    );

    filter.catch(exception, host);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        route: '/api/v1/matches/1/join',
        method: 'POST',
        statusCode: HttpStatus.CONFLICT,
        code: 'ALREADY_JOINED',
        userId: 'user-1',
      }),
      expect.any(String),
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ALREADY_JOINED', requestId: 'req-1' }),
    );
  });

  it('logs unexpected non-HttpException errors at error level with stack, without a userId', () => {
    const request = { id: 'req-2', method: 'GET', originalUrl: '/api/v1/home' };
    const { host, response } = buildHost(request);
    const exception = new Error('db connection lost');

    filter.catch(exception, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-2',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        userId: undefined,
        stack: expect.stringContaining('db connection lost'),
      }),
      expect.any(String),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('logs 5xx HttpException subclasses (e.g. InternalServerErrorException) at error level with stack, not warn', () => {
    const request = { id: 'req-3', method: 'POST', originalUrl: '/api/v1/uploads' };
    const { host, response } = buildHost(request);
    const exception = new InternalServerErrorException('upload verification failed');

    filter.catch(exception, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-3',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        stack: expect.stringContaining('InternalServerErrorException'),
      }),
      expect.any(String),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('strips the query string from route before logging a 4xx warn (PII in query params must not reach logs)', () => {
    const request = {
      id: 'req-4',
      method: 'GET',
      originalUrl: '/api/v1/auth/check-email?email=secret@example.com',
    };
    const { host } = buildHost(request);
    const exception = new HttpException({ code: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일이에요.' }, HttpStatus.CONFLICT);

    filter.catch(exception, host);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/v1/auth/check-email' }),
      expect.any(String),
    );
    const [loggedContext] = logger.warn.mock.calls[0];
    expect(JSON.stringify(loggedContext)).not.toContain('secret@example.com');
  });

  it('strips the query string from route before logging a 5xx error (PII in query params must not reach logs)', () => {
    const request = {
      id: 'req-5',
      method: 'GET',
      originalUrl: '/api/v1/auth/check-email?email=secret@example.com',
    };
    const { host } = buildHost(request);
    const exception = new Error('db connection lost');

    filter.catch(exception, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/v1/auth/check-email' }),
      expect.any(String),
    );
    const [loggedContext] = logger.error.mock.calls[0];
    expect(JSON.stringify(loggedContext)).not.toContain('secret@example.com');
  });

  it('truncates an oversized stack trace to bound log exposure for 5xx errors', () => {
    const request = { id: 'req-6', method: 'GET', originalUrl: '/api/v1/home' };
    const { host } = buildHost(request);
    const exception = new Error('boom');
    exception.stack = 'Error: boom\n' + 'x'.repeat(10_000);

    filter.catch(exception, host);

    const [loggedContext] = logger.error.mock.calls[0];
    expect((loggedContext.stack as string).length).toBeLessThanOrEqual(4000);
  });
});
