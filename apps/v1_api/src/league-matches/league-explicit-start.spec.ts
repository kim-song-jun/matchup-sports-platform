import { Prisma } from '@prisma/client';
import { createLeagueMirrorWithRosterSchedule } from '../jobs/league-roster/league-roster-autoconfirm.service';
import { promoteLeagueOnGameActivityInTx, promoteLeagueWhenSlotsFilledInTx } from './league-slot-status';

function database(initialStatus: string, requiresExplicitStart = false) {
  const row = { id: 'league-1', kind: 'regular_league', status: initialStatus, requiresExplicitStart };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    $executeRaw: jest.fn(async () => 1),
    v1Tournament: {
      create: jest.fn(async ({ data }: { data: { status: string } }) => Object.assign(row, data)),
      findFirst: jest.fn(async () => row),
      updateMany: jest.fn(async ({ where, data }: { where: { requiresExplicitStart: boolean; status: { in: string[] } }; data: { status: string } }) => {
        if (where.requiresExplicitStart !== row.requiresExplicitStart || !where.status.in.includes(row.status)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    v1TeamMatch: { count: jest.fn(async ({ where }: { where: { OR?: unknown } }) => Array.isArray(where.OR) && where.OR.length === 2 ? 1 : 0) },
    v1StatusChangeLog: { create: jest.fn() },
  };
  return { row, tx, client: tx as unknown as Prisma.TransactionClient };
}

describe('new league explicit start', () => {
  it('creates a closed league at the shared independent/series creation boundary', async () => {
    const db = database('draft');
    await createLeagueMirrorWithRosterSchedule(db.client, {
      id: 'league-1', kind: 'regular_league', status: 'draft', title: '새 시즌', sportId: 'sport-1',
    }, { leagueId: 'league-1', startsOn: new Date('2030-01-01') });
    expect(db.row.status).toBe('closed');
    expect(db.row.requiresExplicitStart).toBe(true);
    await expect(promoteLeagueWhenSlotsFilledInTx(db.client, 'league-1')).resolves.toBe(false);
    expect(db.row.status).toBe('closed');
    await expect(promoteLeagueOnGameActivityInTx(db.client, 'league-1', 'result_confirmed')).resolves.toBe(false);
    expect(db.row.status).toBe('closed');
    expect(db.tx.v1StatusChangeLog.create).not.toHaveBeenCalled();
  });

  it.each(['draft', 'open', 'closed'])('preserves existing %s league automatic start', async (status) => {
    const db = database(status);
    await expect(promoteLeagueWhenSlotsFilledInTx(db.client, 'league-1')).resolves.toBe(true);
    expect(db.row.status).toBe('in_progress');
  });
});
