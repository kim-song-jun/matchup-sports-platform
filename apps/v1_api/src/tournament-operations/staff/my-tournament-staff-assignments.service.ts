import { Injectable } from '@nestjs/common';
import { Prisma, V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 한 배정이 안내할 수 있는 담당 경기 수의 상한. 필드 단위로 배정된 담당자는 그 필드에서
 * 열리는 모든 경기를 맡으므로 대회 규모에 따라 수십 건이 될 수 있다 — 진입 목록은 "지금
 * 어디로 들어가면 되는지"를 보여주는 화면이지 경기 목록 화면이 아니므로, 일정이 이른
 * 순서로 잘라서 돌려준다(잘렸다는 사실은 `fixturesTruncated`로 알린다).
 */
export const MY_ASSIGNMENT_FIXTURE_LIMIT = 50;

/** 한 번의 조회에서 읽는 경기 행의 절대 상한(배정 여러 건의 합계). */
const FIXTURE_QUERY_LIMIT = 200;

export type MyTournamentStaffFixture = {
  readonly fixtureId: string;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber: number;
  readonly scheduledAt: Date | null;
  readonly status: string;
  readonly fieldId: string | null;
  readonly fieldName: string | null;
  readonly homeTeamName: string | null;
  readonly awayTeamName: string | null;
};

export type MyTournamentStaffAssignmentItem = {
  readonly assignmentId: string;
  readonly tournamentId: string;
  readonly tournamentTitle: string;
  readonly tournamentStatus: string;
  readonly tournamentScheduledAt: Date | null;
  readonly role: V1TournamentStaffRole;
  /**
   * 배정의 낙관적 잠금 버전. 경기 콘솔의 실시간 핸드셰이크가 이 값을 제시해야
   * `game.subscribe`/`game.takeover.request`의 staleness 게이트를 통과한다
   * (RealtimeGateway). 필드 담당자는 대회 전역 스태프 목록을 읽을 수 없으므로
   * 이 값을 얻을 곳이 여기뿐이다.
   */
  readonly version: number;
  readonly expiresAt: Date | null;
  readonly fieldId: string | null;
  readonly fieldName: string | null;
  /** FIELD_OPERATOR 전용 — 다른 역할은 대회 셸로 들어가므로 항상 빈 배열이다. */
  readonly fixtures: readonly MyTournamentStaffFixture[];
  readonly fixturesTruncated: boolean;
};

type AssignmentRow = {
  readonly id: string;
  readonly tournamentId: string;
  readonly role: V1TournamentStaffRole;
  readonly fieldId: string | null;
  readonly version: number;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly tournament: {
    readonly title: string;
    readonly status: string;
    readonly scheduledAt: Date | null;
  };
  readonly field: { readonly name: string } | null;
  readonly fixtureScopes: readonly { readonly fixtureId: string }[];
};

type FixtureRow = {
  readonly id: string;
  readonly tournamentId: string;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber: number;
  readonly scheduledAt: Date | null;
  readonly status: string;
  readonly fieldId: string | null;
  readonly field: { readonly name: string } | null;
  readonly homeRegistration: { readonly team: { readonly name: string } } | null;
  readonly awayRegistration: { readonly team: { readonly name: string } } | null;
};

/**
 * "내 스태프 배정" 조회 (트랙 D).
 *
 * ## 왜 필요한가
 * 배정/해제 API와 권한 정책(`decideTournamentStaffAccess`)은 이미 있었지만, **배정받은
 * 사람이 자기 배정을 찾아 들어갈 경로가 없었다**. 특히 FIELD_OPERATOR 는 배정에 반드시
 * fixture/field 스코프가 붙기 때문에(정책 `parseAssignment`) 대회 전역 리소스를 읽는
 * 셸 진입 판정(`GET .../staff`)에서 항상 FIXTURE/FIELD_SCOPE_REQUIRED 로 거부된다 —
 * 즉 "대회 셸을 거쳐 내 경기로" 가는 경로 자체가 구조적으로 막혀 있다. 그래서 이
 * 엔드포인트는 셸을 거치지 않고 **담당 경기 콘솔로 직행할 식별자**를 함께 돌려준다.
 *
 * ## 인가
 * 조회 대상은 **호출자 본인의 배정뿐**이다. userId 는 `V1AuthGuard` 가 세운 인증 주체에서만
 * 오고(요청 바디/쿼리로 받지 않는다) 남의 배정을 지정할 파라미터 자체가 없다. 여기서
 * 돌려주는 목록은 **화면 안내용**이고 실제 권한 판정이 아니다 — 콘솔이 호출하는 모든 API 는
 * 여전히 `TournamentStaffAccessService.assertAccess()` 로 매 요청 재판정된다(이 목록에
 * 없는 경기를 손으로 열어도 그쪽에서 403 이 난다).
 *
 * ## 스코프 → 담당 경기 해석
 * 아래 `fixtureScopeWhere()` 의 조건은 정책 함수의 스코프 규칙과 1:1 로 대응한다
 * (fixtureIds 가 있으면 그 안에 있어야 하고, fieldId 가 있으면 그 필드여야 한다 — 둘 다
 * 있으면 AND). 정책 함수를 여기서 직접 호출하지 않는 이유는 그 함수가 UUID 형식과
 * 밀리초 ISO 문자열을 엄격히 요구해서, 형식이 다른 시드 데이터에서 "권한은 있는데 목록에만
 * 안 보이는" 조용한 누락이 생길 수 있기 때문이다. 대신 두 규칙이 어긋나지 않는지를
 * `my-tournament-staff-assignments.service.spec.ts` 가 정책 함수로 교차 검증한다.
 */
@Injectable()
export class MyTournamentStaffAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listMine(
    userId: string,
    now: Date = new Date(),
  ): Promise<{ readonly items: readonly MyTournamentStaffAssignmentItem[] }> {
    const assignments: readonly AssignmentRow[] =
      await this.prisma.v1TournamentStaffAssignment.findMany({
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
          createdAt: true,
          tournament: { select: { title: true, status: true, scheduledAt: true } },
          field: { select: { name: true } },
          fixtureScopes: { select: { fixtureId: true }, orderBy: { fixtureId: 'asc' } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });

    const fixtures = await this.loadScopedFixtures(assignments);

    return {
      items: assignments.map((assignment) => {
        const scoped =
          assignment.role === V1TournamentStaffRole.FIELD_OPERATOR
            ? fixtures.filter((fixture) => this.coversFixture(assignment, fixture))
            : [];
        return {
          assignmentId: assignment.id,
          tournamentId: assignment.tournamentId,
          tournamentTitle: assignment.tournament.title,
          tournamentStatus: assignment.tournament.status,
          tournamentScheduledAt: assignment.tournament.scheduledAt,
          role: assignment.role,
          version: assignment.version,
          expiresAt: assignment.expiresAt,
          fieldId: assignment.fieldId,
          fieldName: assignment.field?.name ?? null,
          fixtures: scoped.slice(0, MY_ASSIGNMENT_FIXTURE_LIMIT).map((fixture) => ({
            fixtureId: fixture.id,
            round: fixture.round,
            fixtureNumber: fixture.fixtureNumber,
            legNumber: fixture.legNumber,
            scheduledAt: fixture.scheduledAt,
            status: fixture.status,
            fieldId: fixture.fieldId,
            fieldName: fixture.field?.name ?? null,
            homeTeamName: fixture.homeRegistration?.team.name ?? null,
            awayTeamName: fixture.awayRegistration?.team.name ?? null,
          })),
          fixturesTruncated: scoped.length > MY_ASSIGNMENT_FIXTURE_LIMIT,
        };
      }),
    };
  }

  /** 스코프가 붙은 FIELD_OPERATOR 배정들의 담당 경기를 한 번의 질의로 읽는다. */
  private async loadScopedFixtures(
    assignments: readonly AssignmentRow[],
  ): Promise<readonly FixtureRow[]> {
    const clauses = assignments
      .filter((assignment) => assignment.role === V1TournamentStaffRole.FIELD_OPERATOR)
      .map((assignment) => this.fixtureScopeWhere(assignment));
    if (clauses.length === 0) {
      return [];
    }
    return this.prisma.v1TournamentFixture.findMany({
      where: { OR: clauses },
      select: {
        id: true,
        tournamentId: true,
        round: true,
        fixtureNumber: true,
        legNumber: true,
        scheduledAt: true,
        status: true,
        fieldId: true,
        field: { select: { name: true } },
        homeRegistration: { select: { team: { select: { name: true } } } },
        awayRegistration: { select: { team: { select: { name: true } } } },
      },
      // Postgres 는 ASC 에서 NULL 을 마지막에 둔다 — 시각 미정 경기가 일정이 잡힌 경기보다
      // 앞에 오지 않는다.
      orderBy: [{ scheduledAt: 'asc' }, { round: 'asc' }, { fixtureNumber: 'asc' }, { id: 'asc' }],
      take: FIXTURE_QUERY_LIMIT,
    });
  }

  private fixtureScopeWhere(assignment: AssignmentRow): Prisma.V1TournamentFixtureWhereInput {
    const fixtureIds = assignment.fixtureScopes.map((scope) => scope.fixtureId);
    return {
      tournamentId: assignment.tournamentId,
      ...(fixtureIds.length > 0 ? { id: { in: fixtureIds } } : {}),
      ...(assignment.fieldId === null ? {} : { fieldId: assignment.fieldId }),
    };
  }

  /** `fixtureScopeWhere()` 와 같은 규칙의 메모리 판정 — 합쳐 읽은 결과를 배정별로 되돌린다. */
  private coversFixture(assignment: AssignmentRow, fixture: FixtureRow): boolean {
    if (fixture.tournamentId !== assignment.tournamentId) return false;
    const fixtureIds = assignment.fixtureScopes.map((scope) => scope.fixtureId);
    if (fixtureIds.length > 0 && !fixtureIds.includes(fixture.id)) return false;
    if (assignment.fieldId !== null && fixture.fieldId !== assignment.fieldId) return false;
    return true;
  }
}
