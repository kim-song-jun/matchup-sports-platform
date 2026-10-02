import type { Prisma } from '@prisma/client';
import { refreshAlphaTeamMembershipCounts } from '../../prisma/seed-alpha-membership-counts';
import { ensureTeamRoster, PERSONAS, TEAMS } from '../../prisma/seed-alpha-tournament-qa';

type Membership = { teamId: string; userId: string; role: string; status: string };

function fixture(members: Membership[]) {
  const team = { id: TEAMS[0].id, memberCount: 4, managerCount: 1 };
  const noop = async () => ({});
  const tx = {
    v1TermsDocument: { findMany: async () => [] },
    v1ManagedTermsDocument: { findMany: async () => [] },
    v1ManagedTermsConsentEvent: { createMany: noop },
    v1User: { upsert: async () => ({ id: PERSONAS[0].id }) },
    v1UserProfile: { upsert: noop },
    v1UserRecordConsent: { upsert: noop },
    v1TeamProfile: { upsert: noop },
    v1Team: {
      upsert: async ({ update }: { update: object }) => Object.assign(team, update),
      update: async ({ data }: { data: object }) => Object.assign(team, data),
    },
    v1TeamMembership: {
      upsert: async ({ create, update }: { create: Membership; update: Partial<Membership> }) => {
        const row = members.find((m) => m.teamId === create.teamId && m.userId === create.userId);
        if (row) Object.assign(row, update);
        else members.push(create);
      },
      groupBy: async ({ where }: { where: { teamId: string; status: string } }) => {
        const counts = new Map<string, number>();
        for (const row of members.filter((m) => m.teamId === where.teamId && m.status === where.status)) {
          counts.set(row.role, (counts.get(row.role) ?? 0) + 1);
        }
        return [...counts].map(([role, count]) => ({ role, _count: { _all: count } }));
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, team };
}

describe('alpha seeds preserve membership counters', () => {
  const row = (userId: string, role = 'member', status = 'active', teamId = TEAMS[0].id): Membership =>
    ({ userId, role, status, teamId });

  it('counts all six active members and additional managers, excluding inactive and other teams', async () => {
    const { tx, team } = fixture([
      row('owner', 'owner'), row('manager-1', 'manager'), row('manager-2', 'manager'),
      row('member-1'), row('member-2'), row('member-3'),
      row('left', 'manager', 'left'), row('removed', 'member', 'removed'),
      row('other-team', 'manager', 'active', TEAMS[1].id),
    ]);
    await refreshAlphaTeamMembershipCounts(tx, team.id);
    expect(team).toMatchObject({ memberCount: 6, managerCount: 2 });
    await refreshAlphaTeamMembershipCounts(tx, team.id);
    expect(team).toMatchObject({ memberCount: 6, managerCount: 2 });
  });

  it('replaying the actual tournament roster seed preserves extra members in persisted and returned counts', async () => {
    const members = [row(PERSONAS[0].id, 'owner'), row('extra-manager', 'manager'), row('extra-player')];
    const { tx, team } = fixture(members);
    for (let replay = 0; replay < 2; replay += 1) {
      const result = await ensureTeamRoster(tx, 'sport', 'region', [PERSONAS[0]], [TEAMS[0]], 'bio', 'description');
      expect(team).toMatchObject({ memberCount: 3, managerCount: 1 });
      expect(result[0].team).toMatchObject({ memberCount: 3, managerCount: 1 });
      expect(members).toHaveLength(3);
    }
  });

  it('clears stale counters when there are no active memberships', async () => {
    const { tx, team } = fixture([row('former', 'manager', 'left')]);
    await refreshAlphaTeamMembershipCounts(tx, team.id);
    expect(team).toMatchObject({ memberCount: 0, managerCount: 0 });
  });
});
