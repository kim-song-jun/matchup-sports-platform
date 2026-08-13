import { Test } from '@nestjs/testing';
import { V1TournamentStaffRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decideTournamentStaffAccess } from '../../tournaments/staff/tournament-staff-policy';
import {
  MyTournamentStaffAssignmentsService,
  MY_ASSIGNMENT_FIXTURE_LIMIT,
} from './my-tournament-staff-assignments.service';

const meUserId = '00000000-0000-4000-8000-0000000000a1';
const tournamentId = '00000000-0000-4000-8000-000000000001';
const otherTournamentId = '00000000-0000-4000-8000-000000000002';
const fieldId = '00000000-0000-4000-8000-000000000010';
const otherFieldId = '00000000-0000-4000-8000-000000000011';
const fixtureOnMyField = '00000000-0000-4000-8000-000000000020';
const fixtureOnOtherField = '00000000-0000-4000-8000-000000000021';
const now = new Date('2026-08-13T00:00:00.000Z');

type AnyRecord = Record<string, unknown>;

function fixtureRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: fixtureOnMyField,
    tournamentId,
    round: 'GROUP',
    fixtureNumber: 3,
    legNumber: 1,
    scheduledAt: new Date('2026-08-14T02:00:00.000Z'),
    status: 'scheduled',
    fieldId,
    field: { name: 'A구장' },
    homeRegistration: { team: { name: '홈팀' } },
    awayRegistration: { team: { name: '원정팀' } },
    ...overrides,
  };
}

function assignmentRow(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: 'assignment-1',
    tournamentId,
    role: V1TournamentStaffRole.FIELD_OPERATOR,
    fieldId,
    version: 3,
    expiresAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    tournament: { title: '가을 풋살 대회', status: 'in_progress', scheduledAt: null },
    field: { name: 'A구장' },
    fixtureScopes: [],
    ...overrides,
  };
}

async function buildHarness(assignments: AnyRecord[], fixtures: AnyRecord[]) {
  const findManyAssignments = jest.fn().mockResolvedValue(assignments);
  const findManyFixtures = jest.fn().mockResolvedValue(fixtures);
  const moduleRef = await Test.createTestingModule({
    providers: [
      MyTournamentStaffAssignmentsService,
      {
        provide: PrismaService,
        useValue: {
          v1TournamentStaffAssignment: { findMany: findManyAssignments },
          v1TournamentFixture: { findMany: findManyFixtures },
        },
      },
    ],
  }).compile();
  return {
    service: moduleRef.get(MyTournamentStaffAssignmentsService),
    findManyAssignments,
    findManyFixtures,
  };
}

