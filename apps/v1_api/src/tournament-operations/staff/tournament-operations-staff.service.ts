import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { V1AccountStatus, V1TournamentStaffRole, V1TournamentStatus } from '@prisma/client';
import { maskEmail } from '../../auth/account-recovery.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TournamentStaffAccessService,
} from '../../tournaments/staff/tournament-staff-access.service';
import {
  TournamentStaffService,
  type TournamentStaffAssignmentResult,
  type TournamentStaffAuditContext,
} from '../../tournaments/staff/tournament-staff.service';
import type { GrantTournamentStaffDto } from './dto/grant-tournament-staff.dto';
import type { RevokeTournamentStaffDto } from './dto/revoke-tournament-staff.dto';
import type { SearchStaffCandidatesDto } from './dto/search-staff-candidates.dto';

/**
 * 스태프 배정 후보. 신원 확인에 필요한 최소한만 담는다 — 실명·전화번호·원본 이메일은
 * 포함하지 않는다(searchCandidates 주석 참고).
 */
export type StaffCandidate = {
  readonly id: string;
  readonly nickname: string | null;
  readonly displayName: string | null;
  /** `ab***@example.com`. 이메일이 없는 소셜 전용 계정은 null. */
  readonly maskedEmail: string | null;
};

/**
 * 한 번에 돌려주는 후보 수 상한. 스크롤로 명부를 훑는 용도가 되지 않도록 페이지네이션을
 * 일부러 주지 않는다 — 후보가 이보다 많으면 검색어를 더 구체적으로 좁히는 것이 맞다.
 */
const SEARCH_RESULT_LIMIT = 10;

export type TournamentStaffAssignmentListItem = TournamentStaffAssignmentResult & {
  readonly grantedByUserId: string | null;
  readonly createdAt: Date;
};

const STAFF_LIST_SELECT = {
  id: true,
  tournamentId: true,
  userId: true,
  role: true,
  fieldId: true,
  version: true,
  expiresAt: true,
  revokedAt: true,
  grantedByUserId: true,
  createdAt: true,
  fixtureScopes: { select: { fixtureId: true }, orderBy: { fixtureId: 'asc' as const } },
  // 표가 담당자를 userId 앞 8자로만 보여주고 있었다 — 누가 누구인지 알 수 없다는 뜻이다.
  // 공개 신원으로 쓸 수 있는 값은 닉네임뿐이므로(D-03/D-11) 그것만 함께 읽는다.
  user: { select: { profile: { select: { nickname: true } } } },
} as const;

export type MyTournamentStaffAssignmentItem = {
  readonly id: string;
  readonly role: V1TournamentStaffRole;
  readonly fieldId: string | null;
  readonly fieldName: string | null;
  readonly version: number;
  readonly expiresAt: Date | null;
  /**
   * 이 배정이 담당하는 경기들. FIELD_OPERATOR 는 배정에 반드시 경기/필드 스코프가 붙고
   * 대회 전역 리소스를 읽을 수 없어 대회 셸 진입이 막히므로, 화면은 이 목록으로
   * "이 경기 콘솔에 들어가도 되는가"를 판정한다(서버 assertAccess 가 최종 판정).
   * 필드 단위로만 배정된 경우 빈 배열이며, 그때는 fieldId 로 범위가 정해진다.
   */
  readonly fixtureIds: readonly string[];
};

export type MyTournamentStaffGroup = {
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly tournamentStatus: V1TournamentStatus;
  readonly assignments: readonly MyTournamentStaffAssignmentItem[];
};

// 진행 중인 대회를 먼저 보여준다 -- "지금 뭘 해야 하는지"가 급한 순서. 대기(open)는 곧 시작할
// 수 있으니 그 다음, closed/draft는 준비 단계, completed/cancelled는 더 이상 할 일이 없다.
const TOURNAMENT_STATUS_PRIORITY: Record<V1TournamentStatus, number> = {
  in_progress: 0,
  open: 1,
  closed: 2,
  draft: 3,
  completed: 4,
  cancelled: 5,
};

