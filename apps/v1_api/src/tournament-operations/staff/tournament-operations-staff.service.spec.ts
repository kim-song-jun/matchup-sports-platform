import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { V1TournamentStaffRole, V1TournamentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { TournamentStaffService } from '../../tournaments/staff/tournament-staff.service';
import { TournamentOperationsStaffService } from './tournament-operations-staff.service';

const tournamentId = '00000000-0000-4000-8000-000000000001';
const targetUserId = '00000000-0000-4000-8000-000000000002';
const fieldId = '00000000-0000-4000-8000-000000000003';
const fixtureId = '00000000-0000-4000-8000-000000000004';
const assignmentId = '00000000-0000-4000-8000-000000000005';
const actorUserId = 'actor-1';

const audit = (requestId: string) => ({ requestId, sourceIp: null });

async function buildHarness() {
  const bootstrapFirstDirector = jest.fn();
  const grantStaff = jest.fn().mockResolvedValue({ id: 'grant-1' });
  const revokeStaff = jest.fn().mockResolvedValue({
    id: assignmentId,
    tournamentId,
    userId: targetUserId,
    role: V1TournamentStaffRole.FIELD_OPERATOR,
    fieldId: null,
    fixtureIds: [],
    version: 2,
    expiresAt: null,
    revokedAt: new Date('2026-08-03T00:00:00.000Z'),
  });
  const count = jest.fn().mockResolvedValue(0);
  const operationAuditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });

  const prisma = {
    v1TournamentStaffAssignment: { count, findMany: jest.fn().mockResolvedValue([]) },
    v1OperationAudit: { create: operationAuditCreate },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      TournamentOperationsStaffService,
      { provide: PrismaService, useValue: prisma },
      { provide: TournamentStaffAccessService, useValue: { assertAccess: jest.fn() } },
      {
        provide: TournamentStaffService,
        useValue: { bootstrapFirstDirector, grantStaff, revokeStaff },
      },
    ],
  }).compile();

  return {
    service: moduleRef.get(TournamentOperationsStaffService),
    moduleRef,
    bootstrapFirstDirector,
    grantStaff,
    revokeStaff,
    count,
    operationAuditCreate,
  };
}

