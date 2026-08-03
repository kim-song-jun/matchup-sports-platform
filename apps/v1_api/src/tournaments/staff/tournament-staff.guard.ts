import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import {
  TOURNAMENT_STAFF_REQUIREMENT,
  type TournamentStaffRequirement,
} from './require-tournament-staff.decorator';
import {
  TournamentStaffAccessService,
  type TournamentStaffPrincipal,
  type TournamentStaffResource,
} from './tournament-staff-access.service';

/** Exported (Task 18 review P0-2) so downstream controllers -- e.g.
 * `TournamentOperationsBoardController` -- can type `@Req()` against the exact shape this guard
 * populates, instead of redeclaring an equivalent type that could drift from this one. */
export type TournamentStaffRequest = Request & {
  readonly v1User?: V1AuthUser;
  tournamentStaff?: TournamentStaffPrincipal;
};

@Injectable()
export class TournamentStaffGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: TournamentStaffAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<TournamentStaffRequirement>(
      TOURNAMENT_STAFF_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (requirement === undefined) {
      throw new InternalServerErrorException({
        code: 'TOURNAMENT_STAFF_GUARD_MISCONFIGURED',
        message: 'Tournament staff guard requires route authorization metadata',
      });
    }
    const request = context.switchToHttp().getRequest<TournamentStaffRequest>();
    if (request.v1User === undefined) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'V1 authentication is required',
      });
    }

    // Guards run before pipes in the Nest request lifecycle, so a route-level `ParseUUIDPipe`
    // on `:tournamentId` (etc.) never gets a chance to run if this guard reaches
    // `TournamentStaffAccessService.assertAccess()` first with a syntactically invalid id --
    // for platform_ops callers that service skips the per-tournament assignment lookup and
    // instead runs the malformed id through `decideTournamentStaffAccess()`, which reports
    // `INVALID_INPUT`, but `assertAccess()` maps every denial reason (including that one) to a
    // blanket 403 `STAFF_SCOPE_DENIED` -- misreporting an input-validation failure as an
    // authorization failure, and doing so before authorization has actually been evaluated.
    // Reject a malformed id here, ahead of any authorization lookup, so the response is the
    // same 422 for every caller regardless of role.
    const resource = this.resource(request.params, requirement);
    this.assertWellFormedResource(resource);

    const expectedAssignmentVersion = this.assignmentVersion(request);
    request.tournamentStaff = await this.access.assertAccess({
      userId: request.v1User.id,
      action: requirement.action,
      resource,
      ...(expectedAssignmentVersion === undefined ? {} : { expectedAssignmentVersion }),
    });
    return true;
  }

  private assertWellFormedResource(resource: TournamentStaffResource): void {
    const ids: readonly (string | undefined)[] = [
      resource.tournamentId,
      resource.fixtureId,
      resource.fieldId,
      resource.courtId,
    ];
    if (ids.some((id) => id !== undefined && !isUUID(id))) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_ERROR',
        message: 'Tournament operations route parameters must be valid UUIDs',
      });
    }
  }

  private resource(
    params: Readonly<Record<string, string | string[]>>,
    requirement: TournamentStaffRequirement,
  ): TournamentStaffResource {
    const tournamentId = this.scalarParam(
      params,
      requirement.tournamentIdParam ?? 'tournamentId',
    ) ?? '';
    const fixtureId = this.scalarParam(params, requirement.fixtureIdParam ?? 'fixtureId');
    const fieldId = this.scalarParam(params, requirement.fieldIdParam ?? 'fieldId');
    const courtId = this.scalarParam(params, requirement.courtIdParam ?? 'courtId');
    return {
      tournamentId,
      ...(fixtureId === undefined ? {} : { fixtureId }),
      ...(fieldId === undefined ? {} : { fieldId }),
      ...(courtId === undefined ? {} : { courtId }),
    };
  }

  private scalarParam(
    params: Readonly<Record<string, string | string[]>>,
    key: string,
  ): string | undefined {
    const value = params[key];
    return typeof value === 'string' ? value : undefined;
  }

  private assignmentVersion(request: TournamentStaffRequest): number | undefined {
    const value = request.header('x-tournament-staff-assignment-version');
    if (value === undefined) {
      return undefined;
    }
    if (!/^\d+$/.test(value)) {
      return -1;
    }
    const version = Number(value);
    return Number.isSafeInteger(version) ? version : -1;
  }
}
