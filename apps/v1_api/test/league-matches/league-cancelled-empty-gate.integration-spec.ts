import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

/** 팀이 한 번도 안 찬 템플릿 경기를 취소하면 자리 id 가 지워진다 — 그래도 공개 읽기가 500 으로 깨지면 안 된다. */
describe('팀 없이 취소된 리그 경기의 공개 게이트', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lceg');
  });
  afterAll(async () => cleanup?.());

  const adminPost = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1/admin/league-matches/${path}`).set('x-v1-user-id', h.adminUserId).send(body);
  const template = (leagueId: string, extra: object = {}) =>
    adminPost(`${leagueId}/fixtures/template`, { teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' }, ...extra });
  const publicDetail = (leagueId: string) => request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}`);
  const publicStandings = (leagueId: string) => request(app.getHttpServer()).get(`/api/v1/league-matches/${leagueId}/standings`);
  const detailFixtureIds = (res: request.Response): string[] =>
    res.body.data.fixtures.map((fixture: { teamMatchId: string }) => fixture.teamMatchId);
  /** 공개 상세는 draft 를 숨기므로 템플릿으로 만든 뒤 진행 중으로 바꾼다. */
  const publish = (leagueId: string) =>
    h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'in_progress' } });

  it('빈 템플릿 경기 하나를 취소해도 상세·순위표가 200 이고 그 경기는 빠진다', async () => {
    const leagueId = await h.makeLeague();
    expect((await template(leagueId)).status).toBe(201);
    const [victim, ...rest] = await h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
    expect((await adminPost(`${leagueId}/fixtures/${victim.id}/cancel`, { reason: '일정 조정' })).status).toBe(200);
    await publish(leagueId);

    const row = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: victim.id } });
    expect([row.status, row.homeSlotId, row.hostTeamId]).toEqual(['cancelled', null, null]);
    const detail = await publicDetail(leagueId);
    expect(detail.status).toBe(200);
    expect(detailFixtureIds(detail)).not.toContain(victim.id);
    // 나머지 빈 템플릿 경기는 원래대로 게이트에 가려져 있다.
    expect(rest.length).toBeGreaterThan(0);
    expect(detailFixtureIds(detail)).toEqual([]);
    expect((await publicStandings(leagueId)).status).toBe(200);
  });

  it('replaceExisting 으로 템플릿을 갈아도 상세·순위표가 200 이다', async () => {
    const leagueId = await h.makeLeague();
    expect((await template(leagueId)).status).toBe(201);
    const first = (await h.prisma.v1TeamMatch.findMany({ where: { leagueId }, select: { id: true } })).map((f) => f.id);
    expect((await template(leagueId, { teamCount: 4, replaceExisting: true })).status).toBe(201);
    await publish(leagueId);

    expect(await h.prisma.v1TeamMatch.count({ where: { id: { in: first }, status: 'cancelled', hostTeamId: null } })).toBe(first.length);
    const detail = await publicDetail(leagueId);
    expect(detail.status).toBe(200);
    expect(detailFixtureIds(detail).filter((id) => first.includes(id))).toEqual([]);
    expect((await publicStandings(leagueId)).status).toBe(200);
  });

  it('홈 자리만 찬 반쪽 경기를 취소하면 공개에 나타나지 않고, 템플릿 replaceExisting 으로 접어도 같다', async () => {
    const teamA = await h.makeTeam('lceg-HA');
    const leagueId = await h.makeLeague({ teams: [teamA], state: 'active' });
    const [homeSlot, awaySlot] = await h.makeSlots(leagueId, 2);
    const half = await h.createFixture(leagueId, { homeTeamId: teamA.id, homeSlotId: homeSlot.id, awaySlotId: awaySlot.id });
    expect((await adminPost(`${leagueId}/fixtures/${half}/cancel`, { reason: '일정 조정' })).status).toBe(200);

    const row = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: half } });
    expect([row.status, row.hostTeamId, row.awaySlotId]).toEqual(['cancelled', null, null]);
    const detail = await publicDetail(leagueId);
    expect(detail.status).toBe(200);
    expect(detailFixtureIds(detail)).not.toContain(half);

    // 실제 운영 경로로 반쪽 경기를 만든다: 확정 참가팀을 첫 경기의 홈 자리에 배정한다.
    const teamB = await h.makeTeam('lceg-HB');
    const folded = await h.makeLeague({ teams: [teamB] });
    expect((await template(folded)).status).toBe(201);
    const [halfFolded] = await h.prisma.v1TeamMatch.findMany({ where: { leagueId: folded }, orderBy: { id: 'asc' } });
    const assign = await request(app.getHttpServer())
      .put(`/api/v1/admin/tournament-slots/${halfFolded.homeSlotId}/assignment`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ registrationId: await h.registrationId(folded, teamB.id) });
    expect(assign.status).toBe(200);
    const before = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: halfFolded.id } });
    expect([before.hostTeamId, before.approvedApplicantTeamId]).toEqual([teamB.id, null]);
    expect(before.homeSlotId).not.toBe(before.awaySlotId);

    expect((await template(folded, { teamCount: 4, replaceExisting: true })).status).toBe(201);
    await publish(folded);
    const foldedRow = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: halfFolded.id } });
    expect([foldedRow.status, foldedRow.hostTeamId, foldedRow.approvedApplicantTeamId]).toEqual(['cancelled', null, null]);
    expect(detailFixtureIds(await publicDetail(folded))).not.toContain(halfFolded.id);
  });

  it('대조군: 팀이 있는 취소 경기와 자리 없는 기존 경기는 계속 보인다', async () => {
    const teamA = await h.makeTeam('lceg-A');
    const teamB = await h.makeTeam('lceg-B');
    const teamC = await h.makeTeam('lceg-C');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB, teamC], state: 'active' });
    const withTeams = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    const legacy = await h.createFixture(leagueId, { homeTeamId: teamC.id });
    expect((await adminPost(`${leagueId}/fixtures/${withTeams}/cancel`, { reason: '일정 조정' })).status).toBe(200);

    const detail = await publicDetail(leagueId);
    expect(detail.status).toBe(200);
    const byId = new Map<string, { status: string }>(
      detail.body.data.fixtures.map((fixture: { teamMatchId: string; status: string }) => [fixture.teamMatchId, fixture]),
    );
    expect(byId.get(withTeams)?.status).toBe('cancelled');
    expect(byId.has(legacy)).toBe(true);
    expect((await publicStandings(leagueId)).status).toBe(200);
  });
});
