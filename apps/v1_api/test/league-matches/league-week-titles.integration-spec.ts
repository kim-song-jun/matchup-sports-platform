import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

jest.setTimeout(180000);

/**
 * 2026-11-03 사용자 확정: 리그 주차는 KST 달력 주(월~일)이고 경기가 있는 주만 센다. 운영자는 한 주의 경기를
 * 한 번에 넣는다(묶음 추가). 끼워 넣기·재일정으로 주차가 밀리면 저장된 제목과 팀 일정 제목도 따라가야
 * 목록·카드·팀 캘린더가 보드와 같은 주차를 말한다(알파 1103sj1 에서 화면끼리 주차가 갈렸다).
 */
describe('리그 주차 — 달력 주 · 묶음 추가 · 저장된 제목 맞추기 (real DB)', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let teams: HarnessTeam[];
  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'league-week-titles');
    teams = [await h.makeTeam('주차 A'), await h.makeTeam('주차 B'), await h.makeTeam('주차 C'), await h.makeTeam('주차 D')];
  });
  afterAll(async () => cleanup?.());

  const http = () => request(app.getHttpServer());
  const batch = (leagueId: string, fixtures: object[]) =>
    http().post(`/api/v1/admin/league-matches/${leagueId}/fixtures/manual/batch`).set('x-v1-user-id', h.adminUserId).send({ fixtures });
  const pair = (home: number, away: number, startsAt: string) => ({ homeTeamId: teams[home].id, awayTeamId: teams[away].id, startsAt, durationMinutes: 50 });
  const titlesByStart = async (leagueId: string) => {
    const rows = await h.prisma.v1TeamMatch.findMany({ where: { leagueId, deletedAt: null }, orderBy: [{ startAt: 'asc' }, { id: 'asc' }], select: { id: true, title: true, startAt: true } });
    return rows.map((row) => `${row.startAt?.toISOString().slice(0, 10)} ${row.title.replace(/^.* (\d+주차)$/, '$1')}`);
  };

  it('묶음 추가는 한 번에 만들고, 토·일은 한 주차이며, 앞 주에 끼우면 뒤 제목과 팀 일정이 밀렸다가 옮기면 돌아온다', async () => {
    const leagueId = await h.makeLeague({ teams, state: 'active' });

    // 1주차(11/14 토 두 경기) + 다음 주(11/28 토·11/29 일)를 한 번에 만든다.
    const created = await batch(leagueId, [
      pair(0, 1, '2098-11-14T01:00:00.000Z'),
      pair(2, 3, '2098-11-14T02:00:00.000Z'),
      pair(0, 2, '2098-11-28T01:00:00.000Z'),
      pair(1, 3, '2098-11-29T01:00:00.000Z'),
    ]);
    expect(created.status).toBe(201);
    expect(created.body.data.teamMatchIds).toHaveLength(4);
    expect(await titlesByStart(leagueId)).toEqual(['2098-11-14 1주차', '2098-11-14 1주차', '2098-11-28 2주차', '2098-11-29 2주차']);

    // 사이 주(11/21)에 한 경기를 끼우면 뒤 두 경기의 저장된 제목이 3주차로 밀린다 — 팀 일정 제목도 같이.
    const inserted = await http().post(`/api/v1/admin/league-matches/${leagueId}/fixtures/manual`).set('x-v1-user-id', h.adminUserId)
      .send(pair(0, 3, '2098-11-21T01:00:00.000Z'));
    expect(inserted.status).toBe(201);
    expect(await titlesByStart(leagueId)).toEqual(['2098-11-14 1주차', '2098-11-14 1주차', '2098-11-21 2주차', '2098-11-28 3주차', '2098-11-29 3주차']);
    const sunday = await h.prisma.v1TeamMatch.findFirstOrThrow({ where: { leagueId, startAt: new Date('2098-11-29T01:00:00.000Z') }, select: { id: true, title: true } });
    const schedules = await h.prisma.v1TeamSchedule.findMany({ where: { teamMatchId: sunday.id }, select: { title: true } });
    expect(schedules.map((schedule) => schedule.title)).toEqual([sunday.title, sunday.title]);

    // 끼운 경기를 1주차 일요일(11/15)로 옮기면 그 주가 사라져 뒤 주차가 다시 당겨진다.
    const moved = await http().patch(`/api/v1/admin/league-matches/${leagueId}/fixtures/${inserted.body.data.teamMatchId}`).set('x-v1-user-id', h.adminUserId)
      .send({ startsAt: '2098-11-15T01:00:00.000Z' });
    expect(moved.status).toBe(200);
    expect(await titlesByStart(leagueId)).toEqual(['2098-11-14 1주차', '2098-11-14 1주차', '2098-11-15 1주차', '2098-11-28 2주차', '2098-11-29 2주차']);

    // 운영자가 정한 제목(끝에 주차 토큰이 없는 이름)은 건드리지 않는다.
    const named = await http().post(`/api/v1/admin/league-matches/${leagueId}/fixtures/manual`).set('x-v1-user-id', h.adminUserId)
      .send({ ...pair(1, 2, '2098-11-07T01:00:00.000Z'), title: '개막 친선전' });
    expect(named.status).toBe(201);
    expect(await titlesByStart(leagueId)).toEqual([
      '2098-11-07 개막 친선전', '2098-11-14 2주차', '2098-11-14 2주차', '2098-11-15 2주차', '2098-11-28 3주차', '2098-11-29 3주차',
    ]);
  });

  it('묶음 중 한 경기라도 거부되면 아무 경기도 만들지 않는다', async () => {
    const outsider = await h.makeTeam('주차 밖 팀');
    const leagueId = await h.makeLeague({ teams, state: 'active' });
    const rejected = await batch(leagueId, [
      pair(0, 1, '2098-12-05T01:00:00.000Z'),
      { homeTeamId: teams[2].id, awayTeamId: outsider.id, startsAt: '2098-12-05T02:00:00.000Z' },
    ]);
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('LEAGUE_TEAM_INVALID');
    expect(await h.prisma.v1TeamMatch.count({ where: { leagueId } })).toBe(0);

    expect((await batch(leagueId, [])).status).toBe(400);
    expect((await batch(leagueId, Array.from({ length: 31 }, () => pair(0, 1, '2098-12-05T01:00:00.000Z')))).status).toBe(400);
  });
});
