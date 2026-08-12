import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  PayloadTooLargeException,
} from '@nestjs/common';
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
  const errorLogService = { record: jest.fn() };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter(logger as never, errorLogService as never);
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

  it('records a 5xx server error via ErrorLogService with method/route/statusCode/message/stack/request/response', () => {
    const request = {
      id: 'req-7',
      method: 'GET',
      originalUrl: '/api/v1/home',
      headers: { 'user-agent': 'jest-agent' },
      body: { foo: 'bar' },
      v1User: { id: 'user-7' },
    };
    const { host } = buildHost(request);
    const exception = new Error('db connection lost');

    filter.catch(exception, host);

    expect(errorLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        level: 'error',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        method: 'GET',
        route: '/api/v1/home',
        message: expect.any(String),
        stack: expect.stringContaining('db connection lost'),
        requestBody: { foo: 'bar' },
        requestHeaders: { 'user-agent': 'jest-agent' },
        responseBody: expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR }),
        userId: 'user-7',
        userAgent: 'jest-agent',
      }),
    );
  });

  it('records a 4xx HttpException via ErrorLogService at warn level', () => {
    const request = { id: 'req-8', method: 'POST', originalUrl: '/api/v1/matches/1/join' };
    const { host } = buildHost(request);
    const exception = new HttpException({ code: 'ALREADY_JOINED', message: '이미 참가했어요.' }, HttpStatus.CONFLICT);

    filter.catch(exception, host);

    expect(errorLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server',
        level: 'warn',
        statusCode: HttpStatus.CONFLICT,
        errorCode: 'ALREADY_JOINED',
        route: '/api/v1/matches/1/join',
      }),
    );
  });

  // ValidationPipe 는 message 를 문자열 배열로 준다. 이걸 'HTTP 400' 으로 뭉개면 같은
  // route 의 서로 다른 검증 실패가 한 fingerprint 로 접혀 어떤 필드가 틀렸는지 사라진다.
  it('records the joined validation messages instead of a bare "HTTP 400", while the response keeps the array', () => {
    const request = { id: 'req-9', method: 'POST', originalUrl: '/api/v1/auth/register' };
    const { host, response } = buildHost(request);
    const exception = new HttpException(
      { message: ['email must be an email', 'password is too short'], error: 'Bad Request', statusCode: 400 },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(errorLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'email must be an email, password is too short' }),
    );
    // 클라이언트 계약은 그대로 — 응답에는 예외 payload 원본이 실려 검증 메시지 배열이 보존된다.
    expect(response.json.mock.calls[0][0].message).toEqual(
      expect.objectContaining({ message: ['email must be an email', 'password is too short'] }),
    );
  });

  it('still sends the original error response when ErrorLogService.record throws', () => {
    errorLogService.record.mockImplementationOnce(() => {
      throw new Error('db write failed');
    });
    const request = { id: 'req-9', method: 'GET', originalUrl: '/api/v1/home' };
    const { host, response } = buildHost(request);
    const exception = new Error('db connection lost');

    expect(() => filter.catch(exception, host)).not.toThrow();

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-9', statusCode: HttpStatus.INTERNAL_SERVER_ERROR }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Failed to record server error log',
    );
  });

  it('코드 없는 413(multer 하드캡)을 업로드 도메인 코드 + 한국어 메시지로 정규화한다', () => {
    const request = {
      id: 'req-413',
      method: 'POST',
      originalUrl: '/api/v1/uploads',
      headers: { 'content-type': 'multipart/form-data; boundary=----x' },
    };
    const { host, response } = buildHost(request);
    // @nestjs/platform-express 가 multer LIMIT_FILE_SIZE 를 이 형태로 올린다.
    const exception = new PayloadTooLargeException('File too large');

    filter.catch(exception, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UPLOAD_FILE_TOO_LARGE',
        message: '파일 용량이 업로드 한도를 초과했어요. 더 작은 파일로 다시 시도해주세요.',
      }),
    );
  });

  it('서비스가 자체 코드를 붙인 413 은 그대로 통과시킨다', () => {
    const request = {
      id: 'req-413-coded',
      method: 'POST',
      originalUrl: '/api/v1/uploads',
      headers: { 'content-type': 'multipart/form-data; boundary=----x' },
    };
    const { host, response } = buildHost(request);
    const exception = new HttpException(
      { code: 'CUSTOM_TOO_LARGE', message: '영상은 200MB까지 올릴 수 있어요.' },
      HttpStatus.PAYLOAD_TOO_LARGE,
    );

    filter.catch(exception, host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CUSTOM_TOO_LARGE',
        message: '영상은 200MB까지 올릴 수 있어요.',
      }),
    );
  });

  it('multipart 가 아닌 요청의 413 은 업로드 코드로 바꾸지 않는다', () => {
    const request = {
      id: 'req-413-json',
      method: 'POST',
      originalUrl: '/api/v1/tournaments',
      headers: { 'content-type': 'application/json' },
    };
    const { host, response } = buildHost(request);
    const exception = new PayloadTooLargeException('request entity too large');

    filter.catch(exception, host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_ERROR',
        message: 'request entity too large',
      }),
    );
  });
});
