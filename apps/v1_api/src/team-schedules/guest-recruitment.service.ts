import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1ScheduleGuestRecruitment } from '@prisma/client';
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

export interface RecruitmentView {
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

export interface RecruitmentResponse extends RecruitmentView {
  replayed: boolean;
}

export interface ApplicationResponse {
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
      select: { id: true, visibility: true },
    });
    if (!schedule) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }

    const isMember = user !== null && (await this.hasActiveMembership(teamId, user.id));

    // W8-B fix: the PARENT schedule's own visibility must gate this read too, not just the
    // recruitment's — mirrors team-schedules.service.ts's detail() gate ("only PUBLIC is
    // anonymous/non-member readable"). Without this check, a PUBLIC-visibility recruitment
    // attached to a TEAM/MEMBERS-visibility (private) schedule was reachable by any anonymous
    // caller who merely knew the scheduleId, bypassing the parent schedule's privacy entirely.
    // This must run BEFORE the recruitment lookup below (not after) so that, together with the
    // CP4 fix below, a non-member on a private schedule gets the same NOT_FOUND_OR_ARCHIVED
    // regardless of whether a recruitment row exists underneath it.
    if (schedule.visibility !== 'PUBLIC' && !isMember) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }

    const recruitment = await this.prisma.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId: schedule.id } });
    if (!recruitment) {
      // CP4 fix: this GUEST_RECRUITMENT_NOT_FOUND is now only reachable once the schedule-visibility
      // gate above has already let the caller through (isMember, or the schedule is PUBLIC), so it
      // can no longer be used to distinguish "private schedule" from "no recruitment" — that
      // distinction collapsed into the single NOT_FOUND_OR_ARCHIVED thrown above.
      throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
    }

    // recruitment.visibility gates independently from the schedule's own visibility: a PUBLIC
    // schedule can still carry a MEMBERS-only recruitment. Use the same NOT_FOUND_OR_ARCHIVED
    // code/message as the schedule-visibility gate above (not GUEST_RECRUITMENT_NOT_FOUND) so a
    // non-member can never distinguish "schedule is private", "recruitment is members-only", and
    // "no recruitment exists" from each other via the error code.
    if (recruitment.visibility === 'MEMBERS' && !isMember) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Guest recruitment was not found' });
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

      const teamLock = await tx.$queryRaw<Array<{ id: string; state: string }>>`
        SELECT id, state FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (teamLock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      // W4 fix: a CANCELLED schedule's recruitment must stay terminal. Without this check a
      // manager could PATCH { expectedVersion, state: "open" } straight after cancellation and
      // flip the just-CLOSED recruitment back to OPEN, since only recruitment.state === 'FILLED'
      // was previously treated as terminal here. Re-read the *locked* schedule row's state (not a
      // stale pre-lock read) so this is checked atomically with the recruitment mutation below.
      if (teamLock[0].state !== 'SCHEDULED') {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
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

      // W2 fix: lock the schedule row FOR UPDATE *before* reading its state, using the same lock
      // order as cancellation (TeamSchedulesService.cancel -> lockSchedule) and updateRecruitment
      // above (schedule first, recruitment second). Without this lock, an application transaction
      // could read SCHEDULED/OPEN, then a concurrent cancellation could lock the schedule, flip it
      // to CANCELLED, close the recruitment, and commit — all before this transaction's insert,
      // letting a PENDING application land on an already-terminal schedule. Taking the lock here
      // makes this transaction wait behind (or block) any concurrent cancel/update, so the state
      // re-read immediately below is always current.
      const scheduleLock = await tx.$queryRaw<Array<{ id: string; state: string }>>`
        SELECT id, state FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (scheduleLock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      if (scheduleLock[0].state !== 'SCHEDULED') {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is no longer active' });
      }

      // Same fix, recruitment side: lock the recruitment row FOR UPDATE (second in lock order,
      // matching updateRecruitment) so a concurrent close (updateRecruitment) or cancellation
      // (which closes OPEN recruitment) cannot commit between this read and the insert below.
      const recruitmentLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v1_schedule_guest_recruitments WHERE schedule_id = ${scheduleId} FOR UPDATE
      `;
      if (recruitmentLock.length === 0) {
        throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
      }
      const recruitment = await tx.v1ScheduleGuestRecruitment.findUniqueOrThrow({ where: { scheduleId } });

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

      // W3 fix: insert with `ON CONFLICT ... DO NOTHING RETURNING` instead of a Prisma
      // .create() wrapped in a try/catch for P2002. The old code caught P2002 and then issued
      // `findUniqueOrThrow()` on the *same* `tx` — but a statement error (including a unique
      // violation) aborts the enclosing PostgreSQL transaction; every subsequent statement on
      // that transaction, including the recovery SELECT, fails with
      // "current transaction is aborted". The intended "alreadyApplied: true" recovery path was
      // therefore unreachable for a genuine concurrent duplicate. `ON CONFLICT DO NOTHING` never
      // raises a statement error, so the transaction stays healthy and the fallback SELECT below
      // actually runs. (With the W2 locks above, two inserts for the same recruitment now also
      // serialize behind the recruitment row's FOR UPDATE lock, but this fix is independently
      // correct and does not rely on that serialization holding.)
      const applicationId = randomUUID();
      const insertedRows = await tx.$queryRaw<
        Array<{ id: string; state: string; display_name_snapshot: string; note: string | null }>
      >`
        INSERT INTO v1_schedule_guest_applications (
          id, recruitment_id, user_id, display_name_snapshot, note, state, created_at, updated_at
        ) VALUES (
          ${applicationId}, ${recruitment.id}, ${user.id}, ${dto.displayName}, ${dto.note ?? null},
          'PENDING'::"V1GuestApplicationState", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ON CONSTRAINT v1_schedule_guest_applications_recruitment_user_key DO NOTHING
        RETURNING id, state, display_name_snapshot, note
      `;

      if (insertedRows.length === 0) {
        // A genuine concurrent duplicate: another transaction's insert won the race and committed
        // between our duplicate check above and this insert. The transaction is still healthy, so
        // this SELECT reliably returns the winner's row instead of throwing
        // "transaction aborted".
        const raceExisting = await tx.v1ScheduleGuestApplication.findUniqueOrThrow({
          where: { recruitmentId_userId: { recruitmentId: recruitment.id, userId: user.id } },
        });
        const raceResponse: ApplicationResponse = {
          applicationId: raceExisting.id,
          state: raceExisting.state,
          displayName: raceExisting.displayNameSnapshot,
          note: raceExisting.note,
          alreadyApplied: true,
        };
        // CP3 fix: this branch previously returned without ever calling
        // v1IdempotencyRecord.create() for the current idempotencyKey, unlike every other return
        // path in this method. A client retry with the same key therefore never found a replay
        // record here — it re-ran the whole transaction (including the INSERT ... ON CONFLICT)
        // from scratch every time, and never got `replayed: true` back. Persisting the record
        // here closes that gap so the idempotency contract holds uniformly across every branch.
        await tx.v1IdempotencyRecord.create({
          data: {
            actorUserId: user.id,
            action: APPLICATION_ACTION,
            resourceType: APPLICATION_RESOURCE_TYPE,
            resourceId: scheduleId,
            idempotencyKey,
            payloadHash,
            responseStatus: 200,
            responseBody: raceResponse as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
          },
        });
        return { ...raceResponse, replayed: false };
      }

      const created = insertedRows[0];
      const response: ApplicationResponse = {
        applicationId: created.id,
        state: created.state,
        displayName: created.display_name_snapshot,
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
    const identity = {
      actorUserId: userId,
      action,
      resourceType,
      resourceId,
      idempotencyKey,
    };
    const record = await tx.v1IdempotencyRecord.findUnique({
      where: { actorUserId_action_resourceType_resourceId_idempotencyKey: identity },
      select: { payloadHash: true, responseBody: true, expiresAt: true },
    });
    if (record === null) return null;
    if (record.expiresAt <= new Date()) {
      // W9 fix (same defect family as team-schedules.service.ts's checkReplay): an expired
      // record was previously treated as "absent" here but never removed, so the later
      // v1IdempotencyRecord.create() call on this same composite unique key hit a P2002
      // constraint violation and rolled back the whole mutation — a post-expiry replay with the
      // same key could never actually re-apply. Every caller of findReplay already holds the
      // exact-scope advisory lock (lockIdempotencyScope, called immediately before findReplay),
      // so deleting the stale row here is race-safe: no concurrent caller can recreate it before
      // we do.
      await tx.v1IdempotencyRecord.delete({
        where: { actorUserId_action_resourceType_resourceId_idempotencyKey: identity },
      });
      return null;
    }
    return record;
  }
}
