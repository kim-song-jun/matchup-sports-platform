import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { GamesService } from '../games/games.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueMatchAdminService } from './league-match-admin.service';

describe('LeagueMatchAdminService.holdLeague — 공개 변경 경쟁', () => {
  it('조회 뒤 비공개 전환이 완료되면 이전 공개값을 복원값으로 저장하지 않는다', async () => {
    const row = {
      id: 'league-1', kind: 'regular_league', status: 'in_progress',
      isPublic: true, deletedAt: null, heldFromStatus: null, heldFromPublic: null,
    };
    const logAdminAction = jest.fn();
    const tx = {
      v1Tournament: {
        findFirst: jest.fn(async () => {
          const snapshot = { ...row };
          // 다른 관리자의 비공개 PATCH가 조회와 보류 UPDATE 사이에 커밋된다.
          row.isPublic = false;
          return snapshot;
        }),
        updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<typeof row> }) => {
          const matches = Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value);
          if (!matches) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
      },
    };
    const service = new LeagueMatchAdminService(
      { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaService,
      { getMutationAdmin: async () => ({ userId: 'admin-1' }), logAdminAction } as unknown as AdminContextService,
      {} as GamesService,
      {} as NotificationsService,
    );
    await expect(service.holdLeague({ id: 'admin-1' } as V1AuthUser, row.id, { reason: '일시 보류' }))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_STATE_CHANGED' } });
    expect(row).toMatchObject({ status: 'in_progress', isPublic: false, heldFromStatus: null, heldFromPublic: null });
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
