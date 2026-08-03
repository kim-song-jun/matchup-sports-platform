import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1ScheduleGuestApplication, V1ScheduleGuestRecruitment } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateGuestApplicationDto, CreateGuestRecruitmentDto, UpdateGuestRecruitmentDto } from './dto/guest-recruitment.dto';

const CREATE_ACTION = 'SCHEDULE_GUEST_RECRUITMENT_CREATE';
const UPDATE_ACTION = 'SCHEDULE_GUEST_RECRUITMENT_UPDATE';
const APPLICATION_ACTION = 'SCHEDULE_GUEST_RECRUITMENT_APPLY';
const RECRUITMENT_RESOURCE_TYPE = 'V1_SCHEDULE_GUEST_RECRUITMENT';
const APPLICATION_RESOURCE_TYPE = 'V1_SCHEDULE_GUEST_APPLICATION';
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

interface RecruitmentView {
  id: string;
  scheduleId: string;
  slots: number;
  closesAt: string;
  note: string | null;
  visibility: string;
  state: string;
  version: number;
  applicantCount: number;
  approvedCount: number;
}

interface RecruitmentResponse extends RecruitmentView {
  replayed: boolean;
}

interface ApplicationResponse {
  applicationId: string;
  state: string;
  displayName: string;
  note: string | null;
  alreadyApplied: boolean;
}

/**
 * Owns exactly the "guest-recruitment" lane of Task 12 (team schedules): open/close guest
 * recruitment on a schedule (versioned CAS) plus applicant-facing applications. Mirrors the
 * optimistic-version CAS + idempotency pattern established by
 * apps/v1_api/src/game-operations/result-escalation-mutation.service.ts (Task 9) and mirrored
 * by the sibling attendance lane (apps/v1_api/src/team-schedules/attendance.service.ts):
 * advisory-lock the idempotency scope, replay-check, then mutate under a row lock.
 *
 * No schedule path in this lane ever creates a V1Game or touches GamesService — guest
 * recruitment is purely a V1TeamSchedule child resource.
 */
