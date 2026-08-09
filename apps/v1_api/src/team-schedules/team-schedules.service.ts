import { randomUUID, createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1ScheduleState, V1ScheduleType, V1ScheduleVisibility } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { MyScheduleQueryDto } from './dto/my-schedule-query.dto';
import { TriggerReminderDto } from './dto/reminder.dto';
import { CancelScheduleDto } from './dto/cancel-schedule.dto';
import { CompleteScheduleDto } from './dto/complete-schedule.dto';
import { CreateScheduleDto, ScheduleListQueryDto, UpdateScheduleDto } from './dto/team-schedule.dto';

const RESOURCE_TYPE = 'V1_TEAM_SCHEDULE';
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const MATCH_SCHEDULE_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1_000;

type Tx = Prisma.TransactionClient;

/**
 * 매치 ↔ 팀일정 연동(레인 schedule). TeamMatchesService(create/approveApplication/cancel/update)와
 * GamesService(submitResultRevision의 결과확정 트랜잭션)가 같은 트랜잭션 안에서 호출하는 내부 전용
 * 진입점 — NestJS DI로 TeamSchedulesService를 주입받는 대신 games.service.ts가 이미 export하는
 * `canonicalGameCommandPayloadHash`와 동일하게 평범한 함수로 export한다. 이 파일의 클래스 메서드가
 * 갖는 상태(PrismaService 등)가 전혀 필요 없는 순수 tx 연산이라 DI가 불필요하고, GamesService를
 * `new GamesService(prisma, ...)`로 직접 생성하는 기존 통합테스트 26개·TeamMatchesService를 직접
 * 생성하는 테스트가 모두 이 함수 시그니처와 무관하게 그대로 컴파일된다(설계 문서는 모듈 DI wiring을
 * 제안했지만, 그 블라스트 반경을 확인한 뒤 이 파일 자체가 이미 쓰고 있는 평문 함수 컨벤션으로
 * 구현 방식만 바꿨다 — 동작·트랜잭션 경계·호출 시점은 설계 그대로).
 */

/**
 * TeamMatch 생성/신청 승인 시점에 "매치가 곧 팀일정"이라는 설계를 구현한다 — endAt이 없으면
 * (팀매치는 endAt이 optional) startAt+2시간을 기본값으로 쓴다(mock 4건 전부 정확히 2시간 창을
 * 쓰는 게 근거, team-matches.view-model.ts).
 */
export async function createTeamMatchScheduleInTx(
  tx: Tx,
  teamId: string,
  teamMatchId: string,
  title: string,
  startAt: Date,
  endAt: Date | null,
): Promise<void> {
  const resolvedEndAt = endAt ?? new Date(startAt.getTime() + MATCH_SCHEDULE_DEFAULT_DURATION_MS);
  await tx.v1TeamSchedule.create({
    data: {
      teamId,
      teamMatchId,
      title,
      type: V1ScheduleType.MATCH,
      startAt,
      endAt: resolvedEndAt,
      timezone: 'Asia/Seoul',
      visibility: V1ScheduleVisibility.TEAM,
      state: V1ScheduleState.SCHEDULED,
      version: 0,
    },
  });
}

/**
 * TeamMatch 수정(recruiting 단계에서만 허용)이 호스트 스케줄의 title/startAt/endAt을 같은
 * 트랜잭션 안에서 동기화한다. recruiting 단계에는 호스트 스케줄 1건만 존재하므로(상대팀 스케줄은
 * approveApplication에서만 생기고, 그 시점 이후 update()는 status!=='recruiting'로 막힌다)
 * `teamMatchId + state=SCHEDULED` 조건이 정확히 그 1건만 갱신한다.
 */
export async function syncTeamMatchScheduleInTx(
  tx: Tx,
  teamMatchId: string,
  title: string,
  startAt: Date,
  endAt: Date | null,
): Promise<void> {
  const resolvedEndAt = endAt ?? new Date(startAt.getTime() + MATCH_SCHEDULE_DEFAULT_DURATION_MS);
  await tx.v1TeamSchedule.updateMany({
    where: { teamMatchId, state: V1ScheduleState.SCHEDULED },
    data: { title, startAt, endAt: resolvedEndAt, version: { increment: 1 } },
  });
}

