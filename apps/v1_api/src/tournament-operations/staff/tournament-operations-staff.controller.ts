import { randomUUID } from 'node:crypto';
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import { V1AuthGuard } from '../../auth/v1-auth.guard';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { TournamentStaffAuditContext } from '../../tournaments/staff/tournament-staff.service';
import { GrantTournamentStaffDto } from './dto/grant-tournament-staff.dto';
import { RevokeTournamentStaffDto } from './dto/revoke-tournament-staff.dto';
import { SearchStaffCandidatesDto } from './dto/search-staff-candidates.dto';
import { TournamentOperationsStaffService } from './tournament-operations-staff.service';

const UUID_PARAM = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY });

/**
 * Staff grant/revoke/list (Task 18) -- authorization for grant/revoke is
 * self-contained inside TournamentStaffService (it re-derives the acting
 * principal via TournamentStaffAccessService for every mutation, including a
 * re-check inside the transaction), so this controller only needs
 * V1AuthGuard to establish the authenticated actor before delegating, the
 * same pattern already used by
 * tournament-operations/lineups/tournament-fixture-lineup.controller.ts.
 */
@Controller('tournament-ops/tournaments/:tournamentId/staff')
@UseGuards(V1AuthGuard)
export class TournamentOperationsStaffController {
  constructor(private readonly staff: TournamentOperationsStaffService) {}

  @Get()
  list(@CurrentUser() user: V1AuthUser, @Param('tournamentId', UUID_PARAM) tournamentId: string) {
    return this.staff.list(user.id, tournamentId);
  }

  /**
   * 배정할 사람을 닉네임으로 찾는 검색. 인가는 grant 와 동일하게 좁혀져 있고
   * (TournamentOperationsStaffService.searchCandidates 주석 참고) 응답도 마스킹된
   * 신원만 담는다. 호출 빈도를 60초 30회로 묶는 것은 그 위의 마지막 장치다 — 두 글자
   * 하한과 10건 상한만으로는 검색어를 바꿔 가며 반복 호출해 명부를 재구성하는 것을
   * 막지 못한다.
   */
  @Get('user-search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  searchCandidates(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Query() dto: SearchStaffCandidatesDto,
  ) {
    return this.staff.searchCandidates(user.id, tournamentId, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  grant(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Body() dto: GrantTournamentStaffDto,
  ) {
    return this.staff.grant(user.id, tournamentId, dto, this.auditContext(idempotencyKey, request));
  }

  @Post(':assignmentId/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentUser() user: V1AuthUser,
    @Param('tournamentId', UUID_PARAM) tournamentId: string,
    @Param('assignmentId', UUID_PARAM) assignmentId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Body() dto: RevokeTournamentStaffDto,
  ) {
    return this.staff.revoke(
      user.id,
      tournamentId,
      assignmentId,
      dto,
      this.auditContext(idempotencyKey, request),
    );
  }

  private auditContext(
    idempotencyKey: string | undefined,
    request: Request,
  ): TournamentStaffAuditContext {
    const trimmedKey = idempotencyKey?.trim();
    return {
      requestId: trimmedKey !== undefined && trimmedKey.length > 0 ? trimmedKey : randomUUID(),
      sourceIp: request.ip ?? null,
    };
  }
}
