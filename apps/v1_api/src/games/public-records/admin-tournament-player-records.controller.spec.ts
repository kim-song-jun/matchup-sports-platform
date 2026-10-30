import { AdminContextService } from '../../common/admin-context.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdminTournamentPlayerRecordsController } from './admin-tournament-player-records.controller';
import type { PublicTournamentRecordsService } from './public-tournament-records.service';

function setup(admin = false) {
  const prisma = {
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(admin ? {
      id: 'admin', userId: 'user', adminRole: 'ops', status: 'active', user: { accountStatus: 'active' },
    } : null) },
    v1TournamentStaffAssignment: { findFirst: jest.fn(async ({ where }) =>
      where.userId === 'user' && where.tournamentId === 'assigned'
        ? { id: 'grant', tournamentId: 'assigned', version: 1 } : null) },
  };
  const records = { getPlayerRecordsForAdmin: jest.fn().mockResolvedValue({ goals: [], assists: [] }) };
  const controller = new AdminTournamentPlayerRecordsController(
    records as unknown as PublicTournamentRecordsService,
    new AdminContextService(prisma as unknown as PrismaService),
  );
  return { controller, records };
}

describe('관리 수상 추천의 대회 범위 권한', () => {
  const user: V1AuthUser = { id: 'user', email: 'fixture@example.test', accountStatus: 'active', onboardingStatus: 'completed' };

  it('플랫폼 관리자 계정이 없는 디렉터도 담당 대회의 추천 기록을 읽는다', async () => {
    const { controller } = setup();
    await expect(controller.getPlayerRecords(user, 'assigned')).resolves.toEqual({ goals: [], assists: [] });
  });

  it('다른 대회의 추천 기록은 조회 전에 거부한다', async () => {
    const { controller, records } = setup();
    await expect(controller.getPlayerRecords(user, 'foreign')).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(records.getPlayerRecordsForAdmin).not.toHaveBeenCalled();
  });

  it('기존 플랫폼 관리자는 배정 없이 조회한다', async () => {
    const { controller } = setup(true);
    await expect(controller.getPlayerRecords(user, 'foreign')).resolves.toEqual({ goals: [], assists: [] });
  });
});
