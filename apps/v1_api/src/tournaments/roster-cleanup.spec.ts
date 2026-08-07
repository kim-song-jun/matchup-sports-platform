import { Prisma } from '@prisma/client';
import { removeUserFromActiveRosters } from './roster-cleanup';

describe('removeUserFromActiveRosters', () => {
  it('does not overwrite a concurrent removal and returns the actual update count', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'player-1' }, { id: 'player-2' }]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      v1TournamentPlayer: { findMany, updateMany },
    } as unknown as Prisma.TransactionClient;
    const removedAt = new Date('2026-08-07T00:00:00.000Z');

    const count = await removeUserFromActiveRosters(tx, 'user-1', {
      teamId: 'team-1',
      at: removedAt,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['player-1', 'player-2'] },
        removedAt: null,
      },
      data: { removedAt },
    });
    expect(count).toBe(1);
  });
});
