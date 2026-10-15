import type { INestApplication } from '@nestjs/common';
import type { V1TournamentRegistrationStatus } from '@prisma/client';
import request = require('supertest');
import { ManagedTermsRuntimeService } from '../../../src/terms/managed-terms-runtime.service';
import { holdRowLock } from '../../team-schedules/helpers/lock-barrier';
import { createLeagueSlotHarness, type HarnessTeam } from './league-slot-harness';

const capacityStatuses = ['awaiting_payment', 'payment_checking', 'paid', 'confirmed'] as const;
type HttpAction = () => Promise<request.Response>;
type Settings = {
  title: string; rulesText: string; regionId: string; startsOn: string; endsOn: string;
  registrationDeadlineAt: string | null; plannedFixtureCount: number | null;
  maxTeams: number | null; updatedAt: string;
};

export async function createLeagueCapacityHarness(app: INestApplication) {
  const h = await createLeagueSlotHarness(app, 'mdqa145-capacity');
  const http = () => request(app.getHttpServer());
  const settingsPath = (leagueId: string) => `/api/v1/admin/league-matches/${leagueId}/settings`;
  const terms = app.get(ManagedTermsRuntimeService);
  const signupIds = (await terms.currentSignupTerms()).items
    .filter(item => item.requirement === 'required').map(item => item.documentId);
  const applicationIds = (await terms.currentTournamentTerms()).items
    .filter(item => item.requirement === 'required').map(item => item.documentId);

  async function settings(leagueId: string): Promise<Settings> {
    const response = await http().get(settingsPath(leagueId)).set('x-v1-user-id', h.adminUserId).expect(200);
    return response.body.data;
  }
  function settingsBody(snapshot: Settings) {
    return { expectedUpdatedAt: snapshot.updatedAt, title: snapshot.title, rulesText: snapshot.rulesText,
      regionId: snapshot.regionId, startsOn: snapshot.startsOn, endsOn: snapshot.endsOn,
      registrationDeadlineAt: snapshot.registrationDeadlineAt, plannedFixtureCount: snapshot.plannedFixtureCount };
  }
  async function patchCapacity(leagueId: string, maxTeams: number | null) {
    return http().patch(settingsPath(leagueId)).set('x-v1-user-id', h.adminUserId)
      .send({ ...settingsBody(await settings(leagueId)), maxTeams });
  }
  async function applicant(name: string) {
    const team = await h.makeTeam(name);
    const owner = await h.prisma.v1Team.findUniqueOrThrow({ where: { id: team.id }, select: { ownerUserId: true } });
    await h.prisma.v1User.update({ where: { id: owner.ownerUserId }, data: { phoneVerifiedAt: new Date('2026-08-01T00:00:00Z') } });
    await terms.acceptSignupTerms(owner.ownerUserId, signupIds);
    return { ...team, ownerUserId: owner.ownerUserId };
  }
  async function makeLeague(maxTeams: number | null | undefined = 3) {
    const teams = [await h.makeTeam('기존 A'), await h.makeTeam('기존 B')];
    const response = await http().post('/api/v1/admin/league-matches').set('x-v1-user-id', h.adminUserId).send({
      title: `정원 리그 ${teams[0].id}`, sportId: h.sportId, regionId: h.regionId,
      startsOn: '2098-01-01T00:00:00.000Z', endsOn: '2098-12-31T00:00:00.000Z',
      teamIds: teams.map(team => team.id), minPlayers: 1, maxPlayers: 20,
      ...(maxTeams === undefined ? {} : { maxTeams }),
    }).expect(201);
    const leagueId: string = response.body.data.leagueId;
    await http().post(`/api/v1/admin/league-matches/${leagueId}/open-registration`)
      .set('x-v1-user-id', h.adminUserId).send({ registrationDeadlineAt: '2097-12-01T00:00:00.000Z' }).expect(200);
    return { leagueId, teams };
  }
  /** Payment-transition scenarios explicitly configure a paid league; ordinary capacity controls stay free. */
  async function makePaidLeague(maxTeams: number | null | undefined = 3) {
    const league = await makeLeague(maxTeams);
    const configured = await http().patch(`/api/v1/admin/league-matches/${league.leagueId}/entry-fee`)
      .set('x-v1-user-id', h.adminUserId).send({
        entryFee: 120000, bankName: '검증은행', bankAccount: '145-000-000000', bankHolder: '회귀 검증',
      }).expect(200);
    expect(configured.body.data).toMatchObject({
      entryFee: 120000, entryFeeConfiguredAt: expect.any(String),
      bankName: '검증은행', bankAccount: '145-000-000000', bankHolder: '회귀 검증',
    });
    return league;
  }
  async function assertAwaitingPayment(registrationId: string) {
    const [registration, payment] = await Promise.all([
      h.prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: registrationId } }),
      h.prisma.v1TournamentPayment.findUniqueOrThrow({ where: { registrationId } }),
    ]);
    expect(registration).toMatchObject({ status: 'awaiting_payment' });
    expect(payment).toMatchObject({ status: 'ready', amount: 120000, method: 'bank_transfer' });
  }
  async function draft(leagueId: string, team: Awaited<ReturnType<typeof applicant>>) {
    const response = await http().post(`/api/v1/tournaments/${leagueId}/registrations`)
      .set('x-v1-user-id', team.ownerUserId).send({ teamId: team.id }).expect(201);
    const registrationId: string = response.body.data.id;
    return { ...team, registrationId };
  }
  async function submit(leagueId: string, team: Awaited<ReturnType<typeof draft>>) {
    return http().post(`/api/v1/tournaments/${leagueId}/registrations/${team.registrationId}/submit`)
      .set('x-v1-user-id', team.ownerUserId).send({ termsDocumentIds: applicationIds,
        paymentMethod: 'bank_transfer', depositorName: '통합 검증 입금자',
        agreedRules: true, agreedPrivacy: true, agreedRefund: true });
  }
  async function seedRegistration(leagueId: string, team: HarnessTeam, status: V1TournamentRegistrationStatus) {
    const owner = await h.prisma.v1Team.findUniqueOrThrow({ where: { id: team.id }, select: { ownerUserId: true } });
    return h.prisma.v1TournamentRegistration.create({ data: {
      tournamentId: leagueId, teamId: team.id, appliedByUserId: owner.ownerUserId, status, entrySource: 'applied',
    } });
  }
  async function countReserved(leagueId: string) {
    return h.prisma.v1TournamentRegistration.count({ where: { tournamentId: leagueId, status: { in: [...capacityStatuses] } } });
  }

  /** Both requests must be observed waiting in PostgreSQL before the holder releases the row. */
  async function behindLeagueRowLock(
    leagueId: string,
    actions: readonly HttpAction[],
    whileBlocked?: () => Promise<void>,
  ) {
    let holderPid = 0;
    const holder = await holdRowLock(h.prisma, async tx => {
      const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      if (rows[0] === undefined) throw new Error('PostgreSQL holder PID missing');
      holderPid = rows[0].pid;
      return tx.$queryRaw`SELECT id FROM v1_tournaments WHERE id = ${leagueId} FOR UPDATE`;
    });
    const settled = actions.map(() => false);
    const outcomes = actions.map((action, index) => action().then(
      response => { settled[index] = true; return { kind: 'response' as const, response }; },
      error => { settled[index] = true; return { kind: 'error' as const, error }; },
    ));
    let barrierFailure: { error: unknown } | undefined;
    try {
      const deadline = Date.now() + 5000;
      let observed = false;
      while (Date.now() < deadline) {
        // A later row-lock waiter can block on the first waiter rather than directly on the holder.
        // Follow the real blocking graph and count distinct writer sessions reaching our holder.
        const rows = await h.prisma.$queryRaw<Array<{ waiting: number }>>`
          WITH RECURSIVE lock_waits AS (
            SELECT pid AS waiter_pid, unnest(pg_blocking_pids(pid)) AS blocker_pid
            FROM pg_stat_activity WHERE datname = current_database()
          ), blocking_chain AS (
            SELECT waiter_pid, blocker_pid FROM lock_waits
            UNION
            SELECT chain.waiter_pid, next.blocker_pid
            FROM blocking_chain chain JOIN lock_waits next ON chain.blocker_pid = next.waiter_pid
          )
          SELECT count(DISTINCT waiter_pid)::int AS waiting FROM blocking_chain
          WHERE blocker_pid = ${holderPid}::int`;
        if ((rows[0]?.waiting ?? 0) >= actions.length) { observed = true; break; }
        if (settled.some(Boolean)) throw new Error('A capacity writer settled before acquiring the shared league-row lock');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      if (!observed) throw new Error('Both capacity writers were not observed in a PostgreSQL row-lock wait');
      // Real cancellation routes can commit after every stale operation has reached its parent lock.
      await whileBlocked?.();
    } catch (error) { barrierFailure = { error }; }
    finally { await holder.release(); }
    const results = await Promise.all(outcomes);
    if (barrierFailure) throw barrierFailure.error;
    return results.map(result => {
      if (result.kind === 'error') throw result.error;
      return result.response;
    });
  }
  return { ...h, http, settingsPath, settings, settingsBody, patchCapacity, applicant, makeLeague, makePaidLeague, assertAwaitingPayment,
    draft, submit, seedRegistration, countReserved, behindLeagueRowLock };
}

export type LeagueCapacityHarness = Awaited<ReturnType<typeof createLeagueCapacityHarness>>;
