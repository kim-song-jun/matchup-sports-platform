import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { lockGameRows } from './game-row-lock';

describe('roster Game lock conflicts', () => {
  const prisma = new PrismaService();
  afterEach(() => jest.restoreAllMocks());

  it('turns only PostgreSQL NOWAIT contention into an explicit retryable conflict', async () => {
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Prisma.PrismaClientKnownRequestError('busy Game', {
      code: 'P2010', clientVersion: Prisma.prismaVersion.client, meta: { code: '55P03' },
    }));
    await expect(lockGameRows(prisma, ['busy'], false)).rejects.toMatchObject({
      response: { code: 'COMMAND_CONCURRENCY_CONFLICT', details: { gameId: 'busy' } },
    });
  });

  it.each(['40P01', '42P01'])('preserves other raw-query failures (%s)', async (code) => {
    const error = new Prisma.PrismaClientKnownRequestError('database failure', {
      code: 'P2010', clientVersion: Prisma.prismaVersion.client, meta: { code },
    });
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(error);
    await expect(lockGameRows(prisma, ['game'], false)).rejects.toBe(error);
  });

  it('keeps the generator blocking lock behavior and sorted unique Game IDs', async () => {
    const query = jest.spyOn(prisma, '$queryRaw').mockResolvedValue([]);
    await lockGameRows(prisma, ['b', 'a', 'b']);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.map((call) => call[1])).toEqual(['a', 'b']);
  });

  it('does not translate errors from the generator blocking lock mode', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('unrelated contention', {
      code: 'P2010', clientVersion: Prisma.prismaVersion.client, meta: { code: '55P03' },
    });
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(error);
    await expect(lockGameRows(prisma, ['game'])).rejects.toBe(error);
  });
});
