import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

const kstDates = (count: number) =>
  Array.from({ length: count }, (_, index) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + (index + 2) * 7 * 86_400_000)),
  );

describe('PUT /admin/tournament-slots/:slotId/assignment — 정규 리그 레인', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let supportUserId: string;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsal');
    supportUserId = await h.makeAdmin('support');
  });
  afterAll(async () => cleanup?.());

  /** 3팀 1회전 템플릿(자리 3 · 경기 3) 위에 참가팀 3개를 둔 리그. */
  async function templateLeague() {
    const teams: HarnessTeam[] = [await h.makeTeam('lsal-a'), await h.makeTeam('lsal-b'), await h.makeTeam('lsal-c')];
    const leagueId = await h.makeLeague({ teams });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
      .set('x-v1-user-id', h.adminUserId)
      .send({ teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } });
    expect(res.status).toBe(201);
    const slots = await h.prisma.v1TournamentSlot.findMany({ where: { tournamentId: leagueId }, orderBy: { position: 'asc' } });
    const regs = await Promise.all(teams.map((team) => h.registrationId(leagueId, team.id)));
    return { leagueId, teams, slots, regs };
  }
  const put = (slotId: string, registrationId: string | null, userId = h.adminUserId) =>
    request(app.getHttpServer())
      .put(`/api/v1/admin/tournament-slots/${slotId}/assignment`)
      .set('x-v1-user-id', userId)
      .send({ registrationId });
  const fixturesOf = (leagueId: string) => h.prisma.v1TeamMatch.findMany({ where: { leagueId }, orderBy: { id: 'asc' } });
  const statusOf = async (leagueId: string) =>
    (await h.prisma.v1Tournament.findUniqueOrThrow({ where: { id: leagueId } })).status;

  it('자리 하나에 팀을 넣으면 그 자리를 쓰는 경기 두 건에만 반영되고 나머지는 그대로다(반쪽이라 팀 일정은 아직 없다)', async () => {
    const { leagueId, teams, slots, regs } = await templateLeague();

    const res = await put(slots[0].id, regs[0]);

    expect(res.status).toBe(200);
    const using = (await fixturesOf(leagueId)).filter((f) => f.homeSlotId === slots[0].id || f.awaySlotId === slots[0].id);
    expect(res.body.data.affectedTeamMatchIds.sort()).toEqual(using.map((f) => f.id).sort());
    expect(using).toHaveLength(2);
    for (const fixture of using) {
      const teamIds = [fixture.hostTeamId, fixture.approvedApplicantTeamId];
      expect(teamIds.filter((id) => id === teams[0].id)).toHaveLength(1);
    }
    const untouched = (await fixturesOf(leagueId)).filter((f) => !using.includes(f));
    expect(untouched).toHaveLength(1);
    expect([untouched[0].hostTeamId, untouched[0].approvedApplicantTeamId]).toEqual([null, null]);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId } } })).toBe(0);
    expect(await statusOf(leagueId)).toBe('draft');
  });

  it('양쪽 자리가 모두 찬 경기부터 팀 일정·신청서가 생기고, 마지막 자리가 차면 리그가 진행 상태가 된다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    await put(slots[0].id, regs[0]);
    await put(slots[1].id, regs[1]);

    const both = (await fixturesOf(leagueId)).find(
      (f) => [f.homeSlotId, f.awaySlotId].includes(slots[0].id) && [f.homeSlotId, f.awaySlotId].includes(slots[1].id),
    );
    expect(both).toBeDefined();
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId: both!.id, state: 'SCHEDULED' } })).toBe(2);
    expect(await h.prisma.v1TeamMatchApplication.count({ where: { teamMatchId: both!.id, status: 'approved' } })).toBe(1);
    expect(await statusOf(leagueId)).toBe('draft');

    await put(slots[2].id, regs[2]);

    expect(await statusOf(leagueId)).toBe('in_progress');
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId }, state: 'SCHEDULED' } })).toBe(6);
  });

  it('자리를 비우면 그 경기들이 다시 미정으로 돌아가고 팀 일정이 취소된다 — 진행 상태는 되돌리지 않는다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    for (const [index, slot] of slots.entries()) await put(slot.id, regs[index]);
    expect(await statusOf(leagueId)).toBe('in_progress');

    const res = await put(slots[1].id, null);

    expect(res.status).toBe(200);
    const using = (await fixturesOf(leagueId)).filter((f) => f.homeSlotId === slots[1].id || f.awaySlotId === slots[1].id);
    expect(using).toHaveLength(2);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId: { in: using.map((f) => f.id) }, state: 'SCHEDULED' } })).toBe(0);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatch: { leagueId }, state: 'SCHEDULED' } })).toBe(2);
    expect(await statusOf(leagueId)).toBe('in_progress');
  });

  it('같은 자리를 C→B→C 로 바꿔도 신청서 유일 제약 오류 없이 원정 팀의 신청서만 approved 로 남는다', async () => {
    const { leagueId, teams, slots, regs } = await templateLeague();
    await put(slots[0].id, regs[0]);
    await put(slots[1].id, regs[1]);
    for (const reg of [regs[2], regs[1], regs[2]]) {
      expect((await put(slots[1].id, reg)).status).toBe(200);
    }
    const both = (await fixturesOf(leagueId)).find(
      (f) => [f.homeSlotId, f.awaySlotId].includes(slots[0].id) && [f.homeSlotId, f.awaySlotId].includes(slots[1].id),
    )!;
    // 자리 1이 이 경기의 원정이면 마지막 C 가, 홈이면 원정인 자리 0 의 A 가 승인 상태다.
    const awayTeam = both.awaySlotId === slots[1].id ? teams[2] : teams[0];
    const applications = await h.prisma.v1TeamMatchApplication.findMany({ where: { teamMatchId: both.id } });
    expect(applications.filter((row) => row.status === 'approved').map((row) => row.applicantTeamId)).toEqual([awayTeam.id]);
    expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: both.id } })).approvedApplicantTeamId).toBe(awayTeam.id);
  });

  it('이미 다른 자리에 있는 팀은 409 SLOT_TEAM_ALREADY_PLACED, 시작한 경기가 있으면 409 SLOT_LOCKED', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    await put(slots[0].id, regs[0]);
    const dup = await put(slots[1].id, regs[0]);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('SLOT_TEAM_ALREADY_PLACED');

    const using = (await fixturesOf(leagueId)).find((f) => f.homeSlotId === slots[0].id || f.awaySlotId === slots[0].id)!;
    await h.prisma.v1Game.update({ where: { teamMatchId: using.id }, data: { state: 'LIVE' } });
    const locked = await put(slots[0].id, regs[1]);
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('SLOT_LOCKED');
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBe(regs[0]);
  });

  it('취소된 경기는 자리를 쓰는 경기에서 빠진다 — 반영 대상도 잠금 판정도 아니다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    const target = (await fixturesOf(leagueId)).find((f) => f.homeSlotId === slots[0].id || f.awaySlotId === slots[0].id)!;
    // 시작한 경기라도 취소하면 자리 연결이 풀려 더는 이 자리의 경기가 아니다.
    await h.prisma.v1Game.update({ where: { teamMatchId: target.id }, data: { state: 'ENDED' } });
    await h.prisma.v1TeamMatch.update({ where: { id: target.id }, data: { status: 'cancelled', homeSlotId: null, awaySlotId: null } });

    const res = await put(slots[0].id, regs[0]);

    expect(res.status).toBe(200);
    expect(res.body.data.affectedTeamMatchIds).toHaveLength(1);
    expect(res.body.data.affectedTeamMatchIds).not.toContain(target.id);
  });

  it('보류 리그는 409 LEAGUE_ON_HOLD, support 어드민은 403 이고 자리는 바뀌지 않는다', async () => {
    const { leagueId, slots, regs } = await templateLeague();
    const denied = await put(slots[0].id, regs[0], supportUserId);
    expect(denied.status).toBe(403);
    await h.prisma.v1Tournament.update({ where: { id: leagueId }, data: { status: 'on_hold' } });
    const held = await put(slots[0].id, regs[0]);
    expect(held.status).toBe(409);
    expect(held.body.code).toBe('LEAGUE_ON_HOLD');
    expect((await h.prisma.v1TournamentSlot.findUniqueOrThrow({ where: { id: slots[0].id } })).registrationId).toBeNull();
  });
  describe('무작위 채우기 (POST /admin/tournaments/:id/slots/random-fill)', () => {
    const randomFill = (leagueId: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/admin/tournaments/${leagueId}/slots/random-fill`)
        .set('x-v1-user-id', h.adminUserId);

    it('참가팀 수 = 자리 수면 전부 채우고 중복 없이 배정하며 리그가 진행 상태가 된다', async () => {
      const { leagueId, slots, regs } = await templateLeague();
      const res = await randomFill(leagueId);
      expect(res.status).toBe(201);
      const assignments: Array<{ slotId: string; registrationId: string }> = res.body.data.assignments;
      expect(assignments).toHaveLength(3);
      expect(new Set(assignments.map((a) => a.slotId)).size).toBe(3);
      expect(assignments.map((a) => a.registrationId).sort()).toEqual([...regs].sort());
      expect(assignments.map((a) => a.slotId).sort()).toEqual(slots.map((slot) => slot.id).sort());
      expect(await statusOf(leagueId)).toBe('in_progress');
    });

    it('팀이 자리보다 적으면 팀 수만큼만 채우고 리그 상태는 그대로다', async () => {
      const teams: HarnessTeam[] = [await h.makeTeam('lsal-r1'), await h.makeTeam('lsal-r2')];
      const leagueId = await h.makeLeague({ teams });
      await request(app.getHttpServer())
        .post(`/api/v1/admin/league-matches/${leagueId}/fixtures/template`)
        .set('x-v1-user-id', h.adminUserId)
        .send({ teamCount: 3, legs: 1, schedule: { dates: kstDates(3), time: '19:00' } })
        .expect(201);

      const res = await randomFill(leagueId);

      expect(res.body.data.assignments).toHaveLength(2);
      expect(await h.prisma.v1TournamentSlot.count({ where: { tournamentId: leagueId, registrationId: null } })).toBe(1);
      expect(await statusOf(leagueId)).toBe('draft');
    });
  });
});
