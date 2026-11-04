import { AdminContextService } from '../common/admin-context.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { GamesService } from '../games/games.service';
import type { BracketTemplateService } from './templates/bracket-template.service';
import { MultiFinalsService } from './multi-finals/multi-finals.service';
import { TournamentAwardSetsService } from './tournament-award-sets.service';
import { TournamentPeriodSettingsService } from './competition-config/tournament-period-settings.service';

const user = { id: 'director', email: 'director@example.test', accountStatus: 'active', onboardingStatus: 'completed' } as const;
function setup(revoked = false) {
  const db = {
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(null) },
    v1TournamentStaffAssignment: { findFirst: jest.fn(async ({ where }) =>
      !revoked && where.userId === user.id && where.tournamentId === 'own'
        ? { id: 'assignment', tournamentId: 'own', version: 1 } : null) },
    v1Tournament: { findFirst: jest.fn().mockResolvedValue({ id: 'own', kind: 'regular_tournament', format: 'league_knockouts', multiFinals: null, multiFinalsRevision: 0 }) },
    v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    v1TournamentAwardSet: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async callback => callback(db));
  const prisma = db as unknown as PrismaService;
  const admins = new AdminContextService(prisma);
  return { db, finals: new MultiFinalsService(prisma, admins, {} as GamesService, {} as BracketTemplateService),
    awards: new TournamentAwardSetsService(prisma, admins), periods: new TournamentPeriodSettingsService(prisma, admins) };
}

describe('director access to new dev tournament surfaces', () => {
  it('reads own finals and awards without a platform admin account', async () => {
    const h = setup();
    await expect(h.finals.get(user, 'own')).resolves.toMatchObject({ revision: 0, finals: [], generated: false });
    await expect(h.awards.listAwardSets(user, 'own')).resolves.toEqual([]);
  });

  const cases = [
    ['finals.get', (h: ReturnType<typeof setup>, id: string) => h.finals.get(user, id)],
    ['finals.setup', (h: ReturnType<typeof setup>, id: string) => h.finals.setup(user, id, {} as never)],
    ['finals.select', (h: ReturnType<typeof setup>, id: string) => h.finals.select(user, id, {} as never)],
    ['finals.preview', (h: ReturnType<typeof setup>, id: string) => h.finals.preview(user, id)],
    ['finals.generate', (h: ReturnType<typeof setup>, id: string) => h.finals.generate(user, id, {} as never)],
    ['awards.list', (h: ReturnType<typeof setup>, id: string) => h.awards.listAwardSets(user, id)],
    ['awards.set', (h: ReturnType<typeof setup>, id: string) => h.awards.setAwardSets(user, id, {} as never)],
    ['periods.get', (h: ReturnType<typeof setup>, id: string) => h.periods.get(user, id)],
    ['periods.getMatch', (h: ReturnType<typeof setup>, id: string) => h.periods.getMatch(user, id, 'fixture')],
    ['periods.update', (h: ReturnType<typeof setup>, id: string) => h.periods.update(user, id, {} as never)],
  ] as const;
  it.each(cases)('%s rejects a foreign tournament before reading or mutating its data', async (_name, run) => {
    const h = setup();
    await expect(run(h, 'foreign')).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(h.db.v1Tournament.findFirst).not.toHaveBeenCalled();
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });
  it.each(cases)('%s rejects a revoked own assignment before domain work', async (_name, run) => {
    const h = setup(true);
    await expect(run(h, 'own')).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(h.db.v1Tournament.findFirst).not.toHaveBeenCalled();
    expect(h.db.$transaction).not.toHaveBeenCalled();
  });
});
