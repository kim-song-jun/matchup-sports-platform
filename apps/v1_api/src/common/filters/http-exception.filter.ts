import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';

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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<V1Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const messageObj =
      typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : null;
    const code = messageObj && typeof messageObj.code === 'string' ? (messageObj.code as string) : undefined;

    const logContext = {
      requestId: request.id,
      route: stripQueryString(request.originalUrl ?? request.url),
      method: request.method,
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      userId: request.v1User?.id,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const rawStack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        { ...logContext, stack: rawStack?.slice(0, MAX_LOGGED_STACK_LENGTH) },
        `Unhandled exception at ${logContext.method} ${logContext.route}`,
      );
    } else {
      this.logger.warn(logContext, `HTTP ${status} ${logContext.method} ${logContext.route}`);
    }

    response.status(status).json({
      status: 'error',
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      message:
        typeof message === 'string'
          ? message
          : messageObj && typeof messageObj.message === 'string'
            ? (messageObj.message as string)
            : message,
      details: messageObj?.details ?? null,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  }
}
