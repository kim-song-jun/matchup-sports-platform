import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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

type TournamentStaffRequest = Request & {
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

    const expectedAssignmentVersion = this.assignmentVersion(request);
    request.tournamentStaff = await this.access.assertAccess({
      userId: request.v1User.id,
      action: requirement.action,
      resource: this.resource(request.params, requirement),
      ...(expectedAssignmentVersion === undefined ? {} : { expectedAssignmentVersion }),
    });
    return true;
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
