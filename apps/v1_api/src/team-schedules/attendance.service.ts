import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SetAttendanceDto } from './dto/attendance.dto';

const ACTION = 'SCHEDULE_SET_ATTENDANCE';
const RESOURCE_TYPE = 'V1_SCHEDULE_ATTENDANCE';
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

interface AttendanceCounts {
  going: number;
  maybe: number;
  notGoing: number;
  waitlisted: number;
}

export interface SetAttendanceResponse {
  status: 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED';
  version: number;
  waitlistPosition: number | null;
  counts: AttendanceCounts;
  replayed: boolean;
}

/**
 * Owns the "attendance" lane of Task 12 (team schedules): self-only RSVP with
 * capacity/waitlist enforcement under concurrent writers. Mirrors the optimistic-version
 * CAS + idempotency pattern established by
 * apps/v1_api/src/game-operations/result-escalation-mutation.service.ts (Task 9):
 * advisory-lock the idempotency scope, replay-check, then mutate under a row lock.
 *
 * Capacity/waitlist race safety: the PARENT V1TeamSchedule row is locked FOR UPDATE at the
 * top of the transaction (mirrors teams.service.ts's leaveTeam lock-then-count pattern), which
 * serializes all concurrent RSVP writers for the same schedule — Postgres blocks a second
 * transaction's FOR UPDATE until the first commits, so a plain post-lock COUNT(*) is race-safe
 * without per-row locking.
 */
