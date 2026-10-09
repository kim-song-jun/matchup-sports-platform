import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import {
  excludeUnfilledSlotFixturesSql,
  excludeUnfilledSlotFixturesWhere,
} from '../../src/common/competition/unfilled-slot-gate';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

/**
 * 정규 리그 빈 경기 공개 게이트 — 5종 fixture × 공개 경로 전부 (스펙 S6).
 * 가려야 하는 (a)(b)(c) 와 그대로 보여야 하는 (d)(e) 를 **같은 응답에서** 함께 단언한다.
 */
describe('정규 리그 빈 경기 공개 게이트', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let leagueId: string;
  let ids: { empty: string; homeOnly: string; awayOnly: string; filled: string; legacy: string };
  let gated: string[];
  let visible: string[];
  const teams: Record<'A' | 'B' | 'C' | 'D' | 'E', { id: string; name: string }> = {} as never;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsug');
    for (const key of ['A', 'B', 'C', 'D', 'E'] as const) teams[key] = await h.makeTeam(`lsug-${key}`);
    // 공개 상세는 draft 를 숨기므로 진행 중 리그로 만든다.
    leagueId = await h.makeLeague({ teams: Object.values(teams), state: 'active' });
    const slots = await h.makeSlots(leagueId, 8);
    const day = (offset: number) => new Date(Date.now() + (10 + offset) * 86_400_000);
    ids = {
      empty: await h.createFixture(leagueId, { homeSlotId: slots[0].id, awaySlotId: slots[1].id, startAt: day(0) }),
      homeOnly: await h.createFixture(leagueId, { homeTeamId: teams.A.id, homeSlotId: slots[2].id, awaySlotId: slots[3].id, startAt: day(1) }),
      awayOnly: await h.createFixture(leagueId, { awayTeamId: teams.B.id, homeSlotId: slots[4].id, awaySlotId: slots[5].id, startAt: day(2) }),
      filled: await h.createFixture(leagueId, { homeTeamId: teams.C.id, awayTeamId: teams.D.id, homeSlotId: slots[6].id, awaySlotId: slots[7].id, startAt: day(3) }),
      legacy: await h.createFixture(leagueId, { homeTeamId: teams.E.id, startAt: day(4) }),
    };
    gated = [ids.empty, ids.homeOnly, ids.awayOnly];
    visible = [ids.filled, ids.legacy];
  });
  afterAll(async () => cleanup?.());

  const sorted = (values: string[]) => [...values].sort();

  it('술어 parity: Prisma where 와 raw SQL 조각이 같은 경기 집합을 낸다', async () => {
    const viaWhere = await h.prisma.v1TeamMatch.findMany({
      where: { leagueId, ...excludeUnfilledSlotFixturesWhere() },
      select: { id: true },
    });
    const viaSql = await h.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT team_match.id FROM v1_team_matches team_match
      WHERE team_match.league_id = ${leagueId} AND ${excludeUnfilledSlotFixturesSql('team_match')}`;
    expect(sorted(viaWhere.map((row) => row.id))).toEqual(sorted(visible));
    expect(sorted(viaSql.map((row) => row.id))).toEqual(sorted(visible));
  });

  describe('리그 자기 페이지', () => {
    it('GET /league-matches/:id — 일정에서 빈·반쪽 경기는 빠지고 다 찬 경기와 자리 없는 기존 경기는 그대로다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`);
      expect(res.status).toBe(200);
      const fixtureIds: string[] = res.body.data.fixtures.map((fixture: { teamMatchId: string }) => fixture.teamMatchId);
      expect(sorted(fixtureIds)).toEqual(sorted(visible));
    });

    it('GET /league-matches/:id/standings — 미확정 경기 목록도 같은 기준이고 500 으로 깨지지 않는다', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
      expect(res.status).toBe(200);
      const pending: string[] = res.body.data.pendingFixtures.map((fixture: { teamMatchId: string }) => fixture.teamMatchId);
      expect(sorted(pending)).toEqual(sorted(visible));
    });
  });
});
