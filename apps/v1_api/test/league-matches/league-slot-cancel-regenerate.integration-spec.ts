import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { NotificationsService } from '../../src/notifications/notifications.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('리그 경기 취소 — 빈 경기·자리 연결', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let notified: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lscr');
    notified = jest.spyOn(app.get(NotificationsService), 'emitToManyDeferred');
  });
  beforeEach(() => notified.mockClear());
  afterAll(async () => cleanup?.());

  const cancel = (leagueId: string, teamMatchId: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/${teamMatchId}/cancel`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ reason: '일정 조정' });
  const cancelNotices = () => notified.mock.calls.filter((call) => call[1] === 'league_fixture_cancelled');

  it('팀이 없는 빈 경기도 취소된다 — 알림은 보내지 않고 자리 연결은 풀린다', async () => {
    const leagueId = await h.makeLeague();
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });

    const res = await cancel(leagueId, teamMatchId);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', alreadyProcessed: false });
    expect(await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).toMatchObject({
      status: 'cancelled',
      homeSlotId: null,
      awaySlotId: null,
    });
    expect(cancelNotices()).toHaveLength(0);
  });

  it('반쪽만 찬 경기도 공개된 적이 없으니 팀에 취소 알림을 보내지 않는다', async () => {
    const teamA = await h.makeTeam('lscr-a');
    const leagueId = await h.makeLeague({ teams: [teamA] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: s1.id, awaySlotId: s2.id });

    expect((await cancel(leagueId, teamMatchId)).status).toBe(200);
    expect(cancelNotices()).toHaveLength(0);
  });

  it('대조군: 자리 없는 기존 경기는 지금처럼 양 팀에 취소 알림이 간다', async () => {
    const teamA = await h.makeTeam('lscr-b');
    const teamB = await h.makeTeam('lscr-c');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

    expect((await cancel(leagueId, teamMatchId)).status).toBe(200);
    expect(cancelNotices()).toHaveLength(2);
  });

  it('남은 빈 경기를 취소해 자리 경기가 모두 차면 리그가 진행 상태로 바뀐다', async () => {
    const teamA = await h.makeTeam('lscr-d');
    const teamB = await h.makeTeam('lscr-e');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id, homeSlotId: s1.id, awaySlotId: s2.id });
    const spare = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    expect((await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status).toBe('draft');

    expect((await cancel(leagueId, spare)).status).toBe(200);

    expect((await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status).toBe('in_progress');
  });

  it('이미 취소된 경기는 alreadyProcessed 로 응답하고 자리 연결·알림에 손대지 않는다', async () => {
    const leagueId = await h.makeLeague();
    const [s1, s2] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: s1.id, awaySlotId: s2.id });
    await cancel(leagueId, teamMatchId);
    const again = await cancel(leagueId, teamMatchId);
    expect(again.body.data).toMatchObject({ alreadyProcessed: true });
  });
});
