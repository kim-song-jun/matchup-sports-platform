import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1ScheduleGuestRecruitment } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateGuestApplicationDto,
  CreateGuestRecruitmentDto,
  ReviewGuestApplicationDto,
  UpdateGuestRecruitmentDto,
} from './dto/guest-recruitment.dto';

const CREATE_ACTION = 'SCHEDULE_GUEST_RECRUITMENT_CREATE';
const UPDATE_ACTION = 'SCHEDULE_GUEST_RECRUITMENT_UPDATE';
const APPLICATION_ACTION = 'SCHEDULE_GUEST_RECRUITMENT_APPLY';
const REVIEW_ACTION = 'SCHEDULE_GUEST_APPLICATION_REVIEW';
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

export interface ApplicationListItemView {
  applicationId: string;
  displayName: string;
  note: string | null;
  state: string;
  createdAt: string;
}

export interface ReviewApplicationResponse {
  applicationId: string;
  state: string;
  displayName: string;
  note: string | null;
  recruitmentState: string;
  alreadyProcessed: boolean;
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
  constructor(private readonly prisma: PrismaService) {}

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

    // P0-2 fix: the comment that used to sit here claimed a hidden MEMBERS recruitment threw the
    // SAME code as the branch above ("Use the same NOT_FOUND_OR_ARCHIVED code/message... so a
    // non-member can never distinguish..."), but the code directly below it actually threw
    // NOT_FOUND_OR_ARCHIVED here while the "no recruitment" branch above throws
    // GUEST_RECRUITMENT_NOT_FOUND — two different codes for the two cases a non-member must not be
    // able to tell apart on an otherwise-visible (PUBLIC or member-visible) schedule: "no
    // recruitment exists" vs "a recruitment exists but is MEMBERS-only". That mismatch let a
    // non-member on a PUBLIC schedule learn "a hidden recruitment exists" purely from which 404
    // code came back — the comment disagreed with the code it sat next to. Both branches now throw
    // the identical GUEST_RECRUITMENT_NOT_FOUND code/message; only the schedule-visibility gate
    // above (private/missing schedule) keeps its own, separately-collapsed NOT_FOUND_OR_ARCHIVED.
    if (recruitment.visibility === 'MEMBERS' && !isMember) {
      throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
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

      // P1-7/P1-8 fix: this was `await this.assertManagerOrOwner(user.id, teamId)`, called BEFORE
      // this transaction even opened — see assertActiveManagerLocked's docblock for the two
      // independent bugs that left (archived team stayed mutable; a concurrent revoke/demotion
      // could commit in the unlocked gap between this check and the schedule mutation below).
      await this.assertActiveManagerLocked(tx, user.id, teamId);

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
    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, UPDATE_ACTION, RECRUITMENT_RESOURCE_TYPE, scheduleId, idempotencyKey);