@Injectable()
export class GuestRecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async getRecruitment(user: V1AuthUser | null, teamId: string, scheduleId: string): Promise<RecruitmentView> {
    const schedule = await this.prisma.v1TeamSchedule.findFirst({
      where: { id: scheduleId, teamId },
      select: { id: true },
    });
    if (!schedule) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }

    const recruitment = await this.prisma.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId: schedule.id } });
    if (!recruitment) {
      throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
    }

    // recruitment.visibility (not the parent schedule's visibility) gates read access here, per
    // the recon spec's literal actor description: MEMBERS requires an active team membership,
    // PUBLIC is readable by anonymous callers too. A non-member reading a MEMBERS-visibility
    // recruitment gets the existence-hiding 404 (never GUEST_RECRUITMENT_NOT_FOUND, never 403) so
    // the recruitment's existence is never leaked to outsiders.
    if (recruitment.visibility === 'MEMBERS') {
      const isMember = user !== null && (await this.hasActiveMembership(teamId, user.id));
      if (!isMember) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Guest recruitment was not found' });
      }
    }

    const counts = await this.countApplications(this.prisma, recruitment.id);
    return this.toView(recruitment, counts);
  }

  async createRecruitment(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    dto: CreateGuestRecruitmentDto,
    idempotencyKey: string,
  ): Promise<RecruitmentResponse> {
    await this.assertManagerOrOwner(user.id, teamId);

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, CREATE_ACTION, RECRUITMENT_RESOURCE_TYPE, scheduleId, idempotencyKey);

      const payloadHash = canonicalGameCommandPayloadHash({
        slots: dto.slots,
        closesAt: dto.closesAt,
        note: dto.note ?? null,
        visibility: dto.visibility ?? 'MEMBERS',
      });
      const replay = await this.findReplay(tx, user.id, CREATE_ACTION, RECRUITMENT_RESOURCE_TYPE, scheduleId, idempotencyKey);
      if (replay !== null) {
        if (replay.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
            message: 'Idempotency key was already used with a different payload',
          });
        }
        return { ...(replay.responseBody as unknown as RecruitmentResponse), replayed: true };
      }

      const lock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (lock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      const schedule = await tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      if (schedule.state !== 'SCHEDULED') {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is no longer active' });
      }

      const existing = await tx.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId } });
      if (existing) {
        throw new ConflictException({
          code: 'GUEST_RECRUITMENT_ALREADY_EXISTS',
          message: 'Guest recruitment already exists for this schedule — use PATCH instead',
        });
      }

      const created = await tx.v1ScheduleGuestRecruitment.create({
        data: {
          scheduleId,
          slots: dto.slots,
          closesAt: new Date(dto.closesAt),
          note: dto.note ?? null,
          visibility: dto.visibility ?? 'MEMBERS',
          state: 'OPEN',
          version: 0,
        },
      });

      const response: RecruitmentResponse = { ...this.toView(created, { applicantCount: 0, approvedCount: 0 }), replayed: false };
      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: CREATE_ACTION,
          resourceType: RECRUITMENT_RESOURCE_TYPE,
          resourceId: scheduleId,
          idempotencyKey,
          payloadHash,
          responseStatus: 201,
          responseBody: response as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
        },
      });

      return response;
    });
  }

  async updateRecruitment(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    dto: UpdateGuestRecruitmentDto,
    idempotencyKey: string,
  ): Promise<RecruitmentResponse> {
    await this.assertManagerOrOwner(user.id, teamId);

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, UPDATE_ACTION, RECRUITMENT_RESOURCE_TYPE, scheduleId, idempotencyKey);

      const payloadHash = canonicalGameCommandPayloadHash({
        expectedVersion: dto.expectedVersion,
        slots: dto.slots ?? null,
        closesAt: dto.closesAt ?? null,
        note: dto.note ?? null,
        visibility: dto.visibility ?? null,
        state: dto.state ?? null,
      });
      const replay = await this.findReplay(tx, user.id, UPDATE_ACTION, RECRUITMENT_RESOURCE_TYPE, scheduleId, idempotencyKey);
      if (replay !== null) {
        if (replay.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
            message: 'Idempotency key was already used with a different payload',
          });
        }
        return { ...(replay.responseBody as unknown as RecruitmentResponse), replayed: true };
      }

      const teamLock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (teamLock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }

      const recruitmentLock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM v1_schedule_guest_recruitments WHERE schedule_id = ${scheduleId} FOR UPDATE
      `;
      if (recruitmentLock.length === 0) {
        throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
      }
      const recruitment = await tx.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId } });

      if (recruitment.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Guest recruitment version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: recruitment.version },
        });
      }
      if (recruitment.state === 'FILLED') {
        throw new ConflictException({ code: 'GUEST_RECRUITMENT_TERMINAL', message: 'Guest recruitment is already filled' });
      }

      const nextSlots = dto.slots ?? recruitment.slots;
      const nextClosesAt = dto.closesAt ? new Date(dto.closesAt) : recruitment.closesAt;
      const nextNote = dto.note === undefined ? recruitment.note : dto.note;
      const nextVisibility = dto.visibility ?? recruitment.visibility;
      // Lowercase contract vocabulary (open|closed) mapped onto the shipped Prisma enum — see
      // dto/guest-recruitment.dto.ts. FILLED is never client-settable and is excluded from the
      // DTO's allowlist entirely, so nextState can only ever resolve to OPEN or CLOSED here.
      const nextState = dto.state === undefined ? recruitment.state : dto.state === 'open' ? 'OPEN' : 'CLOSED';

      const updated = await tx.$executeRaw`
        UPDATE v1_schedule_guest_recruitments
        SET slots = ${nextSlots},
            closes_at = ${nextClosesAt},
            note = ${nextNote},
            visibility = ${nextVisibility}::"V1GuestRecruitmentVisibility",
            state = ${nextState}::"V1GuestRecruitmentState",
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${recruitment.id} AND version = ${dto.expectedVersion}
      `;
      if (updated !== 1) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Guest recruitment version changed during the write' });
      }

      // Closing recruitment (state -> CLOSED) never cascades onto existing V1ScheduleGuestApplication
      // rows: they remain in whatever state they were in (PENDING/APPROVED/REJECTED/WITHDRAWN) and
      // stay fully queryable — "closing must not orphan pending applications" is satisfied by
      // deliberately NOT mutating or deleting them here. Only NEW applications are blocked once the
      // recruitment is CLOSED/FILLED (see createApplication's GUEST_RECRUITMENT_TERMINAL check).
      const after = await tx.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { id: recruitment.id } });
      const counts = await this.countApplications(tx, recruitment.id);
      const response: RecruitmentResponse = { ...this.toView(after, counts), replayed: false };

      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: UPDATE_ACTION,
          resourceType: RECRUITMENT_RESOURCE_TYPE,
          resourceId: scheduleId,
          idempotencyKey,
          payloadHash,
          responseStatus: 200,
          responseBody: response as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
        },
      });

      return response;
    });
  }

  /**
   * Applicant identity is entirely server-derived from `user` (CurrentUser()) — the DTO
   * (dto/guest-recruitment.dto.ts) deliberately declares no userId property, so the global
   * ValidationPipe's forbidNonWhitelisted:true 400s any request carrying one. The caller need
   * not be a team member (V1AuthGuard only — no membership check here), matching the frozen
   * contract's actor description verbatim.
   */
  async createApplication(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    dto: CreateGuestApplicationDto,
    idempotencyKey: string,
  ): Promise<ApplicationResponse & { replayed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, APPLICATION_ACTION, APPLICATION_RESOURCE_TYPE, scheduleId, idempotencyKey);

      const payloadHash = canonicalGameCommandPayloadHash({
        displayName: dto.displayName,
        note: dto.note ?? null,
      });
      const replay = await this.findReplay(tx, user.id, APPLICATION_ACTION, APPLICATION_RESOURCE_TYPE, scheduleId, idempotencyKey);
      if (replay !== null) {
        if (replay.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
            message: 'Idempotency key was already used with a different payload',
          });
        }
        return { ...(replay.responseBody as unknown as ApplicationResponse), replayed: true };
      }

      const schedule = await tx.v1TeamSchedule.findFirst({ where: { id: scheduleId, teamId }, select: { id: true, state: true } });
      if (!schedule) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      if (schedule.state !== 'SCHEDULED') {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is no longer active' });
      }

      const recruitment = await tx.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId } });
      if (!recruitment) {
        throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
      }

      // Duplicate check happens BEFORE the terminal/deadline checks below: a caller who already
      // applied while recruitment was open must always be able to idempotently re-fetch their own
      // application, even after the recruitment later closes or its deadline passes.
      const existingApplication = await tx.v1ScheduleGuestApplication.findUnique({
        where: { recruitmentId_userId: { recruitmentId: recruitment.id, userId: user.id } },
      });
      if (existingApplication) {
        const response: ApplicationResponse = {
          applicationId: existingApplication.id,
          state: existingApplication.state,
          displayName: existingApplication.displayNameSnapshot,
          note: existingApplication.note,
          alreadyApplied: true,
        };
        await tx.v1IdempotencyRecord.create({
          data: {
            actorUserId: user.id,
            action: APPLICATION_ACTION,
            resourceType: APPLICATION_RESOURCE_TYPE,
            resourceId: scheduleId,
            idempotencyKey,
            payloadHash,
            responseStatus: 200,
            responseBody: response as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
          },
        });
        return { ...response, replayed: false };
      }

      if (recruitment.state === 'CLOSED' || recruitment.state === 'FILLED') {
        throw new ConflictException({ code: 'GUEST_RECRUITMENT_TERMINAL', message: 'Guest recruitment is no longer accepting applications' });
      }
      if (recruitment.closesAt.getTime() < Date.now()) {
        throw new ConflictException({ code: 'GUEST_RECRUITMENT_DEADLINE_PASSED', message: 'Guest recruitment deadline has passed' });
      }

      let created: V1ScheduleGuestApplication;
      try {
        created = await tx.v1ScheduleGuestApplication.create({
          data: {
            recruitmentId: recruitment.id,
            userId: user.id,
            displayNameSnapshot: dto.displayName,
            note: dto.note ?? null,
            state: 'PENDING',
          },
        });
      } catch (err) {
        // Defense against a true concurrent double-submit racing past the read above (the
        // (recruitmentId, userId) unique constraint is the final source of truth) — treat it the
        // same as the already-applied path above rather than surfacing a raw 23505/P2002.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const raceExisting = await tx.v1ScheduleGuestApplication.findUniqueOrThrow({
            where: { recruitmentId_userId: { recruitmentId: recruitment.id, userId: user.id } },
          });
          return {
            applicationId: raceExisting.id,
            state: raceExisting.state,
            displayName: raceExisting.displayNameSnapshot,
            note: raceExisting.note,
            alreadyApplied: true,
            replayed: false,
          };
        }
        throw err;
      }

      const response: ApplicationResponse = {
        applicationId: created.id,
        state: created.state,
        displayName: created.displayNameSnapshot,
        note: created.note,
        alreadyApplied: false,
      };
      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: APPLICATION_ACTION,
          resourceType: APPLICATION_RESOURCE_TYPE,
          resourceId: scheduleId,
          idempotencyKey,
          payloadHash,
          responseStatus: 200,
          responseBody: response as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
        },
      });

      // 알림: 팀 owner/manager에게 용병 신청 접수 안내 (fire-and-forget — 수신자 조회 실패도 본 요청을 깨지 않음).
      this.notifications.emitToManyDeferred(
        async () =>
          (
            await this.prisma.v1TeamMembership.findMany({
              where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        'schedule_guest_application_received',
        `${teamId}:${scheduleId}`,
        `"${dto.displayName}"님이 용병 모집에 신청했어요.`,
      );

      return { ...response, replayed: false };
    });
  }

  private async hasActiveMembership(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, status: 'active' },
      select: { id: true },
    });
    return membership !== null;
  }

  private async assertManagerOrOwner(userId: string, teamId: string): Promise<void> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, role: { in: ['owner', 'manager'] }, status: 'active' },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can manage guest recruitment',
      });
    }
  }

  // applicantCount excludes WITHDRAWN (a withdrawn applicant no longer counts against the
  // recruitment's roster) but includes PENDING/APPROVED/REJECTED; approvedCount is the subset
  // actually seated. Neither count is defined by the frozen contract text, so this is a
  // documented design choice rather than a literal requirement.
  private async countApplications(
    client: Prisma.TransactionClient | PrismaService,
    recruitmentId: string,
  ): Promise<{ applicantCount: number; approvedCount: number }> {
    const [applicantCount, approvedCount] = await Promise.all([
      client.v1ScheduleGuestApplication.count({ where: { recruitmentId, state: { not: 'WITHDRAWN' } } }),
      client.v1ScheduleGuestApplication.count({ where: { recruitmentId, state: 'APPROVED' } }),
    ]);
    return { applicantCount, approvedCount };
  }

  private toView(
    recruitment: V1ScheduleGuestRecruitment,
    counts: { applicantCount: number; approvedCount: number },
  ): RecruitmentView {
    return {
      id: recruitment.id,
      scheduleId: recruitment.scheduleId,
      slots: recruitment.slots,
      closesAt: recruitment.closesAt.toISOString(),
      note: recruitment.note,
      visibility: recruitment.visibility,
      state: recruitment.state,
      version: recruitment.version,
      applicantCount: counts.applicantCount,
      approvedCount: counts.approvedCount,
    };
  }

  private async lockIdempotencyScope(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const scope = JSON.stringify([userId, action, resourceType, resourceId, idempotencyKey]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  }

  private async findReplay(
    tx: Prisma.TransactionClient,
    userId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    idempotencyKey: string,
  ) {
    const record = await tx.v1IdempotencyRecord.findUnique({
      where: {
        actorUserId_action_resourceType_resourceId_idempotencyKey: {
          actorUserId: userId,
          action,
          resourceType,
          resourceId,
          idempotencyKey,
        },
      },
      select: { payloadHash: true, responseBody: true, expiresAt: true },
    });
    if (record === null || record.expiresAt <= new Date()) return null;
    return record;
  }
}
