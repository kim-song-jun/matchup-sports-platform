import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import {
  AssignTournamentFixtureFieldDto,
  CreateTournamentFieldDto,
  UpdateTournamentFieldDto,
} from './dto/tournament-operations-field.dto';
import {
  TournamentOperationsFieldAuditContext,
  TournamentOperationsFieldsService,
} from './tournament-operations-fields.service';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/**
 * Field/court CRUD (Task 18) + fixture-field assignment write path (user
 * decision 2). Authorization is self-contained inside
 * TournamentOperationsFieldsService (re-derives the acting principal via
 * TournamentStaffAccessService.assertAccess() for every call), so this
 * controller only needs V1AuthGuard -- the same pattern already used by
 * tournament-operations/staff and tournament-operations/lineups.
 */
@Controller('tournament-ops/tournaments/:tournamentId')
@UseGuards(V1AuthGuard)
export class TournamentOperationsFieldsController {
  constructor(private readonly fields: TournamentOperationsFieldsService) {}

  @Get('fields')
  list(@CurrentUser() user: V1AuthUser, @Param('tournamentId', UUID_PARAM) tournamentId: string) {
    return this.fields.list(user.id, tournamentId);
  }

  @Post('fields')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Body() dto: CreateTournamentFieldDto,
  ) {
    return this.fields.create(user.id, tournamentId, dto, this.auditContext(idempotencyKey, request));
  }

  @Patch('fields/:fieldId')
  update(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fieldId', UUID_PARAM) fieldId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Body() dto: UpdateTournamentFieldDto,
  ) {
    return this.fields.update(
      user.id,
      tournamentId,
      fieldId,
      dto,
      this.auditContext(idempotencyKey, request),
    );
  }

  @Patch('fixtures/:fixtureId/field')
  assignFixtureField(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Body() dto: AssignTournamentFixtureFieldDto,
  ) {
    return this.fields.assignFixtureField(
      user.id,
      tournamentId,
      fixtureId,
      dto,
      this.auditContext(idempotencyKey, request),
    );
  }

  @Delete('fixtures/:fixtureId/field')
  clearFixtureField(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('fixtureId', UUID_PARAM) fixtureId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.fields.clearFixtureField(
      user.id,
      tournamentId,
      fixtureId,
      this.auditContext(idempotencyKey, request),
    );
  }

  private auditContext(
    idempotencyKey: string | undefined,
    request: Request,
  ): TournamentOperationsFieldAuditContext {
    const trimmedKey = idempotencyKey?.trim();
    return {
      requestId: trimmedKey !== undefined && trimmedKey.length > 0 ? trimmedKey : randomUUID(),
      sourceIp: request.ip ?? null,
    };
  }
}