      // P1-5 fix: `note`/`state` used `dto.field ?? null`, which collapses two DIFFERENT meanings
      // into the identical hash value — an omitted field (`undefined`, meaning "preserve the
      // existing value", per nextNote/nextState below) and an explicitly-supplied `null`/`'closed'`
      // both hashed to `null`/whatever-that-branch-produces the same way. Two requests under the
      // SAME idempotencyKey with genuinely different intent (e.g. `{expectedVersion:0}` vs
      // `{expectedVersion:0, note:null}`) could therefore be silently treated as an identical
      // replay instead of correctly 409ing IDEMPOTENCY_PAYLOAD_CONFLICT. `=== undefined` reads
      // exactly the same condition nextNote/nextState use to decide "preserve" vs "apply verbatim"
      // below, so this hash now tracks the same three-way distinction (omitted / null / value) the
      // mutation itself makes. `state` can no longer actually be `null` by the time this runs (the
      // DTO's own P1-5 fix 400s an explicit null before validation ever lets it reach here), but
      // `=== undefined` is kept here too — for symmetry with `note`, and so this hash can never
      // again silently reabsorb a null if that validation ever changes. `slots`/`closesAt` are
      // unaffected: both fields already treat omitted and null identically end-to-end (see
      // nextSlots/nextClosesAt below), so no behavioral distinction is being lost by hashing them
      // with `?? null`.
      const payloadHash = canonicalGameCommandPayloadHash({
        expectedVersion: dto.expectedVersion,
        slots: dto.slots ?? null,
        closesAt: dto.closesAt ?? null,
        note: dto.note === undefined ? '__omitted__' : dto.note,
        visibility: dto.visibility ?? null,
        state: dto.state === undefined ? '__omitted__' : dto.state,
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

      // P1-7/P1-8 fix: see createRecruitment's identical fix above and assertActiveManagerLocked's
      // docblock — this was `await this.assertManagerOrOwner(user.id, teamId)` outside the
      // transaction entirely.
      await this.assertActiveManagerLocked(tx, user.id, teamId);

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
      // DTO's allowlist entirely, and the guard just above this block already rejects ANY update
      // once `recruitment.state === 'FILLED'` — so `requestedState` can only ever resolve to OPEN
      // or CLOSED here (never FILLED, whether requested explicitly or inherited via omission).
      const requestedState = dto.state === undefined ? recruitment.state : dto.state === 'open' ? 'OPEN' : 'CLOSED';

      // P1-10 fix: this update previously wrote `slots` and `state` straight through with no
      // regard for the approvedCount they derive against — the DTO's own comment says "FILLED is
      // server-derived only (approvedCount === slots)", but nothing here ever actually checked
      // that. Decreasing slots below the current approvedCount left an impossible
      // `approvedCount > slots` state on record; leaving slots at exactly approvedCount kept the
      // recruitment OPEN forever instead of transitioning it to FILLED like a freshly-filled
      // recruitment created via the application-approval path would be. `approvedCount` is read
      // fresh here, under the SAME recruitment row lock (`recruitmentLock`, above) this method
      // already holds for its own CAS, so it reflects the current, consistent count for this exact
      // mutation.
      const approvedCount = await tx.v1ScheduleGuestApplication.count({
        where: { recruitmentId: recruitment.id, state: 'APPROVED' },
      });
      if (nextSlots < approvedCount) {
        throw new ConflictException({
          code: 'GUEST_RECRUITMENT_SLOTS_BELOW_APPROVED_COUNT',
          message: 'New slots is lower than the current number of approved applicants',
          details: { slots: nextSlots, approvedCount },
        });
      }
      // An explicit (or preserved) CLOSED always wins outright — closing means "no longer
      // accepting applications" regardless of the slots/approvedCount arithmetic. Otherwise the
      // final state is purely derived from slots vs. approvedCount, exactly as the DTO's own
      // comment promises: exactly full becomes FILLED, anything with room left is OPEN.
      const nextState = requestedState === 'CLOSED' ? 'CLOSED' : nextSlots === approvedCount ? 'FILLED' : 'OPEN';

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

      // P1-7 fix: this method never checked the parent team's active/non-deleted status at all
      // (only the schedule's own existence + team_id) — an archived or soft-deleted team's
      // schedule stayed fully appliable by a guest. Lock the team row FOR SHARE first, matching
      // the lock order (team -> membership-not-required-here -> schedule -> recruitment) used by
      // assertActiveManagerLocked and mirroring attendance.service.ts's setMyAttendance, which
      // already got the team-active check right.
      const teamLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v1_teams WHERE id = ${teamId} AND status = 'active' AND deleted_at IS NULL FOR SHARE
      `;
      if (teamLock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
      }

      // W2 fix: lock the schedule row FOR UPDATE *before* reading its state, using the same lock
      // order as cancellation (TeamSchedulesService.cancel -> lockSchedule) and updateRecruitment
      // above (schedule first, recruitment second). Without this lock, an application transaction
      // could read SCHEDULED/OPEN, then a concurrent cancellation could lock the schedule, flip it
      // to CANCELLED, close the recruitment, and commit — all before this transaction's insert,
      // letting a PENDING application land on an already-terminal schedule. Taking the lock here
      // makes this transaction wait behind (or block) any concurrent cancel/update, so the state
      // re-read immediately below is always current.
      //
      // P0-1 fix: this query previously selected only {id, state} — visibility was never read or
      // checked anywhere in this method, even though the applicant need not be a team member (see
      // this method's own docblock). That meant an outsider could POST an application to a
      // private (non-PUBLIC) schedule's recruitment, or to a MEMBERS-only recruitment on an
      // otherwise-PUBLIC schedule, even though the matching GET (getRecruitment(), above) 404s for
      // both — a mutation-path bypass of the read-path's own visibility gate. Compute membership
      // once and gate on it BEFORE any state/deadline/duplicate check below (a private/terminal
      // schedule must 404, never leak SCHEDULE_TERMINAL or a deadline 409 to a caller who
      // shouldn't even know the schedule exists).
      const scheduleLock = await tx.$queryRaw<Array<{ id: string; state: string; visibility: string }>>`
        SELECT id, state, visibility::text AS visibility
        FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (scheduleLock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      const isMember = await this.hasActiveMembership(teamId, user.id);
      if (scheduleLock[0].visibility !== 'PUBLIC' && !isMember) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }
      if (scheduleLock[0].state !== 'SCHEDULED') {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is no longer active' });
      }

      // Same fix, recruitment side: lock the recruitment row FOR UPDATE (second in lock order,
      // matching updateRecruitment) so a concurrent close (updateRecruitment) or cancellation
      // (which closes OPEN recruitment) cannot commit between this read and the insert below.
      //
      // P0-1/P0-2 fix: also read visibility here and gate it, using the exact same
      // GUEST_RECRUITMENT_NOT_FOUND code/message getRecruitment() now uses uniformly for both "no
      // recruitment" and "hidden MEMBERS recruitment" (see the P0-2 fix above) — a non-member can
      // never distinguish the two through this endpoint either.
      const recruitmentLock = await tx.$queryRaw<Array<{ id: string; visibility: string }>>`
        SELECT id, visibility::text AS visibility
        FROM v1_schedule_guest_recruitments WHERE schedule_id = ${scheduleId} FOR UPDATE
      `;
      if (recruitmentLock.length === 0) {
        throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
      }
      if (recruitmentLock[0].visibility === 'MEMBERS' && !isMember) {
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
      // .create() wrapped in a try/catch for P2002 — see insertApplicationOrRecoverDuplicate()'s
      // docblock for the full reasoning and, per the FG-3 review finding, why that method is
      // extracted out and directly unit-tested rather than only exercised through this one,
      // fully-serialized public call path.
      const { response, isNewInsert } = await this.insertApplicationOrRecoverDuplicate(tx, recruitment.id, user.id, dto);

      if (!isNewInsert) {
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
            responseBody: response as unknown as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
          },
        });
        return { ...response, replayed: false };
      }

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

