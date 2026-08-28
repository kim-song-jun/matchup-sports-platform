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
    return this.setAttendanceFor(user, user.id, teamId, scheduleId, dto, idempotencyKey);
  }

  /**
   * 팀장·매니저가 팀원의 참석을 **대신** 표시한다.
   *
   * 리그 대진 생성이 팀일정을 함께 만들면서 라인업 저장에 출석 게이트가 걸리는데
   * (team-match-lineup.service.ts, "참석으로 응답한 팀원만"), 출석은 본인만 설정할 수
   * 있어서 선수 한 명이 앱을 안 열면 팀장이 명단을 못 짠다. 리그 대진은 운영자가 일방
   * 배정하는 의무 경기라 그 대기가 특히 비싸다.
   *
   * **정원 규칙은 본인 응답과 동일하다**(사용자 확정) — 정원이 찼으면 대리로 눌러도
   * 자동으로 대기자가 된다. 팀장에게 정원을 넘길 권한을 주면 먼저 응답해 대기자가 된
   * 사람과의 형평성이 깨진다.
   */
  async setAttendanceOnBehalf(
    actor: V1AuthUser,
    targetUserId: string,
    teamId: string,
    scheduleId: string,
    dto: SetAttendanceDto,
    idempotencyKey: string,
  ): Promise<SetAttendanceResponse> {
    // 본인 것을 이 경로로 부르는 것은 막지 않는다 — 결과가 같고, 화면이 자기 자신을
    // 목록에서 고르는 것을 특별취급하지 않아도 되게 한다.
    //
    // 권한 확인은 **트랜잭션 안에서** 한다(아래 setAttendanceFor). 같은 모듈의
    // guest-recruitment.service.ts 가 P1-7/P1-8 로 정확히 이 실수를 고쳤다: 트랜잭션
    // 밖에서 확인하면 그 사이에 커밋된 권한 회수가 이 요청을 막지 못한다.
    return this.setAttendanceFor(actor, targetUserId, teamId, scheduleId, dto, idempotencyKey);
  }

  /**
   * 출석 설정의 공통 본체. **행위자(actor)와 대상자(targetUserId)를 분리한다** —
   * 대리 응답에서 둘이 갈리기 때문이다:
   * - 행위자: 멱등키 범위·감사 로그의 actorUserId (누가 눌렀나)
   * - 대상자: 출석 행·정원 집계·멤버십 검증 (누구의 참석인가)
   * 이 둘을 한 값으로 두면 대리 응답의 감사 로그에 팀원이 행위자로 남는 등 조용히 틀린다.
   */
  private async setAttendanceFor(
    actor: V1AuthUser,
    targetUserId: string,
    teamId: string,
    scheduleId: string,
    dto: SetAttendanceDto,
    idempotencyKey: string,
  ): Promise<SetAttendanceResponse> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, actor.id, scheduleId, idempotencyKey);

      const payloadHash = canonicalGameCommandPayloadHash({
        status: dto.status,
        expectedVersion: dto.expectedVersion,
      });
      const idempotencyIdentity = {
        actorUserId: actor.id,
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
      //
      // P1-8 fix: both reads below used to be plain (unlocked) Prisma queries. A concurrent,
      // already-committed transaction revoking this exact membership row could commit in the gap
      // between this check and the schedule row lock taken immediately after it (a few lines
      // down) — an already-removed member's RSVP could still land. FOR SHARE on both rows, in the
      // same team-then-membership order every other lane in this module uses, forces a concurrent
      // revoke to serialize against this read instead.
      const teamRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v1_teams WHERE id = ${teamId} AND status = 'active' AND deleted_at IS NULL FOR SHARE
      `;
      if (teamRows.length === 0) {
        throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
      }

      // 대리 응답이면 **행위자의 팀장 권한**을 같은 트랜잭션에서, 대상자 멤버십보다
      // 먼저 확인한다(팀 -> 행위자 멤버십 -> 대상자 멤버십 순 — 이 파일과 형제 레인이
      // 쓰는 잠금 순서 그대로). 트랜잭션 밖에서 확인하면 그 사이 커밋된 권한 회수가
      // 이 요청을 못 막는다 — guest-recruitment.service.ts 의 P1-7/P1-8 이 같은 실수였다.
      if (targetUserId !== actor.id) {
        await this.assertActiveManagerLocked(tx, actor.id, teamId);
      }

      const membershipRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM v1_team_memberships WHERE team_id = ${teamId} AND user_id = ${targetUserId} AND status = 'active' FOR SHARE
      `;
      if (membershipRows.length === 0) {
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
        where: { scheduleId_userId: { scheduleId, userId: targetUserId } },
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
        // 정원 산정 일원화 (M-F-team-schedule-attendance-orphan-cleanup fix): 팀을 나가거나
        // 추방된 멤버의 GOING 행은 v1_schedule_attendance에서 지워지지 않는다 — 이탈 경로가
        // teams.service.ts(leaveTeam/removeMembership)·profile.service.ts(회원탈퇴)·
        // admin.service.ts(관리자 비활성화) 4곳으로 흩어져 있어 매 경로마다 정리 훅을 심으면
        // 새 경로가 생길 때마다 또 빠뜨리기 쉽다. 대신 "누가 정원을 차지하는가"를 active
        // 멤버십으로 정의해 원시 행은 그대로 두고(백필 불필요) 판정 시점에만 걸러낸다 — 이
        // 팀의 attendees 목록(team-schedules.service.ts detail())이 이미 쓰는 것과 동일한
        // 조건이라, 화면에 뜨는 참석자 수와 정원 판정이 항상 같은 정의를 쓰게 된다.
        const goingCountRows = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM v1_schedule_attendance a
          INNER JOIN v1_team_memberships m ON m.team_id = ${teamId} AND m.user_id = a.user_id AND m.status = 'active'
          INNER JOIN v1_users u ON u.id = a.user_id AND u.account_status = 'active'
          WHERE a.schedule_id = ${scheduleId} AND a.status = 'GOING'::"V1AttendanceStatus" AND a.user_id != ${targetUserId}
        `;
        const goingCount = Number(goingCountRows[0]?.count ?? 0);
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
            userId: targetUserId,
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
        // P1-1 fix: this UPDATE mutates OTHER users' rows (every WAITLISTED row behind the
        // departed position) without bumping their own `version`/`updated_at` — so two genuinely
        // different persisted states (pre- and post-compaction) shared the identical version
        // number. A client holding a stale, pre-compaction snapshot of its own row (same version,
        // different waitlistPosition) could submit that stale `expectedVersion` and have it
        // silently accepted as current, defeating the whole point of the optimistic-concurrency
        // token. Bumping version/updated_at here — exactly like every other mutation of this table
        // already does — makes a compacted row's version genuinely reflect that its persisted
        // state changed, so a caller's now-stale expectedVersion correctly 409s VERSION_CONFLICT.
        await tx.$executeRaw`
          UPDATE v1_schedule_attendance
          SET waitlist_position = waitlist_position - 1,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
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
        // 승격 대상도 정원 산정과 **같은 정의**를 써야 한다: 위 goingCount 는 active
        // 멤버십으로 자리를 세는데, 승격만 맨 findFirst 로 고르면 이미 팀을 나갔거나
        // 추방된 사람(대기 행은 남아 있다)이 GOING 으로 올라와 자리를 차지한다 —
        // 그 사람은 정원 계산에서는 안 세어지므로 정원이 조용히 한 자리 새는 셈이고,
        // 정작 대기 중인 활성 멤버는 계속 밀린다. 이 배치가 고치려던 바로 그 결함이다.
        const nextInLineRows = await tx.$queryRaw<Array<{ id: string; waitlistPosition: number | null }>>`
          SELECT a.id, a.waitlist_position AS "waitlistPosition"
          FROM v1_schedule_attendance a
          INNER JOIN v1_team_memberships m ON m.team_id = ${teamId} AND m.user_id = a.user_id AND m.status = 'active'
          INNER JOIN v1_users u ON u.id = a.user_id AND u.account_status = 'active'
          WHERE a.schedule_id = ${scheduleId} AND a.status = 'WAITLISTED'::"V1AttendanceStatus"
          ORDER BY a.waitlist_position ASC
          LIMIT 1
        `;
        const nextInLine = nextInLineRows[0] ?? null;
        if (nextInLine) {
          await tx.v1ScheduleAttendance.update({
            where: { id: nextInLine.id },
            data: { status: 'GOING', waitlistPosition: null, version: { increment: 1 } },
          });
          // P1-1 fix: same defect as the departure-compaction UPDATE above, same fix — every
          // remaining WAITLISTED row shifted down by this promotion must also have its own
          // version/updated_at bumped, not just have its waitlist_position silently rewritten
          // underneath an unchanged version.
          await tx.$executeRaw`
            UPDATE v1_schedule_attendance
            SET waitlist_position = waitlist_position - 1,
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE schedule_id = ${scheduleId}
              AND status = 'WAITLISTED'::"V1AttendanceStatus"
              AND waitlist_position > ${nextInLine.waitlistPosition}
          `;
        }
      }

      const counts = await this.computeCounts(tx, teamId, scheduleId);
      const response: SetAttendanceResponse = {
        status: nextStatus,
        version: newVersion,
        waitlistPosition,
        counts,
        replayed: false,
      };

      await tx.v1IdempotencyRecord.create({
        data: {
          actorUserId: actor.id,
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

  // 정원 산정 일원화: 이 응답의 counts도 팀을 나가거나 추방된 멤버의 유령 행을 제외해야
  // capacity 판정(위 setMyAttendance)·team-schedules.service.ts의 goingCount/waitlistedCount·
  // attendees 목록과 같은 숫자를 가리킨다. active 멤버십으로 조인하는 동일한 정의를 쓴다.
  private async computeCounts(tx: Prisma.TransactionClient, teamId: string, scheduleId: string): Promise<AttendanceCounts> {
    const grouped = await tx.$queryRaw<Array<{ status: string; count: bigint }>>`
      SELECT a.status::text AS status, COUNT(*)::bigint AS count
      FROM v1_schedule_attendance a
      INNER JOIN v1_team_memberships m ON m.team_id = ${teamId} AND m.user_id = a.user_id AND m.status = 'active'
      INNER JOIN v1_users u ON u.id = a.user_id AND u.account_status = 'active'
      WHERE a.schedule_id = ${scheduleId}
      GROUP BY a.status
    `;
    const counts: AttendanceCounts = { going: 0, maybe: 0, notGoing: 0, waitlisted: 0 };
    for (const row of grouped) {
      const n = Number(row.count);
      if (row.status === 'GOING') counts.going = n;
      else if (row.status === 'MAYBE') counts.maybe = n;
      else if (row.status === 'NOT_GOING') counts.notGoing = n;
      else if (row.status === 'WAITLISTED') counts.waitlisted = n;
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

  /**
   * 대리 출석 응답의 행위자 권한 확인 — **트랜잭션 안에서 `FOR SHARE` 로 잠근 채** 본다.
   * 형제 레인(guest-recruitment.service.ts `assertActiveManagerLocked`)과 같은 이유·같은
   * 순서다: 보관처리된 팀은 더 읽기 전에 404 로 끊고, 동시에 커밋되는 권한 회수는
   * Postgres MVCC 락 대기로 직렬화시켜 "이미 권한이 회수된 행위자의 쓰기"가 끼어들지
   * 못하게 한다.
   */
  private async assertActiveManagerLocked(
    tx: Prisma.TransactionClient,
    userId: string,
    teamId: string,
  ): Promise<void> {
    // 팀 row 의 존재·active 여부는 호출부(`setAttendanceFor`)가 같은 트랜잭션에서 이미
    // FOR SHARE 로 잠그고 검증한 뒤에 여기로 들어온다 -- 여기서 다시 조회하면 대리 응답
    // 한 번마다 같은 row 를 두 번 읽게 되고, 그 분기는 도달할 수도 없다.
    const managerRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_team_memberships
      WHERE team_id = ${teamId} AND user_id = ${userId} AND status = 'active' AND role IN ('owner', 'manager')
      FOR SHARE
    `;
    if (managerRows.length === 0) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: 'Only team owners or managers can set attendance for others',
      });
    }
  }

}
