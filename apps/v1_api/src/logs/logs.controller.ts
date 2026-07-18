import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ClientErrorLogDto } from './dto/client-error-log.dto';

const MAX_CONTEXT_JSON_LENGTH = 4000;

@Controller('logs')
export class LogsController {
  constructor(@InjectPinoLogger(LogsController.name) private readonly logger: PinoLogger) {}

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
  }
}