      // P1-4 fix: this used to be a fire-and-forget `NotificationsService.emitToManyDeferred(...)`
      // call kicked off from inside this $transaction callback but never awaited by it, with its
      // recipient lookup running through `this.prisma` (a separate connection from `tx`) — so the
      // manager notification's own durability was entirely decoupled from this transaction's
      // commit/rollback. A commit failure after that detached work had already run could notify
      // managers about an application that was never actually persisted; a process crash between
      // this transaction's commit and that detached promise's execution could lose the
      // notification forever, with no retry path (and the old test suite never asserted the mock
      // was even called, so deleting the whole side effect stayed green). Recording a durable
      // outbox row in the SAME transaction that inserts the application (mirrors
      // team-schedules.service.ts's triggerReminder — an identical INSERT INTO v1_outbox_events
      // with a business key) makes the notification's existence atomic with the application it
      // describes: if this transaction rolls back, the outbox row rolls back with it; if it
      // commits, the durable worker handler
      // (ScheduleReminderService.guestApplicationManagerNotificationHandler, registered in
      // v1-game-operations-worker.main.ts) is guaranteed to eventually claim and deliver it,
      // exactly like the existing reminder outbox events.
      const managerNotificationBusinessKey = `guest-application:${response.applicationId}:manager-notification`;
      const managerNotificationPayload = JSON.stringify({ teamId, scheduleId, displayName: dto.displayName });
      await tx.$executeRaw`
        INSERT INTO v1_outbox_events (
          id, business_key, aggregate_type, aggregate_id, type, payload,
          available_at, status, attempts, retry_generation, version, created_at, updated_at
        ) VALUES (
          ${randomUUID()}, ${managerNotificationBusinessKey}, 'V1_SCHEDULE_GUEST_APPLICATION',
          ${response.applicationId}, 'SCHEDULE_GUEST_APPLICATION_MANAGER_NOTIFICATION',
          ${managerNotificationPayload}::jsonb,
          CURRENT_TIMESTAMP, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (business_key) DO NOTHING
      `;

