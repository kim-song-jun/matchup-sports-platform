import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { BracketTemplateService } from './bracket-template.service';

describe('BracketTemplateService format concurrency', () => {
  it('rejects a template when the format changed before the bracket lock was acquired', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({ id: 't-1', kind: 'regular_tournament', format: 'knockout' })
      .mockResolvedValueOnce({ id: 't-1', kind: 'regular_tournament', format: 'league', competitionConfigVersionId: 'config-1' });
    const groups = { findMany: jest.fn(), create: jest.fn() };
    const tx = { v1Tournament: { findFirst }, v1TournamentGroup: groups, $executeRaw: jest.fn().mockResolvedValue(1) };
    const prisma = { ...tx, $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const admin = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }) };
    const service = new BracketTemplateService(prisma as unknown as PrismaService, admin as unknown as AdminContextService, {} as GamesService);

    await expect(service.apply({ id: 'user-1' } as V1AuthUser, 't-1', { kind: 'knockout', size: 4 }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH' } });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(groups.findMany).not.toHaveBeenCalled();
    expect(groups.create).not.toHaveBeenCalled();
  });
});
