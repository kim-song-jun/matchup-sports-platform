import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { GamesService } from '../games/games.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueMatchAdminService } from './league-match-admin.service';

// 상태 변경 버튼 하나로 모은 리그 상태 전이 규칙(보류·해제·종료·되돌리기·시작·준비 중).

type Row = Record<string, unknown> & { status: string };

function setup(league: Partial<Row> = {}, opts: { startedGames?: number } = {}) {
  const row: Row = {
    id: 'league-1',
    kind: 'regular_league',
    deletedAt: null,
    isPublic: true,
    status: 'in_progress',
    heldFromStatus: null,
    ...league,
  };
  const logAdminAction = jest.fn();
  const tx = {
    $queryRaw: jest.fn(async () => []),
    v1Tournament: {
      findFirst: jest.fn(async () => ({ ...row })),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const status = where.status as string | { in: string[] } | undefined;
        if (typeof status === 'string' && row.status !== status) return { count: 0 };
        if (status && typeof status === 'object' && !status.in.includes(row.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    v1Game: { count: jest.fn(async () => opts.startedGames ?? 0) },
  };
  const prisma = {
    ...tx,
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx),
  };
  const service = new LeagueMatchAdminService(
    prisma as unknown as PrismaService,
    { getMutationAdmin: async () => ({ userId: 'admin-1' }), logAdminAction } as unknown as AdminContextService,
    {} as GamesService,
    {} as NotificationsService,
  );
  return { service, row, logAdminAction };
}

const admin = { id: 'admin-1' } as V1AuthUser;

describe('LeagueMatchAdminService.changeState', () => {
  it('모집 마감 리그를 운영자가 진행 중으로 시작한다', async () => {
    const { service, row } = setup({ status: 'closed' });
    await expect(service.changeState(admin, 'league-1', { state: 'active' }))
      .resolves.toEqual({ leagueId: 'league-1', state: 'active', alreadyProcessed: false });
    expect(row.status).toBe('in_progress');
  });

  it('시작한 경기가 없으면 진행 중을 준비 중으로 돌리고, 있으면 막는다', async () => {
    const ok = setup({ status: 'in_progress' });
    await expect(ok.service.changeState(admin, 'league-1', { state: 'draft' })).resolves.toMatchObject({ state: 'draft' });
    expect(ok.row.status).toBe('draft');

    const blocked = setup({ status: 'in_progress' }, { startedGames: 1 });
    await expect(blocked.service.changeState(admin, 'league-1', { state: 'draft' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_HAS_STARTED_GAMES' } });
    expect(blocked.row.status).toBe('in_progress');
  });

  it('보류는 사유가 있어야 하고, 보류 중에는 보류 전 상태로만 돌아간다', async () => {
    const active = setup({ status: 'in_progress' });
    await expect(active.service.changeState(admin, 'league-1', { state: 'on_hold' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_REASON_REQUIRED' } });
    await expect(active.service.changeState(admin, 'league-1', { state: 'on_hold', reason: '구장 공사' }))
      .resolves.toMatchObject({ state: 'on_hold' });

    const held = setup({ status: 'on_hold', isPublic: false, heldFromStatus: 'in_progress', heldFromPublic: true });
    await expect(held.service.changeState(admin, 'league-1', { state: 'draft' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_ON_HOLD' } });
  });

  it('종료된 리그는 바로 준비 중으로 못 돌리고, 같은 상태면 멱등하다', async () => {
    const { service } = setup({ status: 'completed' });
    await expect(service.changeState(admin, 'league-1', { state: 'draft' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_NOT_ACTIVE' } });
    await expect(service.changeState(admin, 'league-1', { state: 'completed' }))
      .resolves.toEqual({ leagueId: 'league-1', state: 'completed', alreadyProcessed: true });
  });
});
