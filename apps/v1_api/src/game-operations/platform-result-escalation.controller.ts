import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnprocessableEntityException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import type { V1AuthUser } from '../auth/v1-auth-user';
import {
  ResultEscalationActionDto,
  ResultEscalationListQueryDto,
} from './dto/result-escalation.dto';
import { ResultEscalationService } from './result-escalation.service';
import { ResultEscalationValidationInterceptor } from './result-escalation-validation.interceptor';

@Controller('tournament-ops/escalations')
@UseGuards(V1AuthGuard)
@UseInterceptors(ResultEscalationValidationInterceptor)
export class PlatformResultEscalationController {
  constructor(private readonly escalations: ResultEscalationService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Query() query: ResultEscalationListQueryDto) {
    return this.escalations.listPlatform(user.id, query.status);
  }

  @Get(':escalationId')
  detail(
    @CurrentUser() user: V1AuthUser,
    @Param('escalationId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) escalationId: string,
  ) {
    return this.escalations.detailPlatform(user.id, escalationId);
  }

  @Post(':escalationId/ack')
  @HttpCode(200)
  acknowledge(
    @CurrentUser() user: V1AuthUser,
    @Param('escalationId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) escalationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ResultEscalationActionDto,
  ) {
    return this.escalations.acknowledgePlatform(
      user.id,
      escalationId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':escalationId/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() user: V1AuthUser,
    @Param('escalationId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) escalationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ResultEscalationActionDto,
  ) {
    return this.escalations.resolvePlatform(
      user.id,
      escalationId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
    );
  }

  private requireIdempotencyKey(idempotencyKey: string | undefined): string {
    const normalized = idempotencyKey?.trim();
    if (normalized === undefined || normalized.length === 0) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required',
      });
    }
    return normalized;
  }
}
