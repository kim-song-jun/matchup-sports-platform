import type { INestApplication } from '@nestjs/common';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('createLeagueFixture — 팀 null + 자리 id', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lsfc');
  });
  afterAll(async () => cleanup?.());

  it('두 사이드가 모두 비면 팀 일정·참가자·신청서 없이 matched 경기와 "미정" 사이드가 생긴다', async () => {
    const leagueId = await h.makeLeague();
    const [slotA, slotB] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: slotA.id, awaySlotId: slotB.id });

    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch).toMatchObject({
      hostTeamId: null,
      approvedApplicantTeamId: null,
      status: 'matched',
      homeSlotId: slotA.id,
      awaySlotId: slotB.id,
      leagueId,
      tournamentId: leagueId,
    });
    const game = await h.prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId },
      include: { sides: { orderBy: { sideKey: 'asc' } }, participants: true },
    });
    expect(game.sides.map((side) => [side.sideKey, side.teamId, side.displayNameSnapshot])).toEqual([
      ['AWAY', null, '어웨이 팀 미정'],
      ['HOME', null, '홈 팀 미정'],
    ]);
    expect(game.participants).toHaveLength(0);
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId } })).toBe(0);
    expect(await h.prisma.v1TeamMatchApplication.count({ where: { teamMatchId } })).toBe(0);
    // 결과 입력 리마인더는 시작 시각만 있으면 예약된다 — 발화 시점에 팀이 비어 있으면 건너뛴다(Task 16).
    const reminders = await h.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_outbox_events WHERE aggregate_id = ${teamMatchId} AND type = 'LEAGUE_RESULT_ENTRY_REMINDER'`;
    expect(reminders).toHaveLength(1);
  });

  it('양 팀이 모두 정해지면 기존과 같다 — 팀 일정 2건 + 승인 신청서 + 자리 연결', async () => {
    const teamA = await h.makeTeam('lsfc-a');
    const teamB = await h.makeTeam('lsfc-b');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const [slotA, slotB] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, {
      homeTeamId: teamA.id,
      awayTeamId: teamB.id,
      homeSlotId: slotA.id,
      awaySlotId: slotB.id,
    });

    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId, state: 'SCHEDULED' } })).toBe(2);
    const application = await h.prisma.v1TeamMatchApplication.findUniqueOrThrow({
      where: { teamMatchId_applicantTeamId: { teamMatchId, applicantTeamId: teamB.id } },
    });
    expect(application).toMatchObject({ status: 'approved', message: '리그 대진 편성' });
    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch).toMatchObject({ hostTeamId: teamA.id, approvedApplicantTeamId: teamB.id, homeSlotId: slotA.id });
  });

  it('대조군: 자리 id 를 주지 않으면 자리 컬럼은 null 이고 일반 대진처럼 동작한다', async () => {
    const teamA = await h.makeTeam('lsfc-c');
    const teamB = await h.makeTeam('lsfc-d');
    const leagueId = await h.makeLeague({ teams: [teamA, teamB] });
    const teamMatchId = await h.createFixture(leagueId, { homeTeamId: teamA.id, awayTeamId: teamB.id });
    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch.homeSlotId).toBeNull();
    expect(teamMatch.awaySlotId).toBeNull();
    expect(await h.prisma.v1TeamSchedule.count({ where: { teamMatchId } })).toBe(2);
  });
});
