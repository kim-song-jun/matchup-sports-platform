import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';

type V1Request = Request & { id?: string; v1User?: { id: string } };

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
      route: request.originalUrl ?? request.url,
      method: request.method,
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      userId: request.v1User?.id,
    };

    if (exception instanceof HttpException) {
      this.logger.warn(logContext, `HTTP ${status} ${logContext.method} ${logContext.route}`);
    } else {
      this.logger.error(
        { ...logContext, stack: exception instanceof Error ? exception.stack : String(exception) },
        `Unhandled exception at ${logContext.method} ${logContext.route}`,
      );
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
