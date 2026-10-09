import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('어드민 리그 화면 — 빈 경기 허용', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsav');
  });
  afterAll(async () => cleanup?.());

  it('GET /admin/league-matches/:id/videos — 빈 경기가 있어도 200 이고 팀 이름은 null 이다', async () => {
    const teamA = await h.makeTeam('lsav-a');
    const leagueId = await h.makeLeague({ teams: [teamA] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const empty = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    const half = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/league-matches/${leagueId}/videos`)
      .set('x-v1-user-id', h.adminUserId);

    expect(res.status).toBe(200);
    const byId = new Map<string, { homeTeamName: string | null; awayTeamName: string | null }>(
      res.body.data.items.map((item: { fixtureId: string; homeTeamName: string | null; awayTeamName: string | null }) => [item.fixtureId, item]),
    );
    expect(byId.get(empty)).toMatchObject({ homeTeamName: null, awayTeamName: null });
    expect(byId.get(half)).toMatchObject({ homeTeamName: teamA.name, awayTeamName: null });
  });

  it('GET /admin/league-matches/:id — 경기마다 자리 id·game, 최상위 slots[], 참가팀 registrationId 를 싣는다', async () => {
    const teamA = await h.makeTeam('lsav-b');
    const teamB = await h.makeTeam('lsav-c');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const regA = await h.registrationId(leagueId, teamA.id);
    await h.prisma.v1TournamentSlot.update({ where: { id: s1.id }, data: { registrationId: regA } });
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const draft = await h.prisma.v1GameResultRevision.create({
      data: {
        gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 2, away: 1 }, eventsHash: 'lsav-hash',
        createdByActorType: 'SYSTEM', createdBySystemActor: 'T_LSAV',
      },
    });

    const res = await request(app.getHttpServer()).get(`/api/v1/admin/league-matches/${leagueId}`).set('x-v1-user-id', h.adminUserId);

    expect(res.status).toBe(200);
    expect(res.body.data.slots).toEqual([
      expect.objectContaining({ id: s1.id, label: '1번 자리', registrationId: regA, teamName: teamA.name, kind: 'ENTRY' }),
      expect.objectContaining({ id: s2.id, label: '2번 자리', registrationId: null, teamName: null }),
    ]);
    const fixture = res.body.data.fixtures.find((row: { teamMatchId: string }) => row.teamMatchId === teamMatchId);
    expect(fixture).toMatchObject({
      homeTeamId: teamA.id,
      awayTeamId: null,
      homeSlotId: s1.id,
      awaySlotId: s2.id,
      game: {
        id: game.id,
        state: 'SCHEDULED',
        hasLiveRecords: false,
        latestRevision: { id: draft.id, state: 'DRAFT', score: { home: 2, away: 1 }, entryMethod: 'console' },
      },
    });
  });

  it('GET /admin/league-matches/:id/teams — 참가팀마다 자리 배정에 쓰는 registrationId 를 싣는다', async () => {
    const teamA = await h.makeTeam('lsav-d');
    const teamB = await h.makeTeam('lsav-e');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });

    const res = await request(app.getHttpServer()).get(`/api/v1/admin/league-matches/${leagueId}/teams`).set('x-v1-user-id', h.adminUserId);

    expect(res.status).toBe(200);
    const byTeam = new Map<string, string>(res.body.data.teams.map((row: { teamId: string; registrationId: string }) => [row.teamId, row.registrationId]));
    expect(byTeam.get(teamA.id)).toBe(await h.registrationId(leagueId, teamA.id));
    expect(byTeam.get(teamB.id)).toBe(await h.registrationId(leagueId, teamB.id));
  });
});
