import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';
import { ErrorLogService } from '../../error-logs/error-log.service';

type V1Request = Request & { id?: string; v1User?: { id: string } };

// pino-http 의 req serializer(app.module.ts)는 req.url 에서 쿼리스트링을 제거해 PII 유출을
// 막는다. 이 필터는 그 자동 로그가 아니라 별도로 조립한 logContext 를 직접 warn/error 로
// 남기므로 같은 보호를 받지 못한다 — route 에도 동일하게 쿼리스트링을 제거해야
// GET /auth/check-email?email=... 같은 케이스에서 이메일이 로그에 그대로 남지 않는다.
function stripQueryString(url: string): string {
  return url.split('?')[0];
}

// 5xx 는 대부분 예상치 못한 드라이버/런타임 에러(Prisma, pg 등)이며 그 message 가 사용자
// 입력 원문을 그대로 echo 하는 경우가 있다(예: "invalid input syntax for type integer: ...").
// 완전한 콘텐츠 스크러빙은 오탐 위험이 크므로, 대신 로그에 남는 stack 크기를 상한해
// 노출 범위를 제한한다(client-error-reporter.ts 의 4000자 상한과 동일 컨벤션).
const MAX_LOGGED_STACK_LENGTH = 4000;

// multer 의 LIMIT_FILE_SIZE 는 @nestjs/platform-express 를 거쳐 코드 없는
// PayloadTooLargeException('File too large') 로 올라온다 — 그대로 내보내면 클라이언트에
// 영어 메시지 + INTERNAL_ERROR 코드가 노출돼 사용자가 원인도 대처법도 알 수 없다.
// UploadsService 의 정밀 한도 초과와 같은 코드로 정규화해 계약을 하나로 맞춘다.
const PAYLOAD_TOO_LARGE_CODE = 'UPLOAD_FILE_TOO_LARGE';
const PAYLOAD_TOO_LARGE_MESSAGE =
  '파일 용량이 업로드 한도를 초과했어요. 더 작은 파일로 다시 시도해주세요.';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger,
    private readonly errorLogService: ErrorLogService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<V1Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const messageObj =
      typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : null;
    const rawCode = messageObj && typeof messageObj.code === 'string' ? (messageObj.code as string) : undefined;
    // 서비스가 자체 코드를 붙인 413(UploadsService 의 5MB 초과 등)은 그대로 두고, 코드 없는
    // 프레임워크발 413(multer 하드캡)만 도메인 코드로 승격한다. 이 필터는 전역이라
    // multipart 요청으로 한정해야 JSON 본문 크기 초과 같은 다른 413 까지 업로드 코드로
    // 잘못 표시되지 않는다.
    const contentType = request.headers?.['content-type'];
    const isMultipartRequest =
      typeof contentType === 'string' && contentType.toLowerCase().includes('multipart/form-data');
    const isUncodedPayloadTooLarge =
      !rawCode && status === HttpStatus.PAYLOAD_TOO_LARGE && isMultipartRequest;
    const code = rawCode ?? (isUncodedPayloadTooLarge ? PAYLOAD_TOO_LARGE_CODE : undefined);

    const logContext = {
      requestId: request.id,
      route: stripQueryString(request.originalUrl ?? request.url),
      method: request.method,
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      userId: request.v1User?.id,
    };

    const isServerError = status >= HttpStatus.INTERNAL_SERVER_ERROR;
    const rawStack = isServerError ? (exception instanceof Error ? exception.stack : String(exception)) : undefined;
    const truncatedStack = rawStack?.slice(0, MAX_LOGGED_STACK_LENGTH);

    if (isServerError) {
      this.logger.error(
        { ...logContext, stack: truncatedStack },
        `Unhandled exception at ${logContext.method} ${logContext.route}`,
      );
    } else {
      this.logger.warn(logContext, `HTTP ${status} ${logContext.method} ${logContext.route}`);
    }

    // ValidationPipe 는 message 를 문자열 배열로 준다("email must be an email", ...).
    // 이때 `HTTP 400` 으로만 기록하면 같은 route 의 서로 다른 검증 실패가 모두 같은
    // fingerprint 가 되어 한 행으로 뭉치고, 어드민 목록에도 어떤 필드가 틀렸는지 남지
    // 않는다 — 조사에 필요한 정보가 통째로 사라지므로 join 해서 남긴다.
    // (아래 responseBody 의 message 는 배열 원본을 그대로 내보내 클라이언트 계약을 지킨다.)
    const responseMessage = isUncodedPayloadTooLarge
      ? PAYLOAD_TOO_LARGE_MESSAGE
      : typeof message === 'string'
        ? message
        : Array.isArray(messageObj?.message)
          ? messageObj.message.filter((item) => typeof item === 'string').join(', ') || `HTTP ${status}`
          : messageObj && typeof messageObj.message === 'string'
            ? (messageObj.message as string)
            : `HTTP ${status}`;

    const responseBody = {
      status: 'error',
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      message:
        isUncodedPayloadTooLarge ||
        typeof message === 'string' ||
        (messageObj && typeof messageObj.message === 'string')
          ? responseMessage
          : message,
      details: messageObj?.details ?? null,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    // 어드민 에러 로그 뷰어 적재 — fire-and-forget. AllExceptionsFilter 는 전역 예외 필터라
    // 여기서 예외가 새어나가면 에러 응답 자체가 깨진다. ErrorLogService.record() 는 계약상
    // throw 하지 않지만, 방어적으로 감싸 그 계약이 깨지거나(혹은 테스트가 의도적으로
    // throw 하도록 mock 하더라도) 아래 response.status().json() 이 항상 실행되게 한다.
    try {
      this.errorLogService.record({
        source: 'server',
        level: isServerError ? 'error' : 'warn',
        statusCode: status,
        errorCode: code ?? null,
        method: logContext.method,
        route: logContext.route,
        message: responseMessage,
        stack: truncatedStack ?? null,
        requestBody: request.body,
        requestHeaders: request.headers,
        responseBody,
        userId: request.v1User?.id ?? null,
        userAgent: request.headers?.['user-agent'] as string | undefined,
      });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to record server error log');
    }

    response.status(status).json(responseBody);
  }
}
