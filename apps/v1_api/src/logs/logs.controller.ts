import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ClientErrorLogDto } from './dto/client-error-log.dto';
import { ErrorLogService } from '../error-logs/error-log.service';

const MAX_CONTEXT_JSON_LENGTH = 4000;

@Controller('logs')
export class LogsController {
  constructor(
    @InjectPinoLogger(LogsController.name) private readonly logger: PinoLogger,
    private readonly errorLogService: ErrorLogService,
  ) {}

  @Post('client-error')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  report(@Body() dto: ClientErrorLogDto): void {
    const context =
      dto.context && JSON.stringify(dto.context).length <= MAX_CONTEXT_JSON_LENGTH ? dto.context : undefined;

    const logPayload = {
      source: 'client' as const,
      url: dto.url,
      userAgent: dto.userAgent,
      stack: dto.stack,
      context,
    };

    if (dto.level === 'warn') {
      this.logger.warn(logPayload, dto.message);
    } else {
      this.logger.error(logPayload, dto.message);
    }

    // 어드민 에러 로그 뷰어 적재 — fire-and-forget. ErrorLogService.record() 는 계약상
    // throw 하지 않지만, 그 계약이 깨지더라도(혹은 테스트 mock 이 의도적으로 throw 하더라도)
    // 클라이언트 에러 리포팅 엔드포인트의 204 응답이 절대 영향받지 않도록 방어적으로 감싼다.
    try {
      this.errorLogService.record({
        source: 'client',
        level: dto.level,
        route: dto.url,
        message: dto.message,
        stack: dto.stack ?? null,
        userAgent: dto.userAgent ?? null,
        context,
      });
    } catch (err) {
      this.logger.warn({ err }, 'Failed to record client error log');
    }
  }
}
