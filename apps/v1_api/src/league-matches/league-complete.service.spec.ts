import type { V1AuthUser } from '../auth/v1-auth-user';
import type { AdminContextService } from '../common/admin-context.service';
import type { GamesService } from '../games/games.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PrismaService } from '../prisma/prisma.service';
import { LeagueMatchAdminService } from './league-match-admin.service';

// MD-QA #93: '진행 중으로 되돌리기'·'보류 해제' 뒤 남은 대진이 없으면 자동 종료 판정이 다시 불리지
// 않아 리그가 진행 중으로 남았다. 수동 종료와 보류 해제 시 재판정을 같은 `settle` 조건으로 검증한다.

type FixtureRow = { status: string; game: { currentOfficialRevision: { state: string } | null } | null };

type LeagueRow = { id: string; kind: string; deletedAt: null; isPublic: boolean; status: string } & Record<string, unknown>;

function setup(league: { status: string } & Record<string, unknown>, fixtures: FixtureRow[]) {
  const row: LeagueRow = { id: 'league-1', kind: 'regular_league', deletedAt: null, isPublic: true, ...league };
  const statusLogs: unknown[] = [];
  const logAdminAction = jest.fn();
  const tx = {
    v1Tournament: {
      findFirst: jest.fn(async () => ({ ...row })),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const matches = Object.entries(where).every(([key, value]) => row[key] === value);
        if (!matches) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    v1TeamMatch: { findMany: jest.fn(async () => fixtures) },
    v1StatusChangeLog: { create: jest.fn(async ({ data }: { data: unknown }) => statusLogs.push(data)) },
    $queryRaw: jest.fn(async () => []),
  };
  const service = new LeagueMatchAdminService(
    { $transaction: async (run: (client: typeof tx) => Promise<unknown>) => run(tx) } as unknown as PrismaService,
    { getMutationAdmin: async () => ({ userId: 'admin-1' }), logAdminAction } as unknown as AdminContextService,
    {} as GamesService,
    {} as NotificationsService,
  );
  return { service, row, logAdminAction, statusLogs };
}

const official = (status = 'completed'): FixtureRow => ({ status, game: { currentOfficialRevision: { state: 'OFFICIAL' } } });
const cancelled: FixtureRow = { status: 'cancelled', game: null };
const pending: FixtureRow = { status: 'matched', game: { currentOfficialRevision: null } };
const admin = { id: 'admin-1' } as V1AuthUser;

describe('LeagueMatchAdminService.completeLeague', () => {
  it('취소를 뺀 전 대진이 공식 결과면 진행 중 리그를 종료하고 감사 로그를 남긴다', async () => {
    const { service, row, logAdminAction, statusLogs } = setup({ status: 'in_progress' }, [official(), official(), cancelled]);
    await expect(service.completeLeague(admin, 'league-1', { reason: '추가 경기 없음' }))
      .resolves.toEqual({ leagueId: 'league-1', state: 'completed', alreadyProcessed: false });
    expect(row.status).toBe('completed');
    expect(statusLogs).toEqual([expect.objectContaining({ toStatus: 'completed', reason: 'admin_completed' })]);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'league_match.complete', reason: '추가 경기 없음' }),
      expect.anything(),
    );
  });

  it('결과가 없는 대진이 남아 있으면 409 로 막고 상태를 바꾸지 않는다', async () => {
    const { service, row, logAdminAction } = setup({ status: 'in_progress' }, [official(), pending]);
    await expect(service.completeLeague(admin, 'league-1', {}))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_FIXTURES_PENDING' } });
    expect(row.status).toBe('in_progress');
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('조회 뒤 다른 관리자가 먼저 종료했으면 남은 경기 오류 대신 alreadyProcessed 를 돌려준다', async () => {
    const { service, row, logAdminAction } = setup({ status: 'in_progress' }, [official()]);
    // 첫 조회(서비스)·settle 조회는 진행 중으로 보이고, 그 사이 다른 트랜잭션이 종료를 커밋한다.
    const reads = [{ ...row }, { ...row }];
    const findFirst = jest.fn(async () => reads.shift() ?? { ...row });
    (service as unknown as { prisma: { $transaction: (run: (tx: unknown) => Promise<unknown>) => Promise<unknown> } }).prisma = {
      $transaction: async (run) =>
        run({
          v1Tournament: {
            findFirst,
            updateMany: jest.fn(async () => {
              row.status = 'completed';
              return { count: 0 };
            }),
          },
          v1TeamMatch: { findMany: jest.fn(async () => [official()]) },
          v1StatusChangeLog: { create: jest.fn() },
          $queryRaw: jest.fn(async () => []),
        }),
    };
    await expect(service.completeLeague(admin, 'league-1', {}))
      .resolves.toEqual({ leagueId: 'league-1', state: 'completed', alreadyProcessed: true });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('이미 종료된 리그는 멱등하게 alreadyProcessed 를 돌려준다', async () => {
    const { service, logAdminAction } = setup({ status: 'completed' }, [official()]);
    await expect(service.completeLeague(admin, 'league-1', {}))
      .resolves.toEqual({ leagueId: 'league-1', state: 'completed', alreadyProcessed: true });
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('진행 중이 아닌 리그(준비 중·보류)는 종료할 수 없다', async () => {
    const { service } = setup({ status: 'on_hold' }, [official()]);
    await expect(service.completeLeague(admin, 'league-1', {}))
      .rejects.toMatchObject({ response: { code: 'LEAGUE_NOT_ACTIVE' } });
  });
});

describe('LeagueMatchAdminService.resumeLeague — 보류 해제 시 종료 재판정', () => {
  it('진행 중으로 돌아갈 때 남은 대진이 없으면 바로 종료된다', async () => {
    const { service, row } = setup(
      { status: 'on_hold', isPublic: false, heldFromStatus: 'in_progress', heldFromPublic: true },
      [official(), cancelled],
    );
    await expect(service.resumeLeague(admin, 'league-1', { reason: '재개' }))
      .resolves.toMatchObject({ state: 'completed', isPublic: true, alreadyProcessed: false });
    expect(row.status).toBe('completed');
  });

  it('결과를 기다리는 대진이 있으면 진행 중으로만 돌아간다', async () => {
    const { service, row } = setup(
      { status: 'on_hold', isPublic: false, heldFromStatus: 'in_progress', heldFromPublic: true },
      [official(), pending],
    );
    await expect(service.resumeLeague(admin, 'league-1', { reason: '재개' }))
      .resolves.toMatchObject({ state: 'active' });
    expect(row.status).toBe('in_progress');
  });

  it('준비 중으로 돌아가는 리그는 종료 판정을 하지 않는다', async () => {
    const { service, row } = setup(
      { status: 'on_hold', isPublic: false, heldFromStatus: 'draft', heldFromPublic: true },
      [],
    );
    await expect(service.resumeLeague(admin, 'league-1', { reason: '재개' }))
      .resolves.toMatchObject({ state: 'draft' });
    expect(row.status).toBe('draft');
  });
});