/**
 * TeamMatch 취소가 연결된 SCHEDULED 스케줄(호스트/상대 최대 2건)을 CANCELLED로 cascade한다.
 * TeamSchedulesService.cancel()이 하는 3단계(state+cancelReason+version 증가, 연결된 OPEN
 * guest-recruitment를 CLOSED로 닫기)를 그대로 복제한다 — row는 절대 삭제하지 않는다("never
 * deletes", docs/api/global-contract.md:15). guest-recruitment를 안 닫으면 complete()의 P1-3
 * fix(이 파일 위쪽 주석 참고)와 같은 버그 클래스가 재발한다.
 */
export async function cascadeCancelTeamMatchSchedulesInTx(
  tx: Tx,
  teamMatchId: string,
  cancelReason: string,
): Promise<void> {
  const schedules = await tx.v1TeamSchedule.findMany({
    where: { teamMatchId, state: V1ScheduleState.SCHEDULED },
    select: { id: true },
  });
  for (const schedule of schedules) {
    await tx.$executeRaw`
      UPDATE v1_team_schedules
      SET state = 'CANCELLED'::"V1ScheduleState",
          cancel_reason = ${cancelReason},
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${schedule.id} AND state = 'SCHEDULED'::"V1ScheduleState"
    `;
    await tx.$executeRaw`
      UPDATE v1_schedule_guest_recruitments
      SET state = 'CLOSED'::"V1GuestRecruitmentState", version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE schedule_id = ${schedule.id} AND state = 'OPEN'::"V1GuestRecruitmentState"
    `;
  }
}

/**
 * games.service.ts의 submitResultRevision()이 TeamMatch를 completed로 전이하는 같은 트랜잭션
 * 안에서 호출한다 — 결과 제출이 팀 매치의 실질적 종료 시점이라는 근거(Task 16)를 그대로 이어받아,
 * TeamSchedulesService.complete()의 수동 경로가 요구하는 endAt 경과 가드를 이 시스템 cascade는
 * 우회한다(결과가 실제로 제출됐다는 사실 자체가 더 강한 증거). 매니저가 직접 누르는 수동 complete()
 * 액션의 가드는 그대로 유지된다.
 */
export async function cascadeCompleteTeamMatchSchedulesInTx(tx: Tx, teamMatchId: string): Promise<void> {
  const schedules = await tx.v1TeamSchedule.findMany({
    where: { teamMatchId, state: V1ScheduleState.SCHEDULED },
    select: { id: true },
  });
  for (const schedule of schedules) {
    await tx.$executeRaw`
      UPDATE v1_team_schedules
      SET state = 'COMPLETED'::"V1ScheduleState",
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${schedule.id} AND state = 'SCHEDULED'::"V1ScheduleState"
    `;
    await tx.$executeRaw`
      UPDATE v1_schedule_guest_recruitments
      SET state = 'CLOSED'::"V1GuestRecruitmentState", version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE schedule_id = ${schedule.id} AND state = 'OPEN'::"V1GuestRecruitmentState"
    `;
  }
}

