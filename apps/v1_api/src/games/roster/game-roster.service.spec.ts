import type { PrismaService } from '../../prisma/prisma.service';
import type { GamesService } from '../games.service';
import { GameRosterService } from './game-roster.service';

// 조정 행은 조정한 때의 사이드 팀(teamId)에 묶인다. 사이드 팀이 바뀐 뒤 옛 팀 기록이 새 팀에 새지 않는지,
// 인가 뒤 팀이 바뀌면 쓰지 않는지를 본다. DB 경로 전체는 test/games/game-roster-adjustments 통합 스펙.
const TARGET = { gameId: 'game-1', sideId: 'side-1' };
const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));

interface AdjustmentRow {
  id: string;
  teamId: string;
  userId: string;
  reason: string | null;
  actorUserId: string;
  actorRole: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  revokedByRole: string | null;
}

function fakeTx(input: { sideTeamId: string; adjustments: AdjustmentRow[] }) {
  const tx = {
    v1Game: {
      findUnique: jest.fn(async () => ({
        sourceType: 'TEAM_MATCH',
        teamMatch: { deletedAt: null, tournamentId: 'cup', leagueId: null },
        sides: [{ teamId: input.sideTeamId }],
      })),
    },
    v1GameSide: { findUnique: jest.fn(async () => ({ teamId: input.sideTeamId })) },
    v1TeamMembership: { findUnique: jest.fn(async () => ({ role: 'owner', status: 'active' })) },
    v1GameRosterAdjustment: {
      findMany: jest.fn(async ({ where }: { where: { teamId?: string } }) =>
        input.adjustments.filter((row) => where.teamId === undefined || row.teamId === where.teamId),
      ),
      findFirst: jest.fn(async ({ where }: { where: { teamId?: string; userId: string } }) =>
        input.adjustments.find(
          (row) => row.revokedAt === null && row.userId === where.userId && (where.teamId === undefined || row.teamId === where.teamId),
        ) ?? null,
      ),
      update: jest.fn(async () => ({})),
    },
    v1User: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, profile: { nickname: `닉-${id}`, displayName: null } })),
      ),
    },
  };
  const prisma = { $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)) };
  const service = new GameRosterService(prisma as unknown as PrismaService, {} as GamesService);
  return { service, tx };
}

const row = (overrides: Partial<AdjustmentRow> & Pick<AdjustmentRow, 'id' | 'teamId' | 'userId'>): AdjustmentRow => ({
  reason: 'INJURY',
  actorUserId: 'mgr',
  actorRole: 'TEAM_MANAGER',
  createdAt: at(0),
  revokedAt: null,
  revokedByUserId: null,
  revokedByRole: null,
  ...overrides,
});
const USER = { id: 'viewer', email: 'viewer@example.test', accountStatus: 'active', onboardingStatus: 'completed' } as const;

describe('GameRosterService.listAdjustments — 지금 사이드 팀의 기록만', () => {
  it('옛 팀(A)의 선수·사유는 새 팀(C)에 싣지 않고, 되돌린 사람 역할과 시스템 되돌리기를 싣는다', async () => {
    const { service } = fakeTx({
      sideTeamId: 'team-C',
      adjustments: [
        row({ id: 'old', teamId: 'team-A', userId: 'a1', revokedAt: at(5), revokedByRole: 'SYSTEM' }),
        row({ id: 'c-admin', teamId: 'team-C', userId: 'c1', createdAt: at(10), revokedAt: at(20), revokedByUserId: 'ops', revokedByRole: 'ADMIN' }),
        row({ id: 'c-system', teamId: 'team-C', userId: 'c2', createdAt: at(11), revokedAt: at(30), revokedByRole: 'SYSTEM' }),
      ],
    });
    const history = await service.listAdjustments(USER, TARGET);
    expect(history.teamId).toBe('team-C');
    expect(history.events.map((event) => [event.type, event.userId, event.actor.userId, event.actor.role, event.actor.displayName])).toEqual([
      ['EXCLUDE', 'c1', 'mgr', 'TEAM_MANAGER', '닉-mgr'],
      ['EXCLUDE', 'c2', 'mgr', 'TEAM_MANAGER', '닉-mgr'],
      ['REVOKE', 'c1', 'ops', 'ADMIN', '닉-ops'],
      ['REVOKE', 'c2', null, 'SYSTEM', '시스템'],
    ]);
  });
});

describe('GameRosterService.applyRevoke — 사이드 팀 기준', () => {
  const actor = { userId: 'staff-1', role: 'STAFF' as const };

  it('되돌린 사람과 역할을 남기고, 그 팀의 활성 조정만 찾는다', async () => {
    const { service, tx } = fakeTx({
      sideTeamId: 'team-A',
      adjustments: [row({ id: 'b-active', teamId: 'team-B', userId: 'p1' }), row({ id: 'a-active', teamId: 'team-A', userId: 'p1' })],
    });
    await expect(service.applyRevoke(tx as never, actor, { ...TARGET, teamId: 'team-A' }, 'p1')).resolves.toEqual({ alreadyApplied: false });
    expect(tx.v1GameRosterAdjustment.update).toHaveBeenCalledWith({
      where: { id: 'a-active' },
      data: { revokedAt: expect.any(Date), revokedByUserId: 'staff-1', revokedByRole: 'STAFF' },
    });
  });

  it('인가 뒤 사이드 팀이 바뀌었으면 409 이고 쓰지 않는다', async () => {
    const { service, tx } = fakeTx({ sideTeamId: 'team-B', adjustments: [row({ id: 'a-active', teamId: 'team-A', userId: 'p1' })] });
    await expect(service.applyRevoke(tx as never, actor, { ...TARGET, teamId: 'team-A' }, 'p1')).rejects.toMatchObject({
      status: 409,
      response: { code: 'COMMAND_CONCURRENCY_CONFLICT' },
    });
    expect(tx.v1GameRosterAdjustment.update).not.toHaveBeenCalled();
  });
});
