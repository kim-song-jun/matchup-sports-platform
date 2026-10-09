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
    v1TournamentSlot: { findUnique: jest.fn(async () => null) },
    v1Tournament: { findFirst: jest.fn(async () => null) },
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
});