/**
 * Owns exactly the "schedule CRUD / versioned mutate / cancel / complete / reminder-trigger /
 * my-schedule" lane of Task 12 (team schedules). Sibling lanes — self-only RSVP and guest-recruitment — are
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
    const matchConfirmedByTeamMatchId = await this.loadMatchConfirmationMap(pageItems);

    return {
      items: pageItems.map((row) => this.toSummary(row, matchConfirmedByTeamMatchId)),
      nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null,
    };
  }

  async detail(user: V1AuthUser | null, teamId: string, scheduleId: string) {
    // P1-7 fix: this method previously queried the schedule with no team-active check at all
    // (unlike list(), just above, which already filters `status:'active', deletedAt:null`) — an
    // archived or soft-deleted team's schedule stayed readable (even anonymously, for a PUBLIC
    // one) through this endpoint. Mirror list()'s own gate, and the same NOT_FOUND_OR_ARCHIVED
    // code/message it already uses for an archived team, for consistency across both read paths.
    const team = await this.prisma.v1Team.findFirst({
      where: { id: teamId, status: 'active', deletedAt: null },
      select: { id: true },
    });
    if (!team) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
    }

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

    // 원본 목업(preview.html "02 · 일정 상세와 참석 현황")은 매니저가 참석/미응답 명단을
    // 탭으로 필터링해 한 명씩 보는 화면으로 설계됐지만, 그동안 이 응답은 goingCount 등
    // 집계 숫자와 본인 행(myAttendance)만 내려줘 "누가 왔는지" 자체를 볼 방법이 없었다.
    // 비멤버/공개 열람자에게 팀원 실명 성격의 닉네임 목록을 노출하지 않도록
    // guestRecruitment의 MEMBERS 가시성 게이트와 동일하게 isMember로만 제한한다.
    const attendees = isMember
      ? await (async () => {
          const memberships = await this.prisma.v1TeamMembership.findMany({
            where: { teamId, status: 'active', user: { accountStatus: 'active' } },
            select: {
              userId: true,
              user: { select: { profile: { select: { nickname: true, profileImageUrl: true } } } },
            },
          });
          const attendanceByUser = new Map(schedule.attendance.map((row) => [row.userId, row]));
          return memberships.map((membership) => {
            const row = attendanceByUser.get(membership.userId);
            return {
              userId: membership.userId,
              nickname: membership.user.profile?.nickname ?? '알 수 없음',
              profileImageUrl: membership.user.profile?.profileImageUrl ?? null,
              status: row?.status ?? ('NO_RESPONSE' as const),
              waitlistPosition: row?.waitlistPosition ?? null,
            };
          });
        })()
      : null;

    const recruitment = schedule.guestRecruitment;
    // W8-A fix: schedule detail must not leak a MEMBERS-only recruitment to a caller who could
    // not read it through the dedicated guest-recruitment endpoint (GuestRecruitmentService's own
    // rule: MEMBERS visibility requires active membership). Passing the parent schedule's
    // visibility check (above) is not sufficient — a PUBLIC schedule can still carry a MEMBERS
    // recruitment, so the child's own visibility must be re-checked here independently.
    const canSeeRecruitment = recruitment !== null && (isMember || recruitment.visibility === 'PUBLIC');
    const matchConfirmedByTeamMatchId = await this.loadMatchConfirmationMap([schedule]);

    return {
      ...this.toSummary(schedule, matchConfirmedByTeamMatchId),
      cancelReason: schedule.cancelReason,
      cancelledAt: schedule.state === V1ScheduleState.CANCELLED ? schedule.updatedAt : null,
      guestRecruitment:
        recruitment && canSeeRecruitment
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
      attendees,
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

    // P1-7 fix: previously filtered only on the membership row's own status, with no check on
    // the team itself — an archived/soft-deleted team's schedules stayed included in `/me/
    // schedule` for anyone whose (now-stale) membership row was still `active`. Scope to teams
    // that are themselves still active/non-deleted, same predicate list()/detail() use.
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', team: { status: 'active', deletedAt: null } },
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
    const matchConfirmedByTeamMatchId = await this.loadMatchConfirmationMap(pageItems);

    return {
      items: pageItems.map((row) => {
        const info = infoByTeam.get(row.teamId);
        const mine = row.attendance.find((a) => a.userId === user.id) ?? null;
        return {
          ...this.toSummary(row, matchConfirmedByTeamMatchId),
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
    // 매치 ↔ 팀일정 연동(레인 schedule): MATCH 타입 스케줄은 TeamMatchesService가 트랜잭션 안에서
    // createTeamMatchScheduleInTx()로만 만든다(생명주기: TeamMatch 생성/신청 승인 시점). 이 공개
    // API로 사용자가 MATCH 타입을 직접 만들 길을 열어두면 매니저가 실수로 두 번째 매치 스케줄을
    // 손으로 또 만들 수 있어 명시적으로 거부한다 — 프론트는 이미 생성 폼에서 MATCH를 뺐다
    // (team-schedules.view-model.ts 주석), 백엔드도 동일하게 조인다. 이전에 여기 있던
    // teamMatchId 소유권 검증(W7 fix)은 CreateScheduleDto에서 teamMatchId 필드 자체를 제거하며
    // 함께 정리했다 — 이제 이 필드로 도달할 수 있는 코드 경로가 아예 없다.
    if (dto.type === V1ScheduleType.MATCH) {
      throw new UnprocessableEntityException({
        code: 'SCHEDULE_MATCH_TYPE_SYSTEM_ONLY',
        message: 'MATCH-type schedules are created automatically from team matches and cannot be created directly',
      });
    }

    const payloadHash = canonicalGameCommandPayloadHash({ actorUserId: user.id, teamId, dto });

    return this.prisma.$transaction(async (tx) => {
      // P1-6 fix: this transaction previously used THREE mismatched scopes for what is supposed to
      // be one identity — the advisory lock passed the RESOURCE_TYPE constant string
      // ('V1_TEAM_SCHEDULE') as its resourceId (so the lock was identical for every team the same
      // actor+key ever created a schedule under — a global cross-team collision), the replay
      // lookup below used to drop resourceId from its where-clause entirely (an unordered
      // findFirst() across ALL of that actor's schedule creates, not just this team's, needing a
      // CP2 `createdAt`/`resourceId` tiebreak to pick a winner among however many such rows had
      // accumulated), and only the FINAL stored record used a real, but freshly-generated-every-
      // attempt, resourceId (the new schedule's own id) — so the DB's own composite unique index
      // could never actually deduplicate two creates sharing the same (actor, key): each attempt
      // wrote a brand-new row with a brand-new resourceId. Scoping this identity to `teamId` — a
      // value known before creation and stable across every attempt for the "same" logical create,
      // exactly like guest-recruitment.service.ts's createRecruitment() already scopes on
      // `scheduleId` — fixes all three at once: the lock now genuinely guards this exact (actor,
      // team, key) identity, the lookup can reuse the same generic checkReplay()/
      // storeIdempotency() helpers every other action in this file already uses (a single
      // findUnique against the composite unique index, which can only ever match zero or one row —
      // no tiebreak is needed or possible anymore), and the previously-possible cross-team
      // collision ("동일 actor/key가 모든 팀 create에서 전역 충돌") is gone: two different teams created
      // by the same actor under the same Idempotency-Key can never again replay or
      // payload-conflict against each other. The created schedule's own id is still returned to
      // the caller inside the response body — it simply no longer doubles as this record's
      // resourceId.
      await this.lockIdempotencyScope(tx, user.id, 'SCHEDULE_CREATE', teamId, idempotencyKey);
      const replay = await this.checkReplay(tx, user.id, 'SCHEDULE_CREATE', teamId, idempotencyKey, payloadHash);
      if (replay) return replay;

      await this.assertManageableTeam(tx, user, teamId);

      const created = await tx.v1TeamSchedule.create({
        data: {
          teamId,
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
      // P1-6 fix: resourceId is `teamId` (matching the lock/lookup above), not `created.id` — see
      // this method's own P1-6 comment above for why the created schedule's id must not double as
      // this record's identity scope.
      await this.storeIdempotency(tx, user.id, 'SCHEDULE_CREATE', teamId, idempotencyKey, payloadHash, 201, response);
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

      // P1-9 fix: version must be checked BEFORE the terminal-state check. Previously
      // SCHEDULE_TERMINAL was thrown first, so a stale expectedVersion against an
      // already-cancelled/completed schedule returned SCHEDULE_TERMINAL instead of
      // VERSION_CONFLICT — violating the CAS contract that a stale version is always
      // VERSION_CONFLICT regardless of what else has changed underneath it.
      if (schedule.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Schedule version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: schedule.version },
        });
      }
      if (schedule.state !== V1ScheduleState.SCHEDULED) {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
      }

      // CP1 fix: dto.rsvpDeadlineAt has three meaningful states — `undefined` (field omitted,
      // preserve the existing value), `null` (explicitly cleared, must persist as SQL NULL, NOT
      // `new Date(null)` which silently corrupts the row to 1970-01-01), and a real date string
      // (parse it). The previous two-way `=== undefined` check conflated `null` with "a date
      // string", passing `null` straight into `new Date(...)`.
      const nextRsvpDeadlineAt =
        dto.rsvpDeadlineAt === undefined
          ? schedule.rsvpDeadlineAt
          : dto.rsvpDeadlineAt === null
            ? null
            : new Date(dto.rsvpDeadlineAt);

      const nextCapacity = dto.capacity === undefined ? schedule.capacity : dto.capacity;

      // P1-10 fix: this PATCH previously wrote a new `capacity` straight through with no regard
      // for the derived GOING/WAITLISTED queue it governs. Decreasing capacity below the current
      // GOING count left `goingCount > capacity` permanently — the exact invariant
      // attendance.service.ts's setMyAttendance enforces on every single RSVP write, silently
      // violated here instead. Increasing it (or removing the cap entirely) left newly-freed slots
      // stranded behind whoever was already WAITLISTED, who would sit there forever unless they
      // happened to resubmit an RSVP of their own. `goingCount` is read under the SAME schedule row
      // lock (lockSchedule, above) that attendance.service.ts's setMyAttendance relies on for its
      // own capacity/waitlist race-safety, so this can never race a concurrent RSVP write, and the
      // reject-check below runs BEFORE the schedule UPDATE so a would-be-invalid decrease never
      // partially mutates anything.
      let goingCountForCapacityChange: number | null = null;
      if (nextCapacity !== schedule.capacity) {
        goingCountForCapacityChange = await tx.v1ScheduleAttendance.count({ where: { scheduleId, status: 'GOING' } });
        if (nextCapacity !== null && nextCapacity < goingCountForCapacityChange) {
          throw new ConflictException({
            code: 'SCHEDULE_CAPACITY_BELOW_GOING_COUNT',
            message: 'New capacity is lower than the current number of GOING attendees',
            details: { capacity: nextCapacity, goingCount: goingCountForCapacityChange },
          });
        }
      }

      const updated = await tx.$executeRaw`
        UPDATE v1_team_schedules
        SET title = ${dto.title ?? schedule.title},
            start_at = ${dto.startAt ? new Date(dto.startAt) : schedule.startAt},
            end_at = ${dto.endAt ? new Date(dto.endAt) : schedule.endAt},
            capacity = ${nextCapacity},
            rsvp_deadline_at = ${nextRsvpDeadlineAt},
            visibility = ${(dto.visibility ?? schedule.visibility)}::"V1ScheduleVisibility",
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${scheduleId} AND version = ${dto.expectedVersion}
      `;
      if (updated !== 1) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Schedule version changed during the write' });
      }

      // P1-10 fix (continued): capacity genuinely changed and already passed the reject-check
      // above. Two sub-cases actually free slots and require promoting from the front of the
      // waitlist; a decrease that still fits every current GOING attendee frees nothing and leaves
      // the waitlist untouched (its relative order is still valid).
      if (goingCountForCapacityChange !== null) {
        if (nextCapacity === null) {
          // Design decision (undocumented in the frozen contract, per the review — "capacity를
          // 무제한으로 변경할 경우 waitlist 처리 정책 명시"): removing the cap entirely means nobody
          // should be left WAITLISTED on what is now an uncapped schedule, so every waitlisted row
          // is promoted.
          await tx.$executeRaw`
            UPDATE v1_schedule_attendance
            SET status = 'GOING'::"V1AttendanceStatus",
                waitlist_position = NULL,
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE schedule_id = ${scheduleId} AND status = 'WAITLISTED'::"V1AttendanceStatus"
          `;
        } else if (nextCapacity > goingCountForCapacityChange) {
          const freedSlots = nextCapacity - goingCountForCapacityChange;
          // Promote the front `freedSlots` WAITLISTED rows (lowest waitlistPosition first) to
          // GOING — mirrors attendance.service.ts's single-slot vacancy-promotion, generalized to
          // however many slots this capacity increase actually freed.
          await tx.$executeRaw`
            WITH promoted AS (
              SELECT id FROM v1_schedule_attendance
              WHERE schedule_id = ${scheduleId} AND status = 'WAITLISTED'::"V1AttendanceStatus"
              ORDER BY waitlist_position ASC
              LIMIT ${freedSlots}
            )
            UPDATE v1_schedule_attendance a
            SET status = 'GOING'::"V1AttendanceStatus",
                waitlist_position = NULL,
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            FROM promoted
            WHERE a.id = promoted.id
          `;
          // Compact the remaining WAITLISTED rows (whatever wasn't promoted above) down by exactly
          // `freedSlots`, keeping positions contiguous starting at 1 — same invariant
          // attendance.service.ts's own departure-compaction maintains.
          await tx.$executeRaw`
            UPDATE v1_schedule_attendance
            SET waitlist_position = waitlist_position - ${freedSlots},
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE schedule_id = ${scheduleId} AND status = 'WAITLISTED'::"V1AttendanceStatus"
          `;
        }
      }

      const after = await tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      // 매치 ↔ 팀일정 연동(레인 schedule): 이 PATCH가 MATCH 타입 스케줄(capacity/visibility 등)을
      // 건드릴 수도 있으므로, 응답의 matchConfirmed도 최신 상태로 계산해 돌려준다.
      const matchConfirmed =
        after.type === V1ScheduleType.MATCH && after.teamMatchId
          ? (
              await tx.v1TeamMatch.findUnique({
                where: { id: after.teamMatchId },
                select: { approvedApplicantTeamId: true },
              })
            )?.approvedApplicantTeamId != null
          : null;
      const response = { ...this.toDetailJson(after, matchConfirmed), replayed: false };
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

      // P1-9 fix: see update()'s identical fix above — version must be checked before terminal
      // state, so a stale expectedVersion against an already-terminal schedule still reports
      // VERSION_CONFLICT, never SCHEDULE_TERMINAL.
      if (schedule.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Schedule version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: schedule.version },
        });
      }
      if (schedule.state !== V1ScheduleState.SCHEDULED) {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
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

  /**
   * W10 fix: chosen resolution is "implement the transition" (not "make the state machine
   * honest" by dropping COMPLETED from the query filter), because the frozen contract
   * (docs/api/global-contract.md:59) literally lists `scheduled -> cancelled|completed` as the
   * only permitted transitions — completion is a contractual requirement, not an optional
   * extension. An explicit, versioned, idempotent mutation (mirroring cancel()'s CAS pattern)
   * was chosen over a persisted background worker because a worker would require new files
   * outside this lane's ownership (a cron/job composition root, per the separate
   * jobs/schedule-reminders lane) that cannot be wired up or verified from here. Team
   * owner/manager explicitly marks a schedule complete once its endAt has passed; this makes
   * COMPLETED reachable and terminal without requiring schema/migration changes, since
   * attendance.service.ts's existing `schedule.state !== 'SCHEDULED'` terminal check already
   * rejects mutations once this transition lands.
   */
  async complete(
    user: V1AuthUser,
    teamId: string,
    scheduleId: string,
    dto: CompleteScheduleDto,
    idempotencyKey: string,
  ) {
    this.assertActiveAccount(user);
    const payloadHash = canonicalGameCommandPayloadHash({ dto });

    return this.prisma.$transaction(async (tx) => {
      await this.lockIdempotencyScope(tx, user.id, 'SCHEDULE_COMPLETE', scheduleId, idempotencyKey);
      const replay = await this.checkReplay(tx, user.id, 'SCHEDULE_COMPLETE', scheduleId, idempotencyKey, payloadHash);
      if (replay) return replay;

      await this.assertManageableTeam(tx, user, teamId);
      const schedule = await this.lockSchedule(tx, teamId, scheduleId);

      // P1-9 fix: version must be checked before EITHER the terminal-state check or the
      // not-yet-ended time check. Previously both of those ran first, so a stale expectedVersion
      // against a schedule that either hadn't ended yet or was already terminal returned
      // SCHEDULE_NOT_YET_ENDED/SCHEDULE_TERMINAL instead of VERSION_CONFLICT.
      if (schedule.version !== dto.expectedVersion) {
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Schedule version is stale',
          details: { expectedVersion: dto.expectedVersion, currentVersion: schedule.version },
        });
      }
      if (schedule.state !== V1ScheduleState.SCHEDULED) {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
      }
      if (schedule.endAt.getTime() > Date.now()) {
        throw new ConflictException({
          code: 'SCHEDULE_NOT_YET_ENDED',
          message: 'Schedule cannot be completed before its end time',
        });
      }

      const updated = await tx.$executeRaw`
        UPDATE v1_team_schedules
        SET state = 'COMPLETED'::"V1ScheduleState",
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${scheduleId} AND version = ${dto.expectedVersion}
      `;
      if (updated !== 1) {
        throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Schedule version changed during the write' });
      }

      // P1-3 fix: cancel() (above) closes any attached OPEN guest-recruitment in the same
      // transaction as the cancellation; complete() never had the equivalent statement, so a
      // schedule could reach COMPLETED while its recruitment stayed OPEN forever — new
      // applications were rejected (the parent's own terminal check), but GET still displayed an
      // OPEN recruitment, and a still-pending guest_recruitment_close outbox reminder had no
      // signal that its parent had ended (see the matching fix in schedule-reminder.service.ts's
      // guestRecruitmentCloseReminderHandler, which now also independently guards against this).
      await tx.$executeRaw`
        UPDATE v1_schedule_guest_recruitments
        SET state = 'CLOSED'::"V1GuestRecruitmentState", version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE schedule_id = ${scheduleId} AND state = 'OPEN'::"V1GuestRecruitmentState"
      `;

      const after = await tx.v1TeamSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
      const response = {
        state: 'completed' as const,
        version: after.version,
        completedAt: after.updatedAt,
        replayed: false,
      };
      await this.storeIdempotency(tx, user.id, 'SCHEDULE_COMPLETE', scheduleId, idempotencyKey, payloadHash, 200, response);
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
      // W5 fix: this previously used an unlocked findFirst(), racing against cancel()'s FOR UPDATE
      // lock on the same row — a concurrent cancel could commit between this read and the outbox
      // insert below, letting a reminder be scheduled for a schedule that is (or is about to be)
      // terminal. lockSchedule() takes the same FOR UPDATE lock, in the same lock order, that
      // cancel()/update()/complete() already take on this row, so this transaction now either
      // observes the post-cancel state or blocks until the concurrent cancel commits.
      const schedule = await this.lockSchedule(tx, teamId, scheduleId);

      // W5 fix: this terminal check previously only guarded the rsvp_deadline branch. A cancelled
      // schedule's attached OPEN guest-recruitment is closed in the same transaction as cancel()
      // (see cancel() above), but nothing stopped a `guest_recruitment_close` trigger from racing
      // in and reading the recruitment before that close landed, or from firing right after a
      // schedule was cancelled without ever checking schedule.state at all. Hoisting this check
      // above the branch makes both reminder kinds reject once the parent schedule is terminal.
      if (schedule.state !== V1ScheduleState.SCHEDULED) {
        throw new ConflictException({ code: 'SCHEDULE_TERMINAL', message: 'Schedule is already terminal' });
      }

      let outboxType: string;
      let availableAt: Date;
      // P1-2 fix: `generationKey` is folded into the outbox business key below, and the matching
      // `expectedState` fields are folded into the outbox payload, so the worker handler
      // (schedule-reminder.service.ts) can no-op a stale-but-still-pending row. Before this fix,
      // the business key was permanently `schedule:{id}:reminder:{kind}` regardless of what the
      // reminder was actually FOR — once any reminder of a given kind had ever been triggered for
      // this schedule, every later trigger (even after the deadline/recruitment it targets had
      // since changed) hit `ON CONFLICT (business_key) DO NOTHING` and silently did nothing: a
      // rescheduled RSVP deadline could never get its own reminder (it would still fire, if at
      // all, at the OLD deadline time), and a reopened/edited recruitment's close reminder could
      // not be told apart from a stale one for a since-superseded closesAt. Scoping the key by the
      // rsvpDeadlineAt value itself (rsvp_deadline) or the recruitment's own version
      // (guest_recruitment_close, which bumps on every mutation of that row — see
      // guest-recruitment.service.ts's updateRecruitment) makes each genuinely distinct
      // deadline/generation get its own outbox row, and lets the handler recognize + skip a row
      // whose generation the target has since moved past.
      let generationKey: string;
      let expectedState: Record<string, unknown>;
      if (dto.kind === 'rsvp_deadline') {
        outboxType = 'SCHEDULE_RSVP_DEADLINE_REMINDER';
        availableAt = schedule.rsvpDeadlineAt ?? new Date();
        generationKey = schedule.rsvpDeadlineAt ? schedule.rsvpDeadlineAt.toISOString() : 'none';
        expectedState = { expectedRsvpDeadlineAt: schedule.rsvpDeadlineAt ? schedule.rsvpDeadlineAt.toISOString() : null };
      } else {
        const recruitment = await tx.v1ScheduleGuestRecruitment.findUnique({ where: { scheduleId } });
        if (!recruitment) {
          throw new NotFoundException({
            code: 'GUEST_RECRUITMENT_NOT_FOUND',
            message: 'No guest recruitment is attached to this schedule',
          });
        }
        // W5 fix: the guest_recruitment_close branch previously accepted and enqueued a reminder
        // regardless of the recruitment's own state, so a CLOSED/FILLED recruitment could still
        // get a "closing soon" reminder scheduled against it. Mirrors the rsvp_deadline branch's
        // schedule-terminal guard above, one level down.
        if (recruitment.state !== 'OPEN') {
          throw new ConflictException({
            code: 'GUEST_RECRUITMENT_TERMINAL',
            message: 'Guest recruitment is already terminal',
          });
        }
        outboxType = 'SCHEDULE_GUEST_RECRUITMENT_CLOSE_REMINDER';
        availableAt = recruitment.closesAt;
        generationKey = String(recruitment.version);
        expectedState = { expectedRecruitmentVersion: recruitment.version };
      }

      const businessKey = `schedule:${scheduleId}:reminder:${dto.kind}:${generationKey}`;
      const jobId = createHash('sha256').update(businessKey).digest('hex').slice(0, 32);
      const outboxPayload = JSON.stringify({ scheduleId, kind: dto.kind, ...expectedState });

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

  private toSummary(
    row: {
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
    },
    matchConfirmedByTeamMatchId: Map<string, boolean> = new Map(),
  ) {
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
      // 매치 ↔ 팀일정 연동(레인 schedule): "가확정(상대팀 모집 중) vs 확정(상대팀 확정)"은 순수
      // 파생값이다 — V1ScheduleState는 건드리지 않고, type===MATCH일 때만 연결된 TeamMatch의
      // approvedApplicantTeamId 유무로 매 조회 시점마다 새로 계산한다(levelLabel이 FK에서 파생
      // 계산되는 것과 같은 원칙). MATCH가 아닌 스케줄은 이 개념 자체가 없으므로 항상 null.
      matchConfirmed:
        row.type === V1ScheduleType.MATCH && row.teamMatchId
          ? matchConfirmedByTeamMatchId.get(row.teamMatchId) ?? null
          : null,
      goingCount: attendance.filter((a) => a.status === 'GOING').length,
      waitlistedCount: attendance.filter((a) => a.status === 'WAITLISTED').length,
    };
  }

  private toDetailJson(
    row: {
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
    },
    matchConfirmed: boolean | null = null,
  ) {
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
      matchConfirmed: row.type === V1ScheduleType.MATCH && row.teamMatchId ? matchConfirmed : null,
    };
  }

  /**
   * 매치 ↔ 팀일정 연동(레인 schedule): list()/detail()/mySchedule()이 페이지에 등장하는 MATCH 타입
   * 스케줄들의 teamMatchId를 배치 1회 조회해 확정 여부 맵을 만든다(N+1 방지 — computeRevealedTeamTrustBatch
   * 가 team-matches.service.ts에서 이미 쓰는 것과 같은 배치 패턴).
   */
  private async loadMatchConfirmationMap(
    rows: Array<{ type: string; teamMatchId: string | null }>,
  ): Promise<Map<string, boolean>> {
    const teamMatchIds = [
      ...new Set(
        rows
          .filter((row): row is { type: string; teamMatchId: string } => row.type === V1ScheduleType.MATCH && row.teamMatchId !== null)
          .map((row) => row.teamMatchId),
      ),
    ];
    if (teamMatchIds.length === 0) return new Map();
    const matches = await this.prisma.v1TeamMatch.findMany({
      where: { id: { in: teamMatchIds } },
      select: { id: true, approvedApplicantTeamId: true },
    });
    return new Map(matches.map((match) => [match.id, match.approvedApplicantTeamId !== null]));
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
  /**
   * P1-8 fix: both reads here used to be plain (unlocked) Prisma queries. A plain SELECT takes no
   * row lock, so a *concurrent, already-committed* transaction revoking or demoting this exact
   * membership row could commit in the gap between this check returning and the schedule row
   * lock taken immediately afterward (lockSchedule, called right after this method returns from
   * every call site) — an already-permission-revoked actor's mutation could still land. Locking
   * both rows FOR SHARE — team first, then membership, matching the same order
   * GuestRecruitmentService.assertActiveManagerLocked uses — forces a concurrent revoke/demotion
   * to serialize against this read via Postgres's own MVCC lock wait, so the two can never
   * interleave. (The team `status`/`deletedAt` filter itself was already correct — P1-7's
   * archived-team gap was in detail()/mySchedule()/GuestRecruitmentService, not here.)
   */
  private async assertManageableTeam(tx: Tx, user: V1AuthUser, teamId: string): Promise<void> {
    const teamRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_teams WHERE id = ${teamId} AND status = 'active' AND deleted_at IS NULL FOR SHARE
    `;
    if (teamRows.length === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team was not found' });
    }
    const membershipRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_team_memberships
      WHERE team_id = ${teamId} AND user_id = ${user.id} AND status = 'active' AND role IN ('owner', 'manager')
      FOR SHARE
    `;
    if (membershipRows.length === 0) {
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
    const identity = {
      actorUserId: userId,
      action,
      resourceType: RESOURCE_TYPE,
      resourceId,
      idempotencyKey,
    };
    const existing = await tx.v1IdempotencyRecord.findUnique({
      where: { actorUserId_action_resourceType_resourceId_idempotencyKey: identity },
      select: { payloadHash: true, responseBody: true, expiresAt: true },
    });
    if (existing === null) {
      return null;
    }
    if (existing.expiresAt <= new Date()) {
      // W9 fix: an expired record was previously treated as "absent" here but never removed, so
      // storeIdempotency()'s later create() on this same composite unique key hit a P2002
      // constraint violation and rolled back the whole mutation. We hold the exact-scope
      // advisory lock (lockIdempotencyScope, called before this) for the remainder of this
      // transaction, so deleting the stale row here is race-safe: no concurrent caller can
      // recreate it before we do.
      await tx.v1IdempotencyRecord.delete({
        where: { actorUserId_action_resourceType_resourceId_idempotencyKey: identity },
      });
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
