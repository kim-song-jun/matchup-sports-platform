import type { PrismaService } from '../prisma/prisma.service';
import { findTournamentManagementAction } from './tournament-management-history';

describe('shared tournament management history', () => {
  it('uses a director decision newer than the platform decision for subsequent reconciliation', async () => {
    const db = {
      v1AdminActionLog: { findFirst: jest.fn().mockResolvedValue({ id: 'admin-log', createdAt: new Date('2026-01-01'), afterJson: { sourceVersion: 'old' } }) },
      v1OperationAudit: { findFirst: jest.fn().mockResolvedValue({ id: 'director-log', createdAt: new Date('2026-01-02'), after: { sourceVersion: 'new', _authorization: { role: 'tournament_director' } } }) },
    };
    await expect(findTournamentManagementAction(db as unknown as PrismaService, {
      targetType: 'tournament', targetId: 'own', action: 'tournament.bracket.assign_finalists',
    })).resolves.toMatchObject({ id: 'director-log', afterJson: { sourceVersion: 'new' } });
  });

  it('finds a completed director command with the same request ID instead of running it again', async () => {
    const db = {
      v1AdminActionLog: { findFirst: jest.fn().mockResolvedValue(null) },
      v1OperationAudit: { findFirst: jest.fn(async ({ where }) => where.resourceId === 'own' && where.after?.path?.[0] === 'requestId' && where.after.equals === 'request-1'
        ? { id: 'director-log', createdAt: new Date(), after: { requestId: 'request-1', groups: 2, fixtures: 6 } } : null) },
    };
    const result = await findTournamentManagementAction(db as unknown as PrismaService, {
      targetType: 'tournament', targetId: 'own', action: 'tournament.bracket.template.apply', afterJson: { path: ['requestId'], equals: 'request-1' },
    });
    expect(result?.afterJson).toMatchObject({ requestId: 'request-1', groups: 2, fixtures: 6 });
  });
});