describe('MyTournamentStaffAssignmentsService', () => {
  it('본인 것만, 해제·만료되지 않은 배정만 조회한다', async () => {
    const { service, findManyAssignments } = await buildHarness([], []);

    await service.listMine(meUserId, now);

    expect(findManyAssignments).toHaveBeenCalledTimes(1);
    const where = findManyAssignments.mock.calls[0][0].where;
    // 다른 사람 배정을 지정할 입력 자체가 없다 — where.userId 는 인증 주체로 고정된다.
    expect(where.userId).toBe(meUserId);
    expect(where.revokedAt).toBeNull();
    expect(where.OR).toEqual([{ expiresAt: null }, { expiresAt: { gt: now } }]);
  });

  it('FIELD_OPERATOR 는 담당 경기 딥링크 식별자를 함께 받는다', async () => {
    const { service } = await buildHarness([assignmentRow()], [fixtureRow()]);

    const result = await service.listMine(meUserId, now);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item.role).toBe(V1TournamentStaffRole.FIELD_OPERATOR);
    expect(item.tournamentId).toBe(tournamentId);
    // 실시간 핸드셰이크(staleness 게이트)가 제시해야 하는 값 — 전역 스태프 목록을 읽을 수
    // 없는 필드 담당자에게는 이 응답이 유일한 출처다.
    expect(item.version).toBe(3);
    expect(item.fieldName).toBe('A구장');
    expect(item.fixtures).toEqual([
      {
        fixtureId: fixtureOnMyField,
        round: 'GROUP',
        fixtureNumber: 3,
        legNumber: 1,
        scheduledAt: new Date('2026-08-14T02:00:00.000Z'),
        status: 'scheduled',
        fieldId,
        fieldName: 'A구장',
        homeTeamName: '홈팀',
        awayTeamName: '원정팀',
      },
    ]);
    expect(item.fixturesTruncated).toBe(false);
  });

  it('필드 스코프 밖의 경기는 목록에서 제외한다(합쳐 읽은 결과를 배정별로 되돌릴 때)', async () => {
    const { service } = await buildHarness(
      [assignmentRow()],
      [
        fixtureRow(),
        fixtureRow({ id: fixtureOnOtherField, fieldId: otherFieldId, field: { name: 'B구장' } }),
        fixtureRow({ id: 'x', tournamentId: otherTournamentId }),
      ],
    );

    const result = await service.listMine(meUserId, now);

    expect(result.items[0].fixtures.map((fixture) => fixture.fixtureId)).toEqual([fixtureOnMyField]);
  });

  it('fixture 스코프와 field 스코프가 함께 있으면 둘 다 만족하는 경기만 남는다', async () => {
    const { service, findManyFixtures } = await buildHarness(
      [assignmentRow({ fixtureScopes: [{ fixtureId: fixtureOnMyField }] })],
      [fixtureRow(), fixtureRow({ id: fixtureOnOtherField, fieldId: otherFieldId, field: null })],
    );

    const result = await service.listMine(meUserId, now);

    expect(findManyFixtures.mock.calls[0][0].where.OR).toEqual([
      { tournamentId, id: { in: [fixtureOnMyField] }, fieldId },
    ]);
    expect(result.items[0].fixtures.map((fixture) => fixture.fixtureId)).toEqual([fixtureOnMyField]);
  });

  it('FIELD_OPERATOR 가 아닌 역할은 경기 질의 자체를 하지 않고 빈 배열을 받는다', async () => {
    const { service, findManyFixtures } = await buildHarness(
      [
        assignmentRow({
          id: 'assignment-director',
          role: V1TournamentStaffRole.TOURNAMENT_DIRECTOR,
          fieldId: null,
          field: null,
        }),
      ],
      [fixtureRow()],
    );

    const result = await service.listMine(meUserId, now);

    expect(findManyFixtures).not.toHaveBeenCalled();
    expect(result.items[0].fixtures).toEqual([]);
    expect(result.items[0].fieldName).toBeNull();
  });

  it('상한을 넘는 담당 경기는 잘라서 돌려주고 잘렸음을 알린다', async () => {
    const many = Array.from({ length: MY_ASSIGNMENT_FIXTURE_LIMIT + 3 }, (_unused, index) =>
      fixtureRow({ id: `00000000-0000-4000-8000-0000000${String(index).padStart(5, '0')}` }),
    );
    const { service } = await buildHarness([assignmentRow()], many);

    const result = await service.listMine(meUserId, now);

    expect(result.items[0].fixtures).toHaveLength(MY_ASSIGNMENT_FIXTURE_LIMIT);
    expect(result.items[0].fixturesTruncated).toBe(true);
  });

  /**
   * 목록이 권한 정책과 어긋나지 않는지 교차 검증한다 — 목록에 실린 경기는 정책상 실제로
   * 열 수 있어야 하고(통과해야 할 사람), 제외한 경기는 정책도 거부해야 한다(차단돼야 할
   * 경기). 이 서비스는 성능 때문에 정책 함수 대신 동등한 DB 조건을 쓰므로, 두 규칙이
   * 갈라지면 여기서 깨진다.
   */
  it('노출/제외 판정이 decideTournamentStaffAccess 와 일치한다', async () => {
    const { service } = await buildHarness(
      [assignmentRow()],
      [fixtureRow(), fixtureRow({ id: fixtureOnOtherField, fieldId: otherFieldId, field: null })],
    );
    const result = await service.listMine(meUserId, now);
    const listed = new Set(result.items[0].fixtures.map((fixture) => fixture.fixtureId));

    const assignment = {
      role: 'field_operator' as const,
      tournamentId,
      startsAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
      revokedAt: null,
      fixtureIds: [],
      fieldId,
    };
    const decideFor = (fixtureId: string, resourceFieldId: string) =>
      decideTournamentStaffAccess({
        role: 'field_operator',
        action: 'read',
        now: now.toISOString(),
        resource: { tournamentId, fixtureId, fieldId: resourceFieldId },
        assignment,
      });

    expect(listed.has(fixtureOnMyField)).toBe(true);
    expect(decideFor(fixtureOnMyField, fieldId).allowed).toBe(true);

    expect(listed.has(fixtureOnOtherField)).toBe(false);
    expect(decideFor(fixtureOnOtherField, otherFieldId)).toEqual({
      allowed: false,
      reason: 'FIELD_SCOPE_DENIED',
    });
  });
});