      return { ...response, replayed: false };
    });
  }

  /**
   * manager+ only. Not part of the frozen contract table (docs/api/global-contract.md lists only
   * GET/POST/PATCH .../guest-recruitment + POST .../applications) — added because without it there
   * was no way for a manager to even SEE who applied, let alone decide, so every application sat
   * PENDING forever (see reviewApplication below). A plain (unlocked) read is fine here: this
   * lists whatever committed state currently exists, with no CAS/versioned mutation attached.
   */
  async listApplications(user: V1AuthUser, teamId: string, scheduleId: string): Promise<{ items: ApplicationListItemView[] }> {
    const schedule = await this.prisma.v1TeamSchedule.findFirst({
      where: { id: scheduleId, teamId },
      select: { id: true },
    });
    if (!schedule) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
    }

    const isManager = await this.hasActiveManagerRole(teamId, user.id);
    if (!isManager) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Only team owners or managers can view guest applications' });
    }

    const recruitment = await this.prisma.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId: schedule.id } });
    if (!recruitment) {
      throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
    }

    const applications = await this.prisma.v1ScheduleGuestApplication.findMany({
      where: { recruitmentId: recruitment.id },
      orderBy: { createdAt: 'asc' },
    });

    return {
      items: applications.map((application) => ({
        applicationId: application.id,
        displayName: application.displayNameSnapshot,
        note: application.note,
        state: application.state,
        createdAt: application.createdAt.toISOString(),
      })),
    };
  }

  /**
   * manager+ only. Same gap as listApplications above: PENDING was a one-way door (createApplication
   * inserts it; nothing anywhere else in this file, or the whole v1_api tree, ever wrote APPROVED or
   * REJECTED). Mirrors updateRecruitment's lock order (team -> schedule -> recruitment) and extends
   * it one level deeper (-> application), all FOR UPDATE inside the same transaction, so a
   * concurrent approve on a second application for the same recruitment can never both land when
   * only one slot remains — the second reviewer's approvedCount re-read below always sees the
   * first's already-committed row.
   */
  async reviewApplication(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    applicationId: string,
    dto: ReviewGuestApplicationDto,
    idempotencyKey: string,
  ): Promise<ReviewApplicationResponse & { replayed: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, REVIEW_ACTION, APPLICATION_RESOURCE_TYPE, applicationId, idempotencyKey);

      const payloadHash = canonicalGameCommandPayloadHash({ state: dto.state });
      const replay = await this.findReplay(tx, user.id, REVIEW_ACTION, APPLICATION_RESOURCE_TYPE, applicationId, idempotencyKey);
      if (replay !== null) {
        if (replay.payloadHash !== payloadHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
            message: 'Idempotency key was already used with a different payload',
          });
        }
        return { ...(replay.responseBody as unknown as ReviewApplicationResponse), replayed: true };
      }

      await this.assertActiveManagerLocked(tx, user.id, teamId);

      const scheduleLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v1_team_schedules WHERE id = ${scheduleId} AND team_id = ${teamId} FOR UPDATE
      `;
      if (scheduleLock.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Schedule was not found' });
      }

      const recruitmentLock = await tx.$queryRaw<Array<{ id: string; slots: number; state: string }>>`
        SELECT id, slots, state::text AS state FROM v1_schedule_guest_recruitments WHERE schedule_id = ${scheduleId} FOR UPDATE
      `;
      if (recruitmentLock.length === 0) {
        throw new NotFoundException({ code: 'GUEST_RECRUITMENT_NOT_FOUND', message: 'Guest recruitment was not found' });
      }
      const recruitment = recruitmentLock[0];

      const applicationLock = await tx.$queryRaw<
        Array<{ id: string; state: string; display_name_snapshot: string; note: string | null }>
      >`
        SELECT id, state::text AS state, display_name_snapshot, note
        FROM v1_schedule_guest_applications
        WHERE id = ${applicationId} AND recruitment_id = ${recruitment.id}
        FOR UPDATE
      `;
      if (applicationLock.length === 0) {
        throw new NotFoundException({ code: 'GUEST_APPLICATION_NOT_FOUND', message: 'Guest application was not found' });
      }
      const application = applicationLock[0];
      const targetState = dto.state === 'approved' ? 'APPROVED' : 'REJECTED';

      if (application.state !== 'PENDING') {
        if (application.state === targetState) {
          // Same idempotent-accept/reject shape as teams/applications' accept|reject (see
          // TeamMembershipService's sibling endpoints): re-reviewing to the SAME state it is
          // already in is a no-op success, not a conflict — a manager double-clicking "승인" after
          // a slow response must not see an error for a request that already succeeded.
          const response: ReviewApplicationResponse = {
            applicationId: application.id,
            state: application.state,
            displayName: application.display_name_snapshot,
            note: application.note,
            recruitmentState: recruitment.state,
            alreadyProcessed: true,
          };
          await tx.v1IdempotencyRecord.create({
            data: {
              actorUserId: user.id,
              action: REVIEW_ACTION,
              resourceType: APPLICATION_RESOURCE_TYPE,
              resourceId: applicationId,
              idempotencyKey,
              payloadHash,
              responseStatus: 200,
              responseBody: response as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
            },
          });
          return { ...response, replayed: false };
        }
        throw new ConflictException({
          code: 'GUEST_APPLICATION_NOT_PENDING',
          message: 'Guest application has already been reviewed',
          details: { currentState: application.state },
        });
      }

      if (targetState === 'APPROVED') {
        const approvedCount = await tx.v1ScheduleGuestApplication.count({
          where: { recruitmentId: recruitment.id, state: 'APPROVED' },
        });
        if (approvedCount >= recruitment.slots) {
          throw new ConflictException({
            code: 'GUEST_RECRUITMENT_FULL',
            message: 'Guest recruitment slots are already full',
            details: { slots: recruitment.slots, approvedCount },
          });
        }
      }

      await tx.$executeRaw`
        UPDATE v1_schedule_guest_applications
        SET state = ${targetState}::"V1GuestApplicationState", updated_at = CURRENT_TIMESTAMP
        WHERE id = ${applicationId}
      `;

      // Re-derive recruitment.state exactly like updateRecruitment's own nextState formula: CLOSED
      // always wins outright, otherwise exactly-full becomes FILLED and anything with room left is
      // OPEN. A reject never changes approvedCount, so this is a no-op transition for reject when
      // the recruitment was already OPEN/FILLED — it only ever actually moves state on approve.
      const approvedCountAfter = await tx.v1ScheduleGuestApplication.count({
        where: { recruitmentId: recruitment.id, state: 'APPROVED' },
      });
      let recruitmentState = recruitment.state;
      if (recruitment.state !== 'CLOSED') {
        recruitmentState = recruitment.slots === approvedCountAfter ? 'FILLED' : 'OPEN';
        if (recruitmentState !== recruitment.state) {
          await tx.$executeRaw`
            UPDATE v1_schedule_guest_recruitments
            SET state = ${recruitmentState}::"V1GuestRecruitmentState", version = version + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${recruitment.id}
          `;
        }
      }

      const response: ReviewApplicationResponse = {
        applicationId: application.id,
        state: targetState,
        displayName: application.display_name_snapshot,
        note: application.note,
        recruitmentState,
        alreadyProcessed: false,
      };
      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: user.id,
          action: REVIEW_ACTION,
          resourceType: APPLICATION_RESOURCE_TYPE,
          resourceId: applicationId,
          idempotencyKey,
          payloadHash,
          responseStatus: 200,
          responseBody: response as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_RETENTION_MS),
        },
      });

      // NOTE: deliberately no applicant-facing outbox notification here (unlike
      // createApplication's manager notification above). An outbox row's `type` must be
      // registered with a handler in v1-game-operations-worker.main.ts
      // (worker.registerHandler(...)) and implemented in schedule-reminder.service.ts — neither
      // file is in this change's owned files, so inserting an unregistered event type would leave
      // a dead/poison outbox row instead of a real notification. Wiring an applicant-facing
      // "your guest application was approved/rejected" notification is real, worthwhile follow-up
      // work, but belongs in a change that owns the worker registration + handler together.

      return { ...response, replayed: false };
    });
  }

  /**
   * FG-3 fix: extracted out of createApplication() specifically so it can be exercised directly
   * by a test, without needing genuine concurrent connections. The review found that
   * createApplication()'s own `insertedRows.length === 0` recovery branch is, today, unreachable
   * through the public method — the W2 fix's schedule-then-recruitment `FOR UPDATE` locks fully
   * serialize two concurrent createApplication() calls for the same recruitment, so a second
   * caller's pre-insert `existingApplication` check always observes the first caller's
   * already-committed row before ever reaching this INSERT. That makes the two existing
   * concurrency tests in guest-recruitment.integration-spec.ts ("W3 observable contract" and "W3
   * SQL contract") correct but insufficient: the former only proves the caller-facing contract via
   * a path that never hits this method's 0-row branch, and the latter tests the raw SQL pattern
   * directly against the DB without ever invoking this method at all. This method itself is
   * insert-with-ON-CONFLICT-DO-NOTHING-RETURNING instead of a Prisma `.create()` wrapped in a
   * try/catch for P2002: the old code caught P2002 and then issued `findUniqueOrThrow()` on the
   * *same* `tx`, but a statement error (including a unique violation) aborts the enclosing
   * PostgreSQL transaction — every subsequent statement on that transaction, including the
   * recovery SELECT, fails with "current transaction is aborted". `ON CONFLICT DO NOTHING` never
   * raises a statement error, so the transaction stays healthy and the fallback SELECT below
   * actually runs — a property that does not depend on the W2 locking/serialization holding, and
   * is exactly what schedule-reminders.service.spec.ts-style direct unit coverage
   * (guest-recruitment.integration-spec.ts's dedicated FG-3 regression test) can prove by
   * pre-seeding a genuine duplicate row and calling this method directly, deterministically
   * hitting the 0-row branch without any timing-dependent race.
   */
  private async insertApplicationOrRecoverDuplicate(
    tx: Prisma.TransactionClient,
    recruitmentId: string,
    userId: string,
    dto: CreateGuestApplicationDto,
  ): Promise<{ response: ApplicationResponse; isNewInsert: boolean }> {
    const applicationId = randomUUID();
    const insertedRows = await tx.$queryRaw<
      Array<{ id: string; state: string; display_name_snapshot: string; note: string | null }>
    >`
      INSERT INTO v1_schedule_guest_applications (
        id, recruitment_id, user_id, display_name_snapshot, note, state, created_at, updated_at
      ) VALUES (
        ${applicationId}, ${recruitmentId}, ${userId}, ${dto.displayName}, ${dto.note ?? null},
        'PENDING'::"V1GuestApplicationState", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT (recruitment_id, user_id) DO NOTHING
      RETURNING id, state, display_name_snapshot, note
    `;

    if (insertedRows.length === 0) {
      // A genuine concurrent duplicate: another transaction's insert won the race and committed
      // between the caller's duplicate check and this insert. The transaction is still healthy,
      // so this SELECT reliably returns the winner's row instead of throwing
      // "transaction aborted".
      const raceExisting = await tx.v1ScheduleGuestApplication.findUniqueOrThrow({
        where: { recruitmentId_userId: { recruitmentId, userId } },
      });
      return {
        response: {
          applicationId: raceExisting.id,
          state: raceExisting.state,
          displayName: raceExisting.displayNameSnapshot,
          note: raceExisting.note,
          alreadyApplied: true,
        },
        isNewInsert: false,
      };
    }

    const created = insertedRows[0];
    return {
      response: {
        applicationId: created.id,
        state: created.state,
        displayName: created.display_name_snapshot,
        note: created.note,
        alreadyApplied: false,
      },
      isNewInsert: true,
    };
  }

  private async hasActiveMembership(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, status: 'active' },
      select: { id: true },
    });
    return membership !== null;
  }

  /** Plain (unlocked) manager+ check for listApplications' read path — no CAS/mutation follows it,
   * so unlike assertActiveManagerLocked this deliberately does not lock any row FOR SHARE/UPDATE. */
  private async hasActiveManagerRole(teamId: string, userId: string): Promise<boolean> {
    const membership = await this.prisma.v1TeamMembership.findFirst({
      where: { teamId, userId, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { id: true },
    });
    return membership !== null;
  }

  /**
   * P1-7/P1-8 fix: replaces the old `assertManagerOrOwner()`, which had two independent bugs.
   * (P1-7) It never checked the team's `status`/`deletedAt` at all — only the membership row —
   * so an archived or soft-deleted team's guest recruitment stayed fully createable/mutable by
   * its last-known manager. (P1-8) `createRecruitment`/`updateRecruitment` both called it
   * entirely OUTSIDE their `$transaction`, and even inside a transaction a plain (unlocked)
   * Prisma read does not stop a *concurrent, already-committed* transaction from revoking or
   * demoting that exact membership row in the gap between this check and the schedule/recruitment
   * mutation later in the same call — an already-permission-revoked actor's mutation could still
   * land. Locking both rows FOR SHARE here, inside the transaction and before the schedule/
   * recruitment locks that follow (team -> membership -> schedule -> recruitment, the same order
   * every lane in this file uses), closes both: an archived team 404s before any further read, and
   * a concurrent revoke/demotion is forced to serialize against this read via Postgres's own MVCC
   * lock wait — the two can never interleave.
   */
  private async assertActiveManagerLocked(tx: Prisma.TransactionClient, userId: string, teamId: string): Promise<void> {
    const teamRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_teams WHERE id = ${teamId} AND status = 'active' AND deleted_at IS NULL FOR SHARE
    `;
    if (teamRows.length === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
    }

    const membershipRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_team_memberships
      WHERE team_id = ${teamId} AND user_id = ${userId} AND status = 'active' AND role IN ('owner', 'manager')
      FOR SHARE
    `;
    if (membershipRows.length === 0) {
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
