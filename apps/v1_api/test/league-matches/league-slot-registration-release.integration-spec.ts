import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { NotificationsService } from '../../src/notifications/notifications.service';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

describe('등록이 confirmed 를 벗어날 때 자리 해제', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let notified: jest.SpyInstance;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsrr');
    notified = jest.spyOn(app.get(NotificationsService), 'emitToManyDeferred');
  });
  beforeEach(() => notified.mockClear());
  afterAll(async () => cleanup?.());

  /** 3팀 템플릿 리그에서 자리 0←A, 1←B, 2←C 로 모두 채운 상태. */
  async function filledLeague() {
    const teams: HarnessTeam[] = [await h.makeTeam('lsrr-a'), await h.makeTeam('lsrr-b'), await h.makeTeam('lsrr-c')];
    const leagueId = await h.makeLeague({ teams });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
    const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId }, orderBy: { position: 'asc' } });
    const regs = await Promise.all(teams.map((team) => h.registrationId(leagueId, team.id)));
    for (const [index, slot] of slots.entries()) {
      await request(app.getHttpServer())
        .put(`/api/v1/admin/tournament-slots/${slot.id}/assignment`)
        .set('x-v1-user-id', h.adminUserId)
        .send({ registrationId: regs[index] })
        .expect(200);
    }
    return { leagueId, teams, slots, regs };
  }
  const removeTeam = (leagueId: string, teamId: string) =>
    request(app.getHttpServer()).delete(`/api/v1/admin/league-matches/${leagueId}/teams/${teamId}`).set('x-v1-user-id', h.adminUserId);
  const cancelRegistration = (registrationId: string) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/registrations/${registrationId}/cancel`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ reason: '참가 취소' });
  const usingSlot = (leagueId: string, slotId: string) =>
    h.prisma.v1TeamMatch.findMany({ where: { leagueId, OR: [{ homeSlotId: slotId }, { awaySlotId: slotId }] } });

  it('참가팀 제외: 시작 전 자리 경기는 취소하지 않고 자리만 비운다 — 팀 일정은 취소, 상대 팀 자리는 그대로', async () => {
    const { leagueId, teams, slots, regs } = await filledLeague();
    const before = await usingSlot(leagueId, slots[0].id);

    const res = await removeTeam(leagueId, teams[0].id);

    expect(res.status).toBe(200);
    expect(res.body.data.cancelledFixtureCount).toBe(0);
    const after = await usingSlot(leagueId, slots[0].id);
    expect(after.map((f) => f.id).sort()).toEqual(before.map((f) => f.id).sort());
    expect(after.every((f) => f.status === 'matched')).toBe(true);
    expect(after.every((f) => f.hostTeamId !== teams[0].id && f.approvedApplicantTeamId !== teams[0].id)).toBe(true);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBeNull();
    expect((await h.prisma.v1TournamentRegistration.findUniqueOrThrow({ where: { id: regs[0] } })).status).toBe('cancelled');
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId: { in: after.map((f) => f.id) }, state: 'SCHEDULED' } })).toBe(0);
    // 대조군: A 가 없는 경기(자리 1 ↔ 2)는 그대로 양 팀이 차 있다.
    const rest = (await h.prisma.v1TeamMatch.findMany({ where: { leagueId } })).filter((f) => !after.some((a) => a.id === f.id));
    expect(rest).toHaveLength(1);
    expect(rest[0].hostTeamId).not.toBeNull();
    expect(rest[0].approvedApplicantTeamId).not.toBeNull();
  });

  it('참가팀 제외: 그 자리의 경기가 하나라도 시작됐으면 자리를 그대로 두고 그 팀의 경기는 기존대로 취소한다', async () => {
    const { leagueId, teams, slots, regs } = await filledLeague();
    const using = await usingSlot(leagueId, slots[0].id);
    await h.prisma.v1Game.update({ where: { teamMatchId: using[0].id }, data: { state: 'ENDED' } });

    const res = await removeTeam(leagueId, teams[0].id);

    expect(res.status).toBe(200);
    expect(res.body.data.cancelledFixtureCount).toBe(2);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBe(regs[0]);
    expect(await h.prisma.v1TeamMatch.count({ where: { id: { in: using.map((f) => f.id) }, status: 'cancelled' } })).toBe(2);
  });

  it('대조군: 자리 없는 기존 경기는 지금처럼 취소되고 양 팀에 알림이 간다', async () => {
    const teamA = await h.makeTeam('lsrr-l1');
    const teamB = await h.makeTeam('lsrr-l2');
    const teamC = await h.makeTeam('lsrr-l3');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB, teamC] });
    const fixtureId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });

    const res = await removeTeam(leagueId, teamA.id);

    expect(res.body.data.cancelledFixtureCount).toBe(1);
    expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: fixtureId } })).status).toBe('cancelled');
    expect(notified.mock.calls.filter((call) => call[1] === 'league_fixture_cancelled')).toHaveLength(2);
  });

  it('어드민 등록 취소(참가 취소 요청 승인 포함)도 시작 전이면 자리를 비우고, 시작됐으면 자리를 그대로 둔다', async () => {
    const { leagueId, slots, regs } = await filledLeague();
    expect((await cancelRegistration(regs[1])).status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[1].id } })).registrationId).toBeNull();
    expect((await usingSlot(leagueId, slots[1].id)).every((f) => f.status === 'matched')).toBe(true);

    const startedUsing = await usingSlot(leagueId, slots[2].id);
    await h.prisma.v1Game.update({ where: { teamMatchId: startedUsing[0].id }, data: { state: 'LIVE' } });
    expect((await cancelRegistration(regs[2])).status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[2].id } })).registrationId).toBe(regs[2]);
  });

  it('끝난 리그에서도 등록 취소의 자리 해제는 대진 생성 가드(LEAGUE_ENDED)에 막히지 않는다', async () => {
    const { leagueId, slots, regs } = await filledLeague();
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'completed' } });

    expect((await cancelRegistration(regs[1])).status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[1].id } })).registrationId).toBeNull();
  });

  it('보류 리그에서도 참가팀 제외는 지금처럼 된다 — 자리 해제가 대진 생성 가드(LEAGUE_ON_HOLD)에 막히지 않는다', async () => {
    const { leagueId, teams, slots } = await filledLeague();
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'on_hold' } });

    const res = await removeTeam(leagueId, teams[0].id);

    expect(res.status).toBe(200);
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBeNull();
  });
});
