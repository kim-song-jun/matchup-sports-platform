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
});