@Injectable()
export class ScheduleAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async setMyAttendance(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    dto: SetAttendanceDto,
    idempotencyKey: string,
  ): Promise<SetAttendanceResponse> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, scheduleId, idempotencyKey);

      const payloadHash = canonicalGameCommandPayloadHash({
        status: dto.status,
        expectedVersion: dto.expectedVersion,
      });
      const idempotencyIdentity = {
        actorUserId: user.id,
        action: ACTION,
        resourceType: RESOURCE_TYPE,
        resourceId: scheduleId,
        idempotencyKey,
      };
      const replay = await tx.v1IdempotencyRecord.findUnique({
        where: { actorUserId_action_resourceType_resourceId_idempotencyKey: idempotencyIdentity },
        select: { payloadHash: true, responseBody: true, expiresAt: true },
      });
      if (replay !== null) {
        if (replay.expiresAt <= new Date()) {
          // W9 fix (same defect family as team-schedules.service.ts's checkReplay and the
          // sibling guest-recruitment.service.ts's findReplay): an expired record was previously
          // treated as "absent" here but never removed, so the v1IdempotencyRecord.create() call
          // further down this same transaction hit a P2002 constraint violation on this exact
          // composite key and rolled back the whole attendance write — a post-expiry replay with
          // the same key could never actually re-apply. lockIdempotencyScope (called immediately
          // above) already holds the exact-scope advisory lock for the remainder of this
          // transaction, so deleting the stale row here is race-safe.
          await tx.v1IdempotencyRecord.delete({
            where: { actorUserId_action_resourceType_resourceId_idempotencyKey: idempotencyIdentity },
          });
        } else {
          if (replay.payloadHash !== payloadHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
              message: 'Idempotency key was already used with a different payload',
            });
          }
          return { ...(replay.responseBody as unknown as SetAttendanceResponse), replayed: true };
        }
      }

      // Existence-hiding: a caller who is not an active member of :teamId (or whose team is
      // archived/missing) receives the same 404 a truly-missing team/schedule would produce —
      // never a 403 that would leak team existence, mirroring teams.service.ts's
      // getActiveTeamMembership. Non-member (but team exists and caller can see it) is a
      // distinct case handled below as 403 PERMISSION_DENIED per the frozen error contract for
      // this specific route (the contract lists PERMISSION_DENIED, not existence-hiding, for
      // "not an active team member" on this authenticated-only mutation route).
      const team = await tx.v1Team.findFirst({
        where: { id: teamId, status: 'active', deletedAt: null },
        select: { id: true },
      });
      if (!team) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
      }

      const membership = await tx.v1TeamMembership.findFirst({
        where: { teamId, userId: user.id, status: 'active' },
        select: { id: true },
      });
      if (!membership) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Only active team members can set attendance',
        });
      }

      // Lock the schedule row FOR UPDATE first (serializes concurrent RSVP writers for this
      // schedule), then re-read via the Prisma client within the same transaction for the
      // consistent, locked view.
      const lock = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (lock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      const schedule = await tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });

      if (schedule.state !== 'SCHEDULED') {
        throw new ConflictException({
          code: 'SCHEDULE_NOT_ACTIVE',
          message: 'Schedule is not accepting attendance changes',
        });
      }
      if (schedule.rsvpDeadlineAt !== null && schedule.rsvpDeadlineAt.getTime() < Date.now()) {
        throw new ConflictException({
          code: 'RSVP_DEADLINE_PASSED',
          message: 'RSVP deadline has passed',
        });
      }

      const existing = await tx.v1ScheduleAttendance.findUnique({
        where: { scheduleId_userId: { scheduleId, userId: user.id } },
      });

      if (existing) {
        if (existing.version !== dto.expectedVersion) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Attendance version is stale',
            details: { expectedVersion: dto.expectedVersion, currentVersion: existing.version },
          });
        }
      } else if (dto.expectedVersion !== 0) {
        // No pre-existing row: the caller's very first RSVP on this schedule must be submitted
        // with expectedVersion=0 (per the recon spec's literal invariant text).
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Attendance version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: null },
        });
      }

      const previousStatus = existing?.status ?? null;
      const previousWaitlistPosition = existing?.waitlistPosition ?? null;
      let nextStatus: 'GOING' | 'MAYBE' | 'NOT_GOING' | 'WAITLISTED' = dto.status;
      // Default to the row's current position; the branches below only ever narrow this
      // to `null` (leaving the waitlist) or a freshly computed tail position (newly
      // joining it) — see the WAITLISTED handling immediately after the capacity check.
      let waitlistPosition: number | null = previousWaitlistPosition;

      if (dto.status === 'GOING' && schedule.capacity !== null) {
        const goingCount = await tx.v1ScheduleAttendance.count({
          where: { scheduleId, status: 'GOING', userId: { not: user.id } },
        });
        if (goingCount >= schedule.capacity) {
          nextStatus = 'WAITLISTED';
        }
      }

      if (nextStatus === 'WAITLISTED') {
        if (previousStatus !== 'WAITLISTED') {
          // Newly joining the waitlist. Assign the true tail position via
          // MAX(waitlist_position), never a COUNT() over rows (Task 12 review W6): a prior
          // waitlister who left without a still-pending compaction reaching them leaves a gap,
          // and a COUNT-based position collides with a later row's already-assigned position
          // (duplicate + out-of-order positions). This MAX() read is race-safe for the same
          // reason the capacity COUNT() above is: the schedule row is locked FOR UPDATE at the
          // top of this transaction, serializing every concurrent writer for this schedule.
          const tail = await tx.$queryRaw<{ maxPosition: number | null }[]>`
            SELECT MAX(waitlist_position) AS "maxPosition"
            FROM v1_schedule_attendance
            WHERE schedule_id = ${scheduleId} AND status = 'WAITLISTED'::"V1AttendanceStatus"
          `;
          waitlistPosition = Number(tail[0]?.maxPosition ?? 0) + 1;
        }
        // else: already WAITLISTED and still WAITLISTED (e.g. a repeat GOING request while the
        // schedule is still full) — preserve the existing position (already the default above)
        // instead of recomputing and potentially colliding with another row's position.
      } else {
        waitlistPosition = null;
      }

      let newVersion: number;
      if (existing) {
        const updated = await tx.$executeRaw`
          UPDATE v1_schedule_attendance
          SET status = ${nextStatus}::"V1AttendanceStatus",
              waitlist_position = ${waitlistPosition},
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${existing.id} AND version = ${dto.expectedVersion}
        `;
        if (updated !== 1) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Attendance version changed during the write',
          });
        }
        newVersion = dto.expectedVersion + 1;
      } else {
        await tx.v1ScheduleAttendance.create({
          data: {
            scheduleId,
            userId: user.id,
            status: nextStatus,
            waitlistPosition,
            version: 0,
          },
        });
        newVersion = 0;
      }

      // Waitlist compaction on departure (Task 12 review W6): whenever the caller's own row
      // LEAVES the waitlist — for any reason: switching to MAYBE/NOT_GOING while still
      // waitlisted, or taking an already-open GOING slot directly — every remaining WAITLISTED
      // row behind the departed position must shift down by one so positions stay contiguous
      // and unique. Without this, a later join computed a tail position from MAX() (or the old
      // COUNT()) against a queue with a hole in it and could collide with a position that was
      // never vacated. This is unconditional on capacity because a row can only be WAITLISTED
      // in the first place on a capacity-bounded schedule.
      if (previousStatus === 'WAITLISTED' && nextStatus !== 'WAITLISTED' && previousWaitlistPosition !== null) {
        await tx.$executeRaw`
          UPDATE v1_schedule_attendance
          SET waitlist_position = waitlist_position - 1
          WHERE schedule_id = ${scheduleId}
            AND status = 'WAITLISTED'::"V1AttendanceStatus"
            AND waitlist_position > ${previousWaitlistPosition}
        `;
      }

      // Waitlist promotion on vacancy (design extension beyond the literal frozen contract —
      // documented per user instruction #3, "pick the sensible option and document it"):
      // when the caller's own prior status transitions AWAY from GOING (to MAYBE/NOT_GOING) on
      // a capacity-bounded schedule, promote the lowest-waitlistPosition WAITLISTED row to
      // GOING and compact the remaining WAITLISTED positions down by one, so a freed slot is
      // never permanently stranded behind a waitlisted user.
      if (previousStatus === 'GOING' && nextStatus !== 'GOING' && schedule.capacity !== null) {
        const nextInLine = await tx.v1ScheduleAttendance.findFirst({
          where: { scheduleId, status: 'WAITLISTED' },
          orderBy: { waitlistPosition: 'asc' },
        });
        if (nextInLine) {
          await tx.v1ScheduleAttendance.update({
            where: { id: nextInLine.id },
            data: { status: 'GOING', waitlistPosition: null, version: { increment: 1 } },
          });
          await tx.$executeRaw`
            UPDATE v1_schedule_attendance
            SET waitlist_position = waitlist_position - 1
            WHERE schedule_id = ${scheduleId}
              AND status = 'WAITLISTED'::"V1AttendanceStatus"
              AND waitlist_position > ${nextInLine.waitlistPosition}
          `;
        }
      }

      const counts = await this.computeCounts(tx, scheduleId);
      const response: SetAttendanceResponse = {
        status: nextStatus,
        version: newVersion,
        waitlistPosition,
        counts,
        replayed: false,
      };

      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: ACTION,
          resourceType: RESOURCE_TYPE,
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

  private async computeCounts(tx: Prisma.TransactionClient, scheduleId: string): Promise<AttendanceCounts> {
    const grouped = await tx.v1ScheduleAttendance.groupBy({
      by: ['status'],
      where: { scheduleId },
      _count: { _all: true },
    });
    const counts: AttendanceCounts = { going: 0, maybe: 0, notGoing: 0, waitlisted: 0 };
    for (const row of grouped) {
      if (row.status === 'GOING') counts.going = row._count._all;
      else if (row.status === 'MAYBE') counts.maybe = row._count._all;
      else if (row.status === 'NOT_GOING') counts.notGoing = row._count._all;
      else if (row.status === 'WAITLISTED') counts.waitlisted = row._count._all;
    }
    return counts;
  }

  private async lockIdempotencyScope(
    tx: Prisma.TransactionClient,
    userId: string,
    scheduleId: string,
    idempotencyKey: string,
  ): Promise<void> {
    const scope = JSON.stringify([userId, ACTION, RESOURCE_TYPE, scheduleId, idempotencyKey]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  }
}
