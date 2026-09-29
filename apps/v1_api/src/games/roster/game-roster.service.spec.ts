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

describe('GameRosterService.getTeamGameRoster — 팀·경기로 사이드 찾기', () => {
  interface Side {
    id: string;
    teamId: string | null;
  }
  type Operator = { role: string; canMutateLineup: boolean; platformAdmin: boolean };

  function teamGameFake(input: {
    game?: 'missing' | 'friendly';
    memberships?: Record<string, 'owner' | 'manager' | 'member'>;
    operators?: Record<string, Operator>;
    afterFirstGameRead?: (sides: Side[]) => void;
  }) {
    const sides: Side[] = [
      { id: 'side-home', teamId: 'team-A' },
      { id: 'side-away', teamId: 'team-B' },
    ];
    const teamMatch = {
      deletedAt: null,
      tournamentId: input.game === 'friendly' ? null : 'cup',
      leagueId: null,
      hostTeamId: 'team-A',
      hostTeam: { name: 'A팀' },
      approvedApplicantTeam: { name: 'B팀' },
    };
    let reads = 0;
    const tx = {
      v1Game: {
        findUnique: jest.fn(async ({ select }: { select: { sides: { where: Partial<Side> } } }) => {
          if (input.game === 'missing') return null;
          const where = select.sides.where;
          const matched = sides.filter((side) =>
            Object.entries(where).every(([key, value]) => side[key as keyof Side] === value),
          );
          const result = { sourceType: 'TEAM_MATCH', teamMatch, sides: matched.map((side) => ({ ...side })) };
          reads += 1;
          if (reads === 1) input.afterFirstGameRead?.(sides);
          return result;
        }),
      },
      v1TeamMembership: {
        findUnique: jest.fn(async ({ where }: { where: { teamId_userId: { teamId: string; userId: string } } }) => {
          const role = input.memberships?.[`${where.teamId_userId.teamId}:${where.teamId_userId.userId}`];
          return role === undefined ? null : { role, status: 'active' };
        }),
      },
    };
    const prisma = { $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)) };
    const games = {
      resolveCompetitionOperator: jest.fn(async (_tx: unknown, _gameId: string, userId: string) => input.operators?.[userId] ?? null),
    };
    const service = new GameRosterService(prisma as unknown as PrismaService, games as unknown as GamesService);
    // 계산·본문은 getRoster 와 같은 readView 다(통합 스펙이 두 경로 본문이 같음을 본다). 여기선 넘겨받은 사이드·권한을 본다.
    const readView = jest
      .spyOn(service as unknown as { readView: (...args: unknown[]) => Promise<unknown> }, 'readView')
      .mockImplementation(async (_tx, target, access) => ({ ...(target as object), ...(access as object) }));
    return { service, readView };
  }
  const viewer = (id: string) => ({ ...USER, id });

  it('경로의 팀이 뛰는 사이드를 읽고, 그 팀 기준 상대 팀 이름을 붙인다(홈·원정 양쪽)', async () => {
    const { service, readView } = teamGameFake({ memberships: { 'team-A:a-owner': 'owner', 'team-B:b-member': 'member' } });
    const home = await service.getTeamGameRoster(viewer('a-owner'), { teamId: 'team-A', gameId: 'game-1' });
    const away = await service.getTeamGameRoster(viewer('b-member'), { teamId: 'team-B', gameId: 'game-1' });
    expect(readView.mock.calls.map((call) => call[1])).toEqual([
      { gameId: 'game-1', sideId: 'side-home' },
      { gameId: 'game-1', sideId: 'side-away' },
    ]);
    expect(home).toMatchObject({ sideId: 'side-home', viewerRole: 'TEAM_MANAGER', writeRole: 'TEAM_MANAGER', opponentName: 'B팀' });
    expect(away).toMatchObject({ sideId: 'side-away', viewerRole: 'TEAM_MEMBER', writeRole: null, opponentName: 'A팀' });
  });

  it('권한은 경기 명단 GET 과 같다 — 상대팀 팀장·외부인은 403, support 어드민은 읽기만', async () => {
    const { service, readView } = teamGameFake({
      memberships: { 'team-B:b-owner': 'owner' },
      operators: { support: { role: 'support_readonly', canMutateLineup: false, platformAdmin: true } },
    });
    for (const id of ['b-owner', 'outsider']) {
      await expect(service.getTeamGameRoster(viewer(id), { teamId: 'team-A', gameId: 'game-1' })).rejects.toMatchObject({
        status: 403,
        response: { code: 'PERMISSION_DENIED' },
      });
    }
    expect(readView).not.toHaveBeenCalled();
    await expect(service.getTeamGameRoster(viewer('support'), { teamId: 'team-A', gameId: 'game-1' })).resolves.toMatchObject({
      viewerRole: 'ADMIN',
      writeRole: null,
    });
  });

  it('그 경기 사이드가 아닌 팀·친선은 404 GAME_ROSTER_NOT_AVAILABLE, 없는 경기는 404 GAME_NOT_FOUND', async () => {
    const memberships = { 'team-C:c-owner': 'owner', 'team-A:a-owner': 'owner' } as const;
    const cases = [
      [teamGameFake({ memberships }), 'team-C', 'c-owner', 'GAME_ROSTER_NOT_AVAILABLE'],
      [teamGameFake({ memberships, game: 'friendly' }), 'team-A', 'a-owner', 'GAME_ROSTER_NOT_AVAILABLE'],
      [teamGameFake({ memberships, game: 'missing' }), 'team-A', 'a-owner', 'GAME_NOT_FOUND'],
    ] as const;
    for (const [fake, teamId, userId, code] of cases) {
      await expect(fake.service.getTeamGameRoster(viewer(userId), { teamId, gameId: 'game-1' })).rejects.toMatchObject({
        status: 404,
        response: { code },
      });
      expect(fake.readView).not.toHaveBeenCalled();
    }
  });

  it('찾은 뒤 인가하는 사이 사이드 팀이 바뀌면 새 팀 명단을 이 팀 경로로 주지 않는다', async () => {
    const { service, readView } = teamGameFake({
      operators: { ops: { role: 'platform_ops', canMutateLineup: true, platformAdmin: true } },
      afterFirstGameRead: (sides) => {
        sides[0]!.teamId = 'team-C';
      },
    });
    await expect(service.getTeamGameRoster(viewer('ops'), { teamId: 'team-A', gameId: 'game-1' })).rejects.toMatchObject({
      status: 404,
      response: { code: 'GAME_ROSTER_NOT_AVAILABLE' },
    });
    expect(readView).not.toHaveBeenCalled();
  });
});
