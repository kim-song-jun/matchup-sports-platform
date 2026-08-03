import { randomUUID, createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1ScheduleState, V1ScheduleVisibility } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { MyScheduleQueryDto } from './dto/my-schedule-query.dto';
import { TriggerReminderDto } from './dto/reminder.dto';
import { CancelScheduleDto } from './dto/cancel-schedule.dto';
import { CreateScheduleDto, ScheduleListQueryDto, UpdateScheduleDto } from './dto/team-schedule.dto';

const RESOURCE_TYPE = 'V1_TEAM_SCHEDULE';
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

type Tx = Prisma.TransactionClient;

/**
 * Owns exactly the "schedule CRUD / versioned mutate / cancel / reminder-trigger / my-schedule"
 * lane of Task 12 (team schedules). Sibling lanes — self-only RSVP and guest-recruitment — are
 * owned by ScheduleAttendanceService and GuestRecruitmentService respectively (see
 * team-schedules.module.ts for wiring; each lane has its own standalone controller so they never
 * collide on the same file).
 *
 * Mirrors the optimistic-version CAS + idempotency pattern established by Task 9's
 * result-escalation-mutation.service.ts: advisory-lock the idempotency scope, replay-check, then
 * mutate under a row lock inside the same transaction.
 */
@Injectable()
export class TeamSchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------------------
  // List / detail / my-schedule
  // ---------------------------------------------------------------------------------------

  async list(user: V1AuthUser | null, teamId: string, query: ScheduleListQueryDto) {
    const team = await this.prisma.v1Team.findFirst({
      where: { id: teamId, status: 'active', deletedAt: null },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
    }

    const isMember = user ? await this.isActiveMember(teamId, user.id) : false;
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);

    const where: Prisma.V1TeamScheduleWhereInput = {
      teamId,
      visibility: isMember ? undefined : V1ScheduleVisibility.PUBLIC,
      ...(query.type ? { type: query.type } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.from || query.to
        ? {
            startAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.v1TeamSchedule.findMany({
      where,
      include: { attendance: { select: { status: true } } },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => this.toSummary(row)),
      nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
    };
  }

  async detail(user: V1AuthUser | null, teamId: string, scheduleId: string) {
    const schedule = await this.prisma.v1TeamSchedule.findFirst({
      where: { id: scheduleId, teamId },
      include: {
        attendance: true,
        guestRecruitment: { include: { applications: { select: { state: true } } } },
      },
    });
    if (!schedule) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }

    const isMember = user ? await this.isActiveMember(teamId, user.id) : false;
    if (schedule.visibility !== V1ScheduleVisibility.PUBLIC && !isMember) {
      // Existence-hiding: never 403 for a private schedule seen by a non-member/anonymous caller.
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }

    const myAttendance = user ? schedule.attendance.find((row) => row.userId === user.id) ?? null : null;
    const recruitment = schedule.guestRecruitment;

    return {
      ...this.toSummary(schedule),
      cancelReason: schedule.cancelReason,
      cancelledAt: schedule.state === V1ScheduleState.CANCELLED ? schedule.updatedAt : null,
      guestRecruitment: recruitment
        ? {
            id: recruitment.id,
            scheduleId: recruitment.scheduleId,
            slots: recruitment.slots,
            closesAt: recruitment.closesAt,
            note: recruitment.note,
            visibility: recruitment.visibility,
            state: recruitment.state,
            version: recruitment.version,
            applicantCount: recruitment.applications.filter((a) => a.state !== 'WITHDRAWN').length,
            approvedCount: recruitment.applications.filter((a) => a.state === 'APPROVED').length,
          }
        : null,
      myAttendance: myAttendance
        ? { status: myAttendance.status, version: myAttendance.version, waitlistPosition: myAttendance.waitlistPosition }
        : null,
    };
  }

  async mySchedule(user: V1AuthUser, query: MyScheduleQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const state: V1ScheduleState | undefined =
      query.status === 'scheduled'
        ? V1ScheduleState.SCHEDULED
        : query.status === 'cancelled'
          ? V1ScheduleState.CANCELLED
          : query.status === 'completed'
            ? V1ScheduleState.COMPLETED
            : undefined;

    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active' },
      select: { teamId: true, role: true, team: { select: { name: true } } },
    });
    if (memberships.length === 0) {
      return { items: [], nextCursor: null };
    }
    const infoByTeam = new Map(memberships.map((m) => [m.teamId, { role: m.role, teamName: m.team.name }]));

    const where: Prisma.V1TeamScheduleWhereInput = {
      teamId: { in: [...infoByTeam.keys()] },
      ...(state ? { state } : {}),
      ...(query.from || query.to
        ? {
            startAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.v1TeamSchedule.findMany({
      where,
      // Full attendance list (not filtered to the caller) — toSummary()'s goingCount/
      // waitlistedCount must reflect the schedule's real totals, not just the caller's own row.
      include: { attendance: { select: { userId: true, status: true } } },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const pageItems = rows.slice(0, limit);
    const hasNext = rows.length > limit;

    return {
      items: pageItems.map((row) => {
        const info = infoByTeam.get(row.teamId);
        const mine = row.attendance.find((a) => a.userId === user.id) ?? null;
        return {
          ...this.toSummary(row),
          teamId: row.teamId,
          teamName: info?.teamName ?? null,
          myRole: info?.role ?? null,
          myAttendanceStatus: mine?.status ?? null,
        };
      }),
      nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
    };
  }

  // ---------------------------------------------------------------------------------------
  // Create / update / cancel
  // ---------------------------------------------------------------------------------------

  async create(user: V1AuthUser, teamId: string, dto: CreateScheduleDto, idempotencyKey: string) {
    this.assertActiveAccount(user);
    if (dto.type === 'MATCH' && !dto.teamMatchId) {
      throw new UnprocessableEntityException({
        code: 'SCHEDULE_MATCH_SOURCE_REQUIRED',
        message: 'A MATCH-type schedule must reference an existing team match',
      });
    }

    const payloadHash = canonicalGameCommandPayloadHash({ actorUserId: user.id, teamId, dto });

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, 'SCHEDULE_CREATE', RESOURCE_TYPE, idempotencyKey);

      // Create-style replay: resourceId is omitted from the pre-creation lookup (mirrors
      // team-matches.service.ts's create() findFirst pattern) since the resource does not
      // exist yet on first attempt.
      const existing = await tx.v1IdempotencyRecord.findFirst({
        where: {
          actorUserId: user.id,
          action: 'SCHEDULE_CREATE',
          resourceType: RESOURCE_TYPE,
          idempotencyKey,
        },
        select: { payloadHash: true, responseBody: true, expiresAt: true },
      });
      if (existing !== null && existing.expiresAt > new Date()) {
        if (existing.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
            message: 'Idempotency key was already used with a different payload',
          });
        }
        return { ...(existing.responseBody as Prisma.JsonObject), replayed: true };
      }

      await this.assertManageableTeam(tx, user, teamId);

      if (dto.type === 'MATCH' && dto.teamMatchId) {
        const teamMatch = await tx.v1TeamMatch.findUnique({
          where: { id: dto.teamMatchId },
          select: { hostTeamId: true, approvedApplicantTeamId: true },
        });
        if (!teamMatch || (teamMatch.hostTeamId !== teamId && teamMatch.approvedApplicantTeamId !== teamId)) {
          throw new NotFoundException({
            code: 'TEAM_MATCH_NOT_FOUND_FOR_TEAM',
            message: 'The referenced team match does not belong to this team',
          });
        }
      }

      const created = await tx.v1TeamSchedule.create({
        data: {
          teamId,
          teamMatchId: dto.teamMatchId ?? null,
          title: dto.title,
          type: dto.type,
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
          timezone: dto.timezone,
          capacity: dto.capacity ?? null,
          rsvpDeadlineAt: dto.rsvpDeadlineAt ? new Date(dto.rsvpDeadlineAt) : null,
          visibility: dto.visibility ?? V1ScheduleVisibility.TEAM,
          state: V1ScheduleState.SCHEDULED,
          version: 0,
        },
      });

      const response = { ...this.toDetailJson(created), replayed: false };
      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: 'SCHEDULE_CREATE',
          resourceType: RESOURCE_TYPE,
          resourceId: created.id,
          idempotencyKey,
          payloadHash,
          responseStatus: 201,
          responseBody: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
        },
      });
      return response;
    });
  }

  async update(user: V1AuthUser, teamId: string, scheduleId: string, dto: UpdateScheduleDto, idempotencyKey: string) {
    this.assertActiveAccount(user);
    const payloadHash = canonicalGameCommandPayloadHash({ dto });

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, 'SCHEDULE_UPDATE', scheduleId, idempotencyKey);
      const replay = await this.checkReplay(tx, user.id, 'SCHEDULE_UPDATE', scheduleId, idempotencyKey, payloadHash);
      if (replay) return replay;

      await this.assertManageableTeam(tx, user, teamId);
      const schedule = await this.lockSchedule(tx, teamId, scheduleId);

      if (schedule.state !== V1ScheduleState.SCHEDULED) {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
      }
      if (schedule.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Schedule version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: schedule.version },
        });
      }

      const updated = await tx.$executeRaw`
        UPDATE v1_team_schedules
        SET title = ${dto.title ?? schedule.title},
            start_at = ${dto.startAt ? new Date(dto.startAt) : schedule.startAt},
            end_at = ${dto.endAt ? new Date(dto.endAt) : schedule.endAt},
            capacity = ${dto.capacity === undefined ? schedule.capacity : dto.capacity},
            rsvp_deadline_at = ${dto.rsvpDeadlineAt === undefined ? schedule.rsvpDeadlineAt : new Date(dto.rsvpDeadlineAt)},
            visibility = ${(dto.visibility ?? schedule.visibility)}::"V1ScheduleVisibility",
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${scheduleId} AND version = ${dto.expectedVersion}
      `;
      if (updated !== 1) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Schedule version changed during the write' });
      }

      const after = await tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      const response = { ...this.toDetailJson(after), replayed: false };
      await this.storeIdempotency(tx, user.id, 'SCHEDULE_UPDATE', scheduleId, idempotencyKey, payloadHash, 200, response);
      return response;
    });
  }

  async cancel(user: V1AuthUser, teamId: string, scheduleId: string, dto: CancelScheduleDto, idempotencyKey: string) {
    this.assertActiveAccount(user);
    const payloadHash = canonicalGameCommandPayloadHash({ dto });

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, 'SCHEDULE_CANCEL', scheduleId, idempotencyKey);
      const replay = await this.checkReplay(tx, user.id, 'SCHEDULE_CANCEL', scheduleId, idempotencyKey, payloadHash);
      if (replay) return replay;

      await this.assertManageableTeam(tx, user, teamId);
      const schedule = await this.lockSchedule(tx, teamId, scheduleId);

      if (schedule.state !== V1ScheduleState.SCHEDULED) {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
      }
      if (schedule.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Schedule version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: schedule.version },
        });
      }

      const updated = await tx.$executeRaw`
        UPDATE v1_team_schedules
        SET state = 'CANCELLED'::"V1ScheduleState",
            cancel_reason = ${dto.cancelReason},
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${scheduleId} AND version = ${dto.expectedVersion}
      `;
      if (updated !== 1) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Schedule version changed during the write' });
      }

      // Same transaction: close any attached OPEN guest-recruitment. Applications are never
      // mutated/deleted (see GuestRecruitmentService.updateRecruitment's identical note); reminder
      // outbox rows re-check schedule state on fire and no-op if already cancelled (see
      // ScheduleReminderService).
      await tx.$executeRaw`
        UPDATE v1_schedule_guest_recruitments
        SET state = 'CLOSED'::"V1GuestRecruitmentState", version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE schedule_id = ${scheduleId} AND state = 'OPEN'::"V1GuestRecruitmentState"
      `;

      const after = await tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      const response = {
        state: 'cancelled' as const,
        version: after.version,
        cancelledAt: after.updatedAt,
        replayed: false,
      };
      await this.storeIdempotency(tx, user.id, 'SCHEDULE_CANCEL', scheduleId, idempotencyKey, payloadHash, 200, response);
      return response;
    });
  }

  // ---------------------------------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------------------------------

  async triggerReminder(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    dto: TriggerReminderDto,
    idempotencyKey: string,
  ) {
    this.assertActiveAccount(user);
    const payloadHash = canonicalGameCommandPayloadHash({ dto });

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, 'SCHEDULE_REMINDER_TRIGGER', scheduleId, idempotencyKey);
      const replay = await this.checkReplay(
        tx,
        user.id,
        'SCHEDULE_REMINDER_TRIGGER',
        scheduleId,
        idempotencyKey,
        payloadHash,
      );
      if (replay) return replay;

      await this.assertManageableTeam(tx, user, teamId);
      const schedule = await tx.v1TeamSchedule.findFirst({ where: { id: scheduleId, teamId } });
      if (!schedule) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }

      let outboxType: string;
      let availableAt: Date;
      if (dto.kind === 'rsvp_deadline') {
        if (schedule.state !== V1ScheduleState.SCHEDULED) {
          throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
        }
        outboxType = 'SCHEDULE_RSVP_DEADLINE_REMINDER';
        availableAt = schedule.rsvpDeadlineAt ?? new Date();
      } else {
        const recruitment = await tx.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId } });
        if (!recruitment) {
          throw new NotFoundException({
            code: 'GUEST_RECRUITMENT_NOT_FOUND',
            message: 'No guest recruitment is attached to this schedule',
          });
        }
        outboxType = 'SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER';
        availableAt = recruitment.closesAt;
      }

      const businessKey = `schedule:${scheduleId}:reminder:${dto.kind}`;
      const jobId = createHash('sha256').update(businessKey).digest('hex').slice(0, 32);
      const outboxPayload = JSON.stringify({ scheduleId, kind: dto.kind });

      await tx.$executeRaw`
        INSERT INTO v1_outbox_events (
          id, business_key, aggregate_type, aggregate_id, type, payload,
          available_at, status, attempts, retry_generation, version, created_at, updated_at
        ) VALUES (
          ${randomUUID()}, ${businessKey}, 'V1_TEAM_SCHEDULE', ${scheduleId}, ${outboxType}, ${outboxPayload}::jsonb,
          ${availableAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (business_key) DO NOTHING
      `;

      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM v1_outbox_events WHERE business_key = ${businessKey}
      `;
      const liveStatus = rows[0]?.status ?? 'PENDING';

      const response = { jobId, kind: dto.kind, status: liveStatus, replayed: false };
      await this.storeIdempotency(
        tx,
        user.id,
        'SCHEDULE_REMINDER_TRIGGER',
        scheduleId,
        idempotencyKey,
        payloadHash,
        200,
        response,
      );
      return response;
    });
  }

  // ---------------------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------------------

  private toSummary(row: {
    id: string;
    title: string;
    type: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    capacity: number | null;
    rsvpDeadlineAt: Date | null;
    visibility: string;
    state: string;
    version: number;
    teamMatchId: string | null;
    attendance?: Array<{ status: string }>;
  }) {
    const attendance = row.attendance ?? [];
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      startAt: row.startAt,
      endAt: row.endAt,
      timezone: row.timezone,
      capacity: row.capacity,
      rsvpDeadlineAt: row.rsvpDeadlineAt,
      visibility: row.visibility,
      state: row.state,
      version: row.version,
      teamMatchId: row.teamMatchId,
      goingCount: attendance.filter((a) => a.status === 'GOING').length,
      waitlistedCount: attendance.filter((a) => a.status === 'WAITLISTED').length,
    };
  }

  private toDetailJson(row: {
    id: string;
    teamId: string;
    title: string;
    type: string;
    startAt: Date;
    endAt: Date;
    timezone: string;
    capacity: number | null;
    rsvpDeadlineAt: Date | null;
    visibility: string;
    state: string;
    version: number;
    teamMatchId: string | null;
  }) {
    return {
      id: row.id,
      teamId: row.teamId,
      title: row.title,
      type: row.type,
      startAt: row.startAt,
      endAt: row.endAt,
      timezone: row.timezone,
      capacity: row.capacity,
      rsvpDeadlineAt: row.rsvpDeadlineAt,
      visibility: row.visibility,
      state: row.state,
      version: row.version,
      teamMatchId: row.teamMatchId,
    };
  }

  private async isActiveMember(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, status: 'active' },
      select: { id: true },
    });
    return membership !== null;
  }

  /**
   * Visibility scope (decision #2, documented per user instruction): TEAM and MEMBERS both
   * resolve to "requires an active V1TeamMembership row on :teamId" today — this schema has no
   * broader team-follower concept, so the two levels collapse to the same check. The two-level
   * enum is preserved in the schema for future granularity.
   */
  private async assertManageableTeam(tx: Tx, user: V1AuthUser, teamId: string): Promise<void> {
    const team = await tx.v1Team.findFirst({
      where: { id: teamId, status: 'active', deletedAt: null },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
    }
    const membership = await tx.v1TeamMembership.findFirst({
      where: { teamId, userId: user.id, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { id: true },
    });
    if (!membership) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Only team owners or managers can manage schedules' });
    }
  }

  private async lockSchedule(tx: Tx, teamId: string, scheduleId: string) {
    const lock = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
    `;
    if (lock.length === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }
    return tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
  }

  private async lockIdempotencyScope(
    tx: Tx,
    userId: string,
    action: string,
    resourceId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const scope = JSON.stringify([userId, action, RESOURCE_TYPE, resourceId, idempotencyKey]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  }

  private async checkReplay(
    tx: Tx,
    userId: string,
    action: string,
    resourceId: string,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<Record<string, unknown> | null> {
    const existing = await tx.v1IdempotencyRecord.findUnique({
      where: {
        actorUserId_action_resourceType_resourceId_idempotencyKey: {
          actorUserId: userId,
          action,
          resourceType: RESOURCE_TYPE,
          resourceId,
          idempotencyKey,
        },
      },
      select: { payloadHash: true, responseBody: true, expiresAt: true },
    });
    if (existing === null || existing.expiresAt <= new Date()) {
      return null;
    }
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    return { ...(existing.responseBody as Prisma.JsonObject), replayed: true };
  }

  private async storeIdempotency(
    tx: Tx,
    userId: string,
    action: string,
    resourceId: string,
    idempotencyKey: string,
    payloadHash: string,
    responseStatus: number,
    response: unknown,
  ): Promise<void> {
    await tx.v1IdempotencyRecord.create({
      data: {
        actorUserId: userId,
        action,
        resourceType: RESOURCE_TYPE,
        resourceId,
        idempotencyKey,
        payloadHash,
        responseStatus,
        responseBody: JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
      },
    });
  }

  private assertActiveAccount(user: V1AuthUser): void {
    if (user.accountStatus !== 'active') {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Account cannot mutate schedules' });
    }
  }
}