describe('TournamentOperationsStaffService', () => {
  // Finding #10 -- the first-director bootstrap path must reject an illegal
  // field scope explicitly instead of silently dropping it, with the same
  // STAFF_SCOPE_NOT_ALLOWED contract an ordinary director grant enforces.
  it('grant() rejects a director grant carrying a fieldId before bootstrapping', async () => {
    const { service, moduleRef, bootstrapFirstDirector, count } = await buildHarness();

    try {
      await expect(
        service.grant(
          actorUserId,
          tournamentId,
          { userId: targetUserId, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR, fieldId },
          audit('req-1'),
        ),
      ).rejects.toMatchObject({
        response: { code: 'STAFF_SCOPE_NOT_ALLOWED' },
      });

      expect(bootstrapFirstDirector).not.toHaveBeenCalled();
      // The illegal scope is rejected before even checking whether a
      // director already exists -- it must never depend on that state.
      expect(count).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('grant() rejects a director grant carrying fixtureIds before bootstrapping', async () => {
    const { service, moduleRef, bootstrapFirstDirector } = await buildHarness();

    try {
      await expect(
        service.grant(
          actorUserId,
          tournamentId,
          {
            userId: targetUserId,
            role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
            fixtureIds: [fixtureId],
          },
          audit('req-2'),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(bootstrapFirstDirector).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  it('grant() still bootstraps a scope-free director grant', async () => {
    const { service, moduleRef, bootstrapFirstDirector } = await buildHarness();

    try {
      await service.grant(
        actorUserId,
        tournamentId,
        { userId: targetUserId, role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR },
        audit('req-3'),
      );

      expect(bootstrapFirstDirector).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #11 / Task 18 review P1-3 -- a contract-required revoke `reason` must be persisted
  // somewhere the audit trail can show it, not silently discarded, AND it must be forwarded into
  // the SAME revokeStaff() transaction rather than written by a separate follow-up call from this
  // lane (which could commit the revoke while losing the reason if that follow-up write failed).
  // This lane no longer touches `prisma.v1OperationAudit` directly at all for revoke -- the real,
  // atomicity-proving regression test (that the reason lands in the SAME audit row as the revoke,
  // against a real database) lives in
  // test/tournaments/tournament-operations-board.integration-spec.ts, since a mocked
  // `TournamentStaffService` here cannot exercise real transaction atomicity.
  it('revoke() forwards the reason into TournamentStaffService.revokeStaff() instead of writing a separate follow-up audit row itself', async () => {
    const { service, moduleRef, revokeStaff, operationAuditCreate } = await buildHarness();

    try {
      await service.revoke(
        actorUserId,
        tournamentId,
        assignmentId,
        { expectedVersion: 1, reason: 'no longer needed' },
        audit('req-4'),
      );

      expect(revokeStaff).toHaveBeenCalledTimes(1);
      expect(revokeStaff).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId,
          tournamentId,
          assignmentId,
          expectedVersion: 1,
          reason: 'no longer needed',
        }),
      );
      // No separate, non-atomic follow-up write from this lane anymore.
      expect(operationAuditCreate).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });
});

// ── myAssignments() — "내 담당 대회" (마이페이지 진입점) ──────────────────────
type FakeAssignmentRow = {
  id: string;
  tournamentId: string;
  userId: string;
  role: V1TournamentStaffRole;
  fieldId: string | null;
  fieldName?: string | null;
  version: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  tournament: { title: string; status: V1TournamentStatus };
  fixtureScopes: { fixtureId: string }[];
};

/**
 * findMany()가 실제로 `where`를 평가하도록 흉내낸 fake -- 단순히
 * `toHaveBeenCalledWith`로 인자만 확인하면 서비스 코드에서 필터 조건 자체가 빠져도
 * (예: `revokedAt: null`을 실수로 지워도) 테스트는 여전히 통과한다. 이 fake는
 * `where.revokedAt`/`where.OR`를 행 단위로 실제 적용해서, 그 회귀가 나면 만료·해제된
 * 행이 결과에 섞여 들어와 테스트가 실패하게 만든다.
 */
function buildMyAssignmentsHarness(rows: FakeAssignmentRow[]) {
  const findMany = jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
    const now = new Date();
    return rows.filter((row) => {
      if (where.userId !== undefined && row.userId !== where.userId) return false;
      if (where.revokedAt === null && row.revokedAt !== null) return false;
      const orClauses = where.OR as Array<{ expiresAt?: null | { gt: Date } }> | undefined;
      if (orClauses) {
        const passes = orClauses.some((clause) => {
          if (clause.expiresAt === null) return row.expiresAt === null;
          if (clause.expiresAt && 'gt' in clause.expiresAt) {
            return row.expiresAt !== null && row.expiresAt.getTime() > clause.expiresAt.gt.getTime();
          }
          return false;
        });
        if (!passes) return false;
      }
      return true;
    }).map((row) => ({
      id: row.id,
      tournamentId: row.tournamentId,
      role: row.role,
      fieldId: row.fieldId,
      version: row.version,
      expiresAt: row.expiresAt,
      tournament: row.tournament,
      field: row.fieldId !== null ? { name: row.fieldName ?? null } : null,
      fixtureScopes: row.fixtureScopes,
    }));
  });

  const prisma = { v1TournamentStaffAssignment: { findMany, count: jest.fn() } };

  return {
    prisma,
    findMany,
    service: new TournamentOperationsStaffService(
      prisma as unknown as PrismaService,
      { assertAccess: jest.fn() } as unknown as TournamentStaffAccessService,
      {} as unknown as TournamentStaffService,
    ),
  };
}

function assignmentRow(overrides: Partial<FakeAssignmentRow> = {}): FakeAssignmentRow {
  return {
    id: 'assignment-1',
    tournamentId,
    userId: targetUserId,
    role: V1TournamentStaffRole.FIELD_OPERATOR,
    fieldId: null,
    version: 0,
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    tournament: { title: '성수 5인제 컵', status: 'open' },
    // 딥링크 진입 판정에 쓰는 담당 경기 스코프. 필드 단위 배정은 빈 배열이다.
    fixtureScopes: [],
    ...overrides,
  };
}

describe('TournamentOperationsStaffService.myAssignments', () => {
  it('담당 경기 스코프를 fixtureIds 로 실어 보낸다 (필드 담당자 딥링크 진입 판정의 유일한 근거)', async () => {
    const { service } = buildMyAssignmentsHarness([
      assignmentRow({ fixtureScopes: [{ fixtureId: 'fx-1' }, { fixtureId: 'fx-2' }] }),
    ]);

    const result = await service.myAssignments(targetUserId);

    // 이 값이 빠지면 필드 담당자는 자기 경기 콘솔로 갈 수 없다 — 대회 전역 리소스를 읽을
    // 권한이 없어 셸 진입이 구조적으로 막히므로 이 응답이 담당 경기를 아는 유일한 출처다.
    expect(result.items[0]?.assignments[0]?.fixtureIds).toEqual(['fx-1', 'fx-2']);
  });

  it('유효한 배정이 있는 사용자에게 그 대회가 반환된다', async () => {
    const { service } = buildMyAssignmentsHarness([assignmentRow()]);

    const result = await service.myAssignments(targetUserId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      tournamentId,
      tournamentTitle: '성수 5인제 컵',
      tournamentStatus: 'open',
    });
    expect(result.items[0].assignments).toHaveLength(1);
  });

  it('만료된 배정은 반환하지 않는다', async () => {
    const { service } = buildMyAssignmentsHarness([
      assignmentRow({ id: 'expired-1', expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);

    const result = await service.myAssignments(targetUserId);

    expect(result.items).toHaveLength(0);
  });

  it('해제(revoke)된 배정은 반환하지 않는다', async () => {
    const { service } = buildMyAssignmentsHarness([
      assignmentRow({ id: 'revoked-1', revokedAt: new Date('2026-07-01T00:00:00.000Z') }),
    ]);

    const result = await service.myAssignments(targetUserId);

    expect(result.items).toHaveLength(0);
  });

  it('배정이 없는 사용자에게는 빈 목록이 온다', async () => {
    const { service } = buildMyAssignmentsHarness([]);

    const result = await service.myAssignments(targetUserId);

    expect(result.items).toEqual([]);
  });

  it('같은 대회에 여러 배정이 있어도 대회당 하나로 묶여 중복 없이 표현된다', async () => {
    const fieldA = '00000000-0000-4000-8000-0000000000a1';
    const fieldB = '00000000-0000-4000-8000-0000000000a2';
    const { service } = buildMyAssignmentsHarness([
      assignmentRow({ id: 'a1', fieldId: fieldA, fieldName: 'A구장', createdAt: new Date('2026-08-01T00:00:00.000Z') }),
      assignmentRow({ id: 'a2', fieldId: fieldB, fieldName: 'B구장', createdAt: new Date('2026-08-02T00:00:00.000Z') }),
    ]);

    const result = await service.myAssignments(targetUserId);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].assignments.map((assignment) => assignment.fieldName).sort()).toEqual([
      'A구장',
      'B구장',
    ]);
  });

  it('진행 중인 대회를 먼저 보여준다 (상태 정렬)', async () => {
    const otherTournamentId = '00000000-0000-4000-8000-000000000099';
    const { service } = buildMyAssignmentsHarness([
      assignmentRow({ id: 'a1', tournament: { title: '모집 중 대회', status: 'open' } }),
      assignmentRow({
        id: 'a2',
        tournamentId: otherTournamentId,
        tournament: { title: '진행 중 대회', status: 'in_progress' },
      }),
    ]);

    const result = await service.myAssignments(targetUserId);

    expect(result.items.map((item) => item.tournamentStatus)).toEqual(['in_progress', 'open']);
  });
});
