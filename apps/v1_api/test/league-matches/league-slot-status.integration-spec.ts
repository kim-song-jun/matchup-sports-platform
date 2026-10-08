import type { INestApplication } from '@nestjs/common';
import { promoteLeagueWhenSlotsFilledInTx } from '../../src/league-matches/league-slot-status';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('promoteLeagueWhenSlotsFilledInTx', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsst');
  });
  afterAll(async () => cleanup?.());

  const promote = (leagueId: string) => h.prisma.$transaction((tx) => promoteLeagueWhenSlotsFilledInTx(tx, leagueId));
  const statusOf = async (leagueId: string) =>
    (await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId }, select: { status: true } })).status;

  async function slotLeague(status: 'draft' | 'open' | 'closed' | 'on_hold' | 'completed' | 'in_progress' = 'draft') {
    const teamA = await h.makeTeam('lsst-a');
    const teamB = await h.makeTeam('lsst-b');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status } });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    return { leagueId, teamA, teamB, s1, s2 };
  }

  it('does not promote while an empty side remains', async () => {
    const { leagueId, teamA, s1, s2 } = await slotLeague();
    await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });
    expect(await promote(leagueId)).toBe(false);
    expect(await statusOf(leagueId)).toBe('draft');
  });

  it('promotes draft/open/closed to in_progress once every slot fixture is filled', async () => {
    for (const from of ['draft', 'open', 'closed'] as const) {
      const { leagueId, teamA, teamB, s1, s2 } = await slotLeague(from);
      await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
      expect(await promote(leagueId)).toBe(true);
      expect(await statusOf(leagueId)).toBe('in_progress');
      const log = await h.prisma.v1StatusChangeLog.findFirst({ where: { targetType: 'league_match', targetId: leagueId } });
      expect(log).toMatchObject({ fromStatus: 'draft', toStatus: 'active', reason: 'slots_filled' });
    }
  });

  it('control: on_hold, completed and in_progress leagues are left alone even when full', async () => {
    for (const status of ['on_hold', 'completed', 'in_progress'] as const) {
      const { leagueId, teamA, teamB, s1, s2 } = await slotLeague(status);
      await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
      expect(await promote(leagueId)).toBe(false);
      expect(await statusOf(leagueId)).toBe(status);
    }
  });

  it('ignores cancelled empty fixtures — cancelling the last empty one triggers promotion', async () => {
    const { leagueId, teamA, teamB, s1, s2 } = await slotLeague();
    await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
    const empty = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    expect(await promote(leagueId)).toBe(false);
    await h.prisma.v1TeamMatch.update({ where: { id: empty }, data: { status: 'cancelled', homeSlotId: null, awaySlotId: null } });
    expect(await promote(leagueId)).toBe(true);
  });

  it('does not promote a league with no slot-using fixtures (plain bracket league)', async () => {
    const teamA = await h.makeTeam('lsst-c');
    const teamB = await h.makeTeam('lsst-d');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    expect(await promote(leagueId)).toBe(false);
    expect(await statusOf(leagueId)).toBe('draft');
  });
});
