import { PrismaService } from '../../prisma/prisma.service';
import { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import { TournamentSlotService } from './tournament-slot.service';

const user = { id: 'u-1', email: 'u@test.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const adminRow = (adminRole: 'owner' | 'ops' | 'support') => ({
  id: 'a-1', userId: 'u-1', adminRole, status: 'active' as const, user: { accountStatus: 'active' as const },
});

function build(admin: ReturnType<typeof adminRow> | null) {
  const prisma = {
    v1AdminUser: { findUnique: jest.fn(async () => admin) },
    v1TournamentSlot: { findUnique: jest.fn(async (): Promise<Record<string, unknown> | null> => null), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    v1Tournament: { findFirst: jest.fn(async (): Promise<Record<string, unknown> | null> => null) },
    v1TournamentGroup: { findUnique: jest.fn(async () => ({ phase: 'final' })) },
    v1TournamentRegistration: { findFirst: jest.fn() },
    v1TournamentGroupTeam: { findMany: jest.fn() },
    v1TournamentStanding: { findMany: jest.fn() },
    v1TeamMatch: { findMany: jest.fn(async () => []) },
    v1TournamentMatchDetails: { findMany: jest.fn(async (): Promise<Record<string, unknown>[]> => []) },
    v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'admin-action-1' }) },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const service = new TournamentSlotService(
    prisma as unknown as PrismaService,
    new AdminContextService(prisma as unknown as PrismaService),
    {} as GamesService,
  );
  return { prisma, service };
}

describe('TournamentSlotService.assignSlot 권한·존재 확인', () => {
  it('support 어드민은 403 이고 자리 조회나 트랜잭션에 닿지 않는다', async () => {
    const { prisma, service } = build(adminRow('support'));
    await expect(service.assignSlot(user, 's-1', null)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.v1TournamentSlot.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('어드민이 아니면 403 이다', async () => {
    const { prisma, service } = build(null);
    await expect(service.assignSlot(user, 's-1', null)).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('없는 자리는 404 SLOT_NOT_FOUND 이고 트랜잭션을 열지 않는다', async () => {
    const { prisma, service } = build(adminRow('ops'));
    await expect(service.assignSlot(user, 's-missing', null)).rejects.toMatchObject({ response: { code: 'SLOT_NOT_FOUND' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { description: '3위 팀은 거절', registrationId: 'reg-3', rejected: true },
    { description: '같은 상위 결선의 2위 팀은 1위 자리에 거절', registrationId: 'reg-2', rejected: true },
    { description: '실제 1위 팀은 허용', registrationId: 'reg-1', rejected: false },
  ])('직접 GROUP_RANK 배정: $description', async ({ registrationId, rejected }) => {
    const { prisma, service } = build(adminRow('ops'));
    const slot = {
      id: 'slot-upper-1', tournamentId: 'tournament-1', kind: 'GROUP_RANK', groupId: 'group-upper',
      position: 1, registrationId: null, sourceGroupId: 'group-source',
      group: { phase: 'final', bracketTrack: 'upper' },
    };
    prisma.v1TournamentSlot.findUnique
      .mockResolvedValueOnce({ tournamentId: 'tournament-1' })
      .mockResolvedValueOnce(slot);
    prisma.v1Tournament.findFirst.mockResolvedValue({ id: 'tournament-1', kind: 'regular_tournament' });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue({ status: 'confirmed' });
    prisma.v1TournamentSlot.findFirst.mockResolvedValue(null);
    prisma.v1TournamentSlot.findMany.mockResolvedValue([{
      ...slot,
      group: { name: '상위 결승', phase: 'final', bracketTrack: 'upper' },
      sourceGroup: { name: 'A조', sortOrder: 0 },
    }]);
    prisma.v1TournamentSlot.findUniqueOrThrow.mockResolvedValue({
      ...slot,
      registrationId,
      group: { name: '상위 결승', phase: 'final', bracketTrack: 'upper' },
      sourceGroup: { name: 'A조' },
      registration: { team: { name: registrationId } },
    });
    prisma.v1TournamentGroupTeam.findMany.mockResolvedValue(
      ['reg-1', 'reg-2', 'reg-3', 'reg-4'].map((registrationId) => ({
        groupId: 'group-source', registrationId, registration: { team: { name: registrationId } },
      })),
    );
    prisma.v1TournamentStanding.findMany.mockResolvedValue([
      { groupId: 'group-source', registrationId: 'reg-1', position: 1, wins: 3, draws: 0, losses: 0, recalculatedAt: null },
      { groupId: 'group-source', registrationId: 'reg-2', position: 2, wins: 2, draws: 0, losses: 1, recalculatedAt: null },
      { groupId: 'group-source', registrationId: 'reg-3', position: 3, wins: 1, draws: 0, losses: 2, recalculatedAt: null },
      { groupId: 'group-source', registrationId: 'reg-4', position: 4, wins: 0, draws: 0, losses: 3, recalculatedAt: null },
    ]);
    prisma.v1TournamentMatchDetails.findMany.mockResolvedValue([
      ['reg-1', 'reg-2', 1, 0], ['reg-1', 'reg-3', 1, 0], ['reg-1', 'reg-4', 1, 0],
      ['reg-2', 'reg-3', 1, 0], ['reg-2', 'reg-4', 1, 0], ['reg-3', 'reg-4', 1, 0],
    ].map(([homeRegistrationId, awayRegistrationId, homeScore, awayScore]) => ({
      groupId: 'group-source', homeRegistrationId, awayRegistrationId,
      teamMatch: { game: { currentOfficialRevision: { state: 'OFFICIAL', score: { home: homeScore, away: awayScore }, officialAt: new Date('2026-10-01T00:00:00Z') } } },
    })));

    if (rejected) {
      await expect(service.assignSlot(user, 'slot-upper-1', registrationId)).rejects.toMatchObject({
        response: { code: 'BRACKET_TRACK_RANK_MISMATCH' },
      });
      expect(prisma.v1TournamentSlot.update).not.toHaveBeenCalled();
    } else {
      await expect(service.assignSlot(user, 'slot-upper-1', registrationId)).resolves.toMatchObject({
        slot: { registrationId: 'reg-1', bracketTrack: 'upper' },
      });
      expect(prisma.v1TournamentSlot.update).toHaveBeenCalledWith({ where: { id: 'slot-upper-1' }, data: { registrationId: 'reg-1' } });
    }
  });
});
