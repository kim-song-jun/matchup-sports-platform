/**
 * 팀 상세 "참가 중인 대회·리그"(Task 180 R-1 B) — 누가 보는지, 무엇이 담기는지, 명단 수정 가능 여부가
 * 명단 수정 API(assertRosterMutable)와 같은 판정인지.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { TeamCompetitionEntriesService } from './team-competition-entries.service';

const NOW = new Date('2026-10-01T00:00:00.000Z');
const viewer = { id: 'user-1', email: 'u@teameet.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };

type Row = {
  id: string;
  status: string;
  rosterLockedAt: Date | null;
  rosterDeadlineOverrideAt: Date | null;
  tournament: {
    id: string;
    title: string;
    kind: 'regular_tournament' | 'regular_league' | null;
    status: string;
    scheduledAt: Date | null;
    scheduledEndAt: Date | null;
    rosterDeadlineAt: Date | null;
  };
};

function row(id: string, tournament: Partial<Row['tournament']> = {}, extra: Partial<Row> = {}): Row {
  return {
    id,
    status: 'confirmed',
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    tournament: {
      id: `t-${id}`,
      title: `대회 ${id}`,
      kind: 'regular_tournament',
      status: 'in_progress',
      scheduledAt: new Date('2026-10-10T00:00:00.000Z'),
      scheduledEndAt: new Date('2026-10-20T00:00:00.000Z'),
      rosterDeadlineAt: null,
      ...tournament,
    },
    ...extra,
  };
}

function setup({ team = true, role = 'member' as string | null, rows = [] as Row[], counts = {} as Record<string, number> } = {}) {
  const prisma = {
    v1Team: { findFirst: jest.fn().mockResolvedValue(team ? { id: 'team-1' } : null) },
    v1TeamMembership: { findFirst: jest.fn().mockResolvedValue(role === null ? null : { role }) },
    v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue(rows) },
    v1TournamentPlayer: {
      groupBy: jest.fn().mockResolvedValue(
        Object.entries(counts).map(([registrationId, n]) => ({ registrationId, _count: { registrationId: n } })),
      ),
    },
  };
  return { prisma, service: new TeamCompetitionEntriesService(prisma as unknown as PrismaService) };
}

describe('TeamCompetitionEntriesService', () => {
  it('팀원이 아니면 403 이고 신청을 읽지도 않는다 — 신청 상태·id 는 팀 내부 정보다', async () => {
    const { prisma, service } = setup({ role: null, rows: [row('a')] });
    await expect(service.list(viewer, 'team-1', NOW)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list(viewer, 'team-1', NOW)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.v1TournamentRegistration.findMany).not.toHaveBeenCalled();
    expect(prisma.v1TeamMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teamId: 'team-1', userId: 'user-1', status: 'active' } }),
    );
  });

  it('없는 팀은 404', async () => {
    const { service } = setup({ team: false });
    await expect(service.list(viewer, 'team-x', NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('팀원에게 대회·리그를 함께 주고, 팀장·매니저 여부를 알려 준다', async () => {
    const rows = [
      row('league', { kind: 'regular_league', status: 'draft', title: 'QA 0930 test' }),
      row('cup', { title: '명단 재현 대회' }),
    ];
    const member = await setup({ role: 'member', rows, counts: { league: 10, cup: 6 } }).service.list(viewer, 'team-1', NOW);
    expect(member.viewerCanManageRoster).toBe(false);
    expect(member.items.map((item) => [item.competitionKind, item.title, item.playerCount])).toEqual(
      expect.arrayContaining([
        ['regular_league', 'QA 0930 test', 10],
        ['regular_tournament', '명단 재현 대회', 6],
      ]),
    );
    expect(member.items.find((item) => item.registrationId === 'league')).toMatchObject({
      competitionId: 't-league',
      registrationStatus: 'confirmed',
      // 초안 리그는 명단을 받는 중이다(명단 수정 API 와 같은 규칙).
      rosterEditable: true,
      rosterBlockedBy: null,
    });
    for (const role of ['owner', 'manager']) {
      expect((await setup({ role, rows }).service.list(viewer, 'team-1', NOW)).viewerCanManageRoster).toBe(true);
    }
  });

  it('취소된 신청은 빼고, 종료·취소된 대회는 맨 아래(최근에 끝난 순)에 둔다', async () => {
    const rows = [
      row('old', { status: 'completed', scheduledEndAt: new Date('2026-05-01T00:00:00.000Z') }),
      row('later', { scheduledAt: new Date('2026-11-01T00:00:00.000Z') }),
      row('gone', {}, { status: 'cancelled' }),
      row('recent', { status: 'completed', scheduledEndAt: new Date('2026-09-01T00:00:00.000Z') }),
      row('soon', { scheduledAt: new Date('2026-10-05T00:00:00.000Z') }),
    ];
    const result = await setup({ rows }).service.list(viewer, 'team-1', NOW);
    expect(result.items.map((item) => item.registrationId)).toEqual(['soon', 'later', 'recent', 'old']);
    expect(result.items.find((item) => item.registrationId === 'old')).toMatchObject({
      rosterEditable: false,
      rosterBlockedBy: 'closed',
    });
  });

  it('명단 수정 가능 여부는 명단 수정 API 와 같은 판정이다 — 잠금·취소 요청·제출 마감·운영진 예외', async () => {
    const past = new Date('2026-09-26T14:59:00.000Z');
    const rows = [
      row('locked', {}, { rosterLockedAt: new Date('2026-09-20T00:00:00.000Z') }),
      row('cancelling', {}, { status: 'cancel_requested' }),
      row('deadline', { rosterDeadlineAt: past }),
      row('override', { rosterDeadlineAt: past }, { rosterDeadlineOverrideAt: new Date('2026-09-27T00:00:00.000Z') }),
      row('before', { rosterDeadlineAt: new Date('2026-10-08T14:59:00.000Z') }),
      row('draftCup', { status: 'draft' }),
    ];
    const result = await setup({ rows }).service.list(viewer, 'team-1', NOW);
    const blockedBy = Object.fromEntries(result.items.map((item) => [item.registrationId, item.rosterBlockedBy]));
    expect(blockedBy).toEqual({
      locked: 'locked',
      cancelling: 'cancelled',
      deadline: 'deadline',
      override: null,
      before: null,
      draftCup: 'closed',
    });
    expect(result.items.filter((item) => item.rosterEditable).map((item) => item.registrationId).sort()).toEqual([
      'before',
      'override',
    ]);
  });
});
