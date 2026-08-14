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

@Controller('tournament-ops/tournaments/:tournamentId/escalations')
@UseGuards(V1AuthGuard)
@UseInterceptors(ResultEscalationValidationInterceptor)
export class ResultEscalationController {
  constructor(private readonly escalations: ResultEscalationService) {}

  @Get()
  list(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) tournamentId: string,
    @Query() query: ResultEscalationListQueryDto,
  ) {
    return this.escalations.list(user.id, tournamentId, query.status);
  }

  @Get(':escalationId')
  detail(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) tournamentId: string,
    @Param('escalationId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) escalationId: string,
  ) {
    return this.escalations.detail(user.id, tournamentId, escalationId);
  }

  @Post(':escalationId/ack')
  @HttpCode(200)
  acknowledge(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) tournamentId: string,
    @Param('escalationId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) escalationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ResultEscalationActionDto,
  ) {
    return this.escalations.acknowledge(
      user.id,
      tournamentId,
      escalationId,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
    );
  }

  @Post(':escalationId/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) tournamentId: string,
    @Param('escalationId', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY })) escalationId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: ResultEscalationActionDto,
  ) {
    return this.escalations.resolve(
      user.id,
      tournamentId,
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
