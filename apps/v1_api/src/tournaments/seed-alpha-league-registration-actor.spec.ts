import type { Prisma } from '@prisma/client';
import { ensureLeague, ensureTierSeries } from '../../prisma/seed-alpha-league-qa';

const adminId = 'admin-row-id';
const teams = Array.from({ length: 4 }, (_, i) => ({
  id: `team-${i}`, name: `team-${i}`, playerIds: [`owner-user-${i}`],
}));

function fixture() {
  const registrations = new Map<string, { tournamentId: string; teamId: string; appliedByUserId: string }>();
  const tournaments: Array<{ id: string; createdByAdminUserId: string }> = [];
  const series: Array<{ id: string; createdByAdminUserId: string }> = [];
  const users = new Set(teams.flatMap(team => team.playerIds));
  const tx = {
    v1Tournament: {
      upsert: async ({ create }: { create: typeof tournaments[number] }) => {
        tournaments.push(create);
        return create;
      },
    },
    v1LeagueSeries: {
      upsert: async ({ create }: { create: typeof series[number] }) => {
        series.push(create);
        return create;
      },
    },
    v1TournamentRegistration: {
      upsert: async ({ create }: { create: { tournamentId: string; teamId: string; appliedByUserId: string } }) => {
        if (!users.has(create.appliedByUserId)) throw new Error('FK: applicant must be an existing V1User');
        const key = `${create.tournamentId}/${create.teamId}`;
        if (!registrations.has(key)) registrations.set(key, create);
        return registrations.get(key);
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, registrations, tournaments, series };
}

describe('alpha league registration actor IDs', () => {
  it('uses the roster user as applicant while retaining the admin row as tournament creator', async () => {
    const f = fixture();
    const now = new Date('2026-10-02T00:00:00Z');
    for (let replay = 0; replay < 2; replay++) {
      await ensureLeague(f.tx, 'sport', 'region', adminId, teams, now);
    }
    expect(f.registrations.size).toBe(4);
    for (const registration of f.registrations.values()) {
      expect(registration.appliedByUserId).toBe(teams.find(t => t.id === registration.teamId)?.playerIds[0]);
    }
    expect(f.tournaments.every(t => t.createdByAdminUserId === adminId)).toBe(true);
  });

  it('uses V1User IDs for tier applicants and V1AdminUser IDs for series/tournament creators', async () => {
    const f = fixture();
    await ensureTierSeries(f.tx, 'sport', 'region', adminId, teams, new Date('2026-10-02T00:00:00Z'));
    expect(f.registrations.size).toBe(4);
    for (const registration of f.registrations.values()) {
      expect(registration.appliedByUserId).toBe(teams.find(t => t.id === registration.teamId)?.playerIds[0]);
    }
    expect(f.series).toHaveLength(1);
    expect(f.series[0].createdByAdminUserId).toBe(adminId);
    expect(f.tournaments).toHaveLength(2);
    expect(f.tournaments.every(t => t.createdByAdminUserId === adminId)).toBe(true);
  });

  it('rejects an empty applicant roster rather than substituting an admin ID', async () => {
    const f = fixture();
    const empty = teams.map(team => ({ ...team, playerIds: [] }));
    const now = new Date('2026-10-02T00:00:00Z');
    await expect(ensureLeague(f.tx, 'sport', 'region', adminId, empty, now))
      .rejects.toThrow('Alpha league roster must contain an applicant user');
    await expect(ensureTierSeries(f.tx, 'sport', 'region', adminId, empty, now))
      .rejects.toThrow('Alpha league roster must contain an applicant user');
    expect(f.registrations.size).toBe(0);
  });
});