// 한 대회에 여러 배정(예: 필드 담당자로 두 구장)이 있으면 책임이 큰 역할부터 보여준다.
const STAFF_ROLE_PRIORITY: Record<V1TournamentStaffRole, number> = {
  TOURNAMENT_DIRECTOR: 0,
  FIELD_OPERATOR: 1,
  SUPPORT_READONLY: 2,
  PLATFORM_OPS: 3,
};

/**
 * List/grant/revoke orchestration for tournament staff assignments (Task 18).
 *
 * Reuses Task 7's TournamentStaffAccessService (read authorization) and
 * TournamentStaffService (grant/revoke/bootstrap -- already transactional,
 * CAS'd, and audited) wholesale. This lane does not own
 * apps/v1_api/src/tournaments/staff/, so `listStaff` is implemented here as a
 * local read against PrismaService directly rather than as an addition to
 * TournamentStaffService, per the plan's guidance.
 */
@Injectable()
export class TournamentOperationsStaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TournamentStaffAccessService,
    private readonly staffService: TournamentStaffService,
  ) {}

  /**
   * "내 담당 대회" (마이페이지 진입점). `list()`와 달리 tournamentId를 모르는 호출자를 위한
   * self-scoped 조회라 `access.assertAccess()`를 거치지 않는다 -- 자기 자신의 배정을 보는 데는
   * 추가 인가가 필요 없다(TeamsService.myInvitations(), TeamSchedulesService.mySchedule()와
   * 동일한 관례). 만료(`expiresAt` 지남)·해제(`revokedAt` not null)된 배정은 이미 그만둔
   * 스태프가 계속 진입 경로를 보게 되는 것이라 반드시 제외한다.
   */
  async myAssignments(
    userId: string,
  ): Promise<{ readonly items: readonly MyTournamentStaffGroup[] }> {
    const now = new Date();
    const assignments = await this.prisma.v1TournamentStaffAssignment.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        tournamentId: true,
        role: true,
        fieldId: true,
        version: true,
        expiresAt: true,
        tournament: { select: { title: true, status: true } },
        field: { select: { name: true } },
        // 담당 경기 식별자 — 필드 담당자(FIELD_OPERATOR)가 대회 셸을 거치지 않고 자기 경기
        // 콘솔로 바로 들어갈 때 진입 판정에 쓴다. 이 역할은 대회 전역 리소스를 읽을 권한이
        // 없어 셸 진입이 구조적으로 막히므로, 이 목록이 담당 경기를 아는 유일한 출처다.
        fixtureScopes: { select: { fixtureId: true }, orderBy: { fixtureId: 'asc' } },
      },
      orderBy: [{ tournamentId: 'asc' }, { createdAt: 'asc' }],
    });

    // 한 사용자가 같은 대회에 여러 배정을 가질 수 있다(예: 필드 담당자로 두 구장) -- 대회
    // 단위로 묶어 진입 경로가 대회당 하나만 노출되게 한다(중복 카드 방지).
    const groups = new Map<
      string,
      { tournamentId: string; tournamentTitle: string; tournamentStatus: V1TournamentStatus; assignments: MyTournamentStaffAssignmentItem[] }
    >();
    for (const assignment of assignments) {
      let group = groups.get(assignment.tournamentId);
      if (!group) {
        group = {
          tournamentId: assignment.tournamentId,
          tournamentTitle: assignment.tournament.title,
          tournamentStatus: assignment.tournament.status,
          assignments: [],
        };
        groups.set(assignment.tournamentId, group);
      }
      group.assignments.push({
        id: assignment.id,
        role: assignment.role,
        fieldId: assignment.fieldId,
        fieldName: assignment.field?.name ?? null,
        version: assignment.version,
        expiresAt: assignment.expiresAt,
        fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
      });
    }

    const items = [...groups.values()];
    for (const group of items) {
      group.assignments.sort((a, b) => {
        const roleDiff = STAFF_ROLE_PRIORITY[a.role] - STAFF_ROLE_PRIORITY[b.role];
        if (roleDiff !== 0) return roleDiff;
        return (a.fieldName ?? '').localeCompare(b.fieldName ?? '', 'ko');
      });
    }
    items.sort((a, b) => {
      const statusDiff =
        TOURNAMENT_STATUS_PRIORITY[a.tournamentStatus] - TOURNAMENT_STATUS_PRIORITY[b.tournamentStatus];
      if (statusDiff !== 0) return statusDiff;
      return a.tournamentTitle.localeCompare(b.tournamentTitle, 'ko');
    });

    return { items };
  }

  async list(
    userId: string,
    tournamentId: string,
  ): Promise<{ readonly items: readonly TournamentStaffAssignmentListItem[] }> {
    await this.access.assertAccess({
      userId,
      action: 'read',
      resource: { tournamentId },
    });

    const assignments = await this.prisma.v1TournamentStaffAssignment.findMany({
      where: { tournamentId },
      select: STAFF_LIST_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return {
      items: assignments.map((assignment) => ({
        id: assignment.id,
        tournamentId: assignment.tournamentId,
        userId: assignment.userId,
        role: assignment.role,
        fieldId: assignment.fieldId,
        fixtureIds: assignment.fixtureScopes.map((scope) => scope.fixtureId),
        version: assignment.version,
        expiresAt: assignment.expiresAt,
        revokedAt: assignment.revokedAt,
        grantedByUserId: assignment.grantedByUserId,
        createdAt: assignment.createdAt,
        nickname: assignment.user?.profile?.nickname ?? null,
      })),
    };
  }

  /**
   * 배정할 사람을 닉네임으로 찾는다. 이 검색이 없던 동안 배정 폼은 사용자 UUID를 직접
   * 받았고, 화면 안내는 "어드민 > 사용자 관리에서 ID를 복사해 오라"였다 — 어드민이
   * 아닌 대회 디렉터는 그 화면에 못 들어가므로 사실상 스태프를 배정할 방법이 없었다
   * (2026-08-13 사용자 제보).
   *
   * 권한은 **grant 와 정확히 같게** 좁힌다(`platform_ops` | `tournament_director`).
   * `assertAccess`의 'read'만 통과시키면 SUPPORT_READONLY 같은 열람 전용 스태프도
   * 사용자 명부를 조회할 수 있게 되는데, 그건 배정을 할 수 없는 사람에게 검색만
   * 열어 주는 셈이라 개인정보만 새어 나간다. 판정 기준은 assertGrantAuthority
   * (tournaments/staff/tournament-staff.service.ts)와 같은 두 역할이다.
   *
   * 노출 필드는 닉네임·표시명과 **마스킹된 이메일**뿐이다. 실명(realName)은 검색
   * 대상에서도 응답에서도 제외한다 — 동명이인 구분에는 닉네임으로 충분한 반면
   * 실명은 훨씬 민감하다. 이메일은 부분검색을 허용하지 않고 정확히 일치할 때만
   * 매칭한다(이미 주소를 아는 사람만 찾을 수 있다는 뜻이라 명부 열람이 안 된다).
   */
  async searchCandidates(
    actorUserId: string,
    tournamentId: string,
    query: SearchStaffCandidatesDto,
  ): Promise<{ readonly items: readonly StaffCandidate[] }> {
    const principal = await this.access.assertAccess({
      userId: actorUserId,
      action: 'read',
      resource: { tournamentId },
    });
    if (principal.role !== 'platform_ops' && principal.role !== 'tournament_director') {
      throw new ForbiddenException({
        code: 'STAFF_MANAGEMENT_DENIED',
        message: 'Tournament staff management is denied',
        details: { reason: 'DIRECTOR_AUTHORITY_REQUIRED' },
      });
    }

    const q = query.q.trim();
    const users = await this.prisma.v1User.findMany({
      where: {
        deletedAt: null,
        accountStatus: V1AccountStatus.active,
        OR: [
          { profile: { nickname: { contains: q, mode: 'insensitive' } } },
          { profile: { displayName: { contains: q, mode: 'insensitive' } } },
          { email: { equals: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        profile: { select: { nickname: true, displayName: true } },
      },
      orderBy: [{ profile: { nickname: 'asc' } }, { id: 'asc' }],
      take: SEARCH_RESULT_LIMIT,
    });

    return {
      items: users.map((user) => ({
        id: user.id,
        nickname: user.profile?.nickname ?? null,
        displayName: user.profile?.displayName ?? null,
        maskedEmail: user.email === null ? null : maskEmail(user.email),
      })),
    };
  }

  async grant(
    actorUserId: string,
    tournamentId: string,
    dto: GrantTournamentStaffDto,
    audit: TournamentStaffAuditContext,
  ): Promise<TournamentStaffAssignmentResult> {
    const expiresAt = dto.expiresAt === undefined ? null : new Date(dto.expiresAt);

    // Decision #3 default: the frozen contract exposes a single POST route
    // for staff grants with no separate "bootstrap" endpoint, yet
    // TournamentStaffService.grantStaff() *always* throws
    // FIRST_DIRECTOR_REQUIRES_BOOTSTRAP when granting TOURNAMENT_DIRECTOR
    // while the tournament has zero active directors (by design -- see Task
    // 7). So a director grant while the tournament has none is routed to
    // bootstrapFirstDirector() instead. This is a pre-check only: both
    // target methods re-verify the active-director invariant themselves
    // inside a Serializable transaction, so a race between this check and
    // the call still fails closed with the correct 409/403 from the
    // authoritative method -- this branch never bypasses that invariant.
    if (dto.role === V1TournamentStaffRole.TOURNAMENT_DIRECTOR) {
      // bootstrapFirstDirector() (Task 7, apps/v1_api/src/tournaments/staff/,
      // not this lane) has no fieldId/fixtureIds parameters at all -- a
      // director grant can never legitimately carry a field or fixture
      // scope. Reject that explicitly, with the same STAFF_SCOPE_NOT_ALLOWED
      // contract normalizeGrant() uses for an ordinary director grant,
      // *before* branching on activeDirectorCount. Previously this branch
      // just dropped dto.fieldId/dto.fixtureIds on the floor by never
      // forwarding them, so an illegal scope silently "succeeded" only while
      // the tournament had zero active directors and started failing the
      // instant a director existed (Task 18 review finding #10).
      if (dto.fieldId !== undefined || (dto.fixtureIds !== undefined && dto.fixtureIds.length > 0)) {
        throw new BadRequestException({
          code: 'STAFF_SCOPE_NOT_ALLOWED',
          message: 'Only field operators can receive field or fixture scopes',
        });
      }

      const activeDirectorCount = await this.prisma.v1TournamentStaffAssignment.count({
        where: {
          tournamentId,
          role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (activeDirectorCount === 0) {
        return this.staffService.bootstrapFirstDirector({
          actorUserId,
          tournamentId,
          targetUserId: dto.userId,
          expiresAt,
          audit,
        });
      }
    }

    return this.staffService.grantStaff({
      actorUserId,
      tournamentId,
      targetUserId: dto.userId,
      role: dto.role,
      fieldId: dto.fieldId ?? null,
      fixtureIds: dto.fixtureIds ?? [],
      expiresAt,
      audit,
    });
  }

  /**
   * Task 18 review P1-3 (fix): the frozen contract requires `reason` in this endpoint's body, and
   * it MUST be persisted atomically with the revocation itself -- not as a separate follow-up
   * write after `revokeStaff()`'s own transaction has already committed (that was the pre-fix
   * behavior here: a failure in the follow-up write left the assignment revoked with the
   * contract-required reason silently lost, with no way to retry just the reason since the
   * revocation itself was already consumed). `dto.reason` is now passed straight into
   * `TournamentStaffService.revokeStaff()`, which writes it onto the SAME `V1OperationAudit` row
   * as the revoke, inside the SAME transaction (see that method's `writeAudit()` doc comment) --
   * this lane no longer performs its own separate `v1OperationAudit.create()` for it at all.
   */
  async revoke(
    actorUserId: string,
    tournamentId: string,
    assignmentId: string,
    dto: RevokeTournamentStaffDto,
    audit: TournamentStaffAuditContext,
  ): Promise<TournamentStaffAssignmentResult> {
    return this.staffService.revokeStaff({
      actorUserId,
      tournamentId,
      assignmentId,
      expectedVersion: dto.expectedVersion,
      audit,
      reason: dto.reason,
    });
  }
}
