import type { INestApplication } from '@nestjs/common';
import { assignLeagueFixtureSideInTx } from '../../src/league-matches/league-fixture-side-assignment';
import { drainOutboxWorker } from '../helpers/drain-outbox-worker';
import { createV1IntegrationApp } from '../integration/integration-app';
import { createLeagueSlotHarness, type HarnessTeam, type LeagueSlotHarness } from './helpers/league-slot-harness';

describe('assignLeagueFixtureSideInTx — 리그 빈 경기에 팀 넣기/빼기', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;
  let h: LeagueSlotHarness;
  let teamA: HarnessTeam;
  let teamB: HarnessTeam;
  let teamC: HarnessTeam;

  beforeAll(async () => {
    ({ app, cleanup } = await createV1IntegrationApp());
    h = await createLeagueSlotHarness(app, 'lfsa');
    [teamA, teamB, teamC] = [await h.makeTeam('lfsa-a'), await h.makeTeam('lfsa-b'), await h.makeTeam('lfsa-c')];
  });
  afterAll(async () => cleanup?.());

  const assign = (teamMatchId: string, side: 'HOME' | 'AWAY', registrationId: string | null) =>
    h.prisma.$transaction((tx) => assignLeagueFixtureSideInTx(tx, { games: h.games }, h.admin, { teamMatchId, side, registrationId }));

  async function emptyFixture() {
    const leagueId = await h.makeLeague({ teams: [teamA, teamB, teamC] });
    const [home, away] = await h.makeSlots(leagueId, 2);
    const teamMatchId = await h.createFixture(leagueId, { homeSlotId: home.id, awaySlotId: away.id });
    const reg = {
      a: await h.registrationId(leagueId, teamA.id),
      b: await h.registrationId(leagueId, teamB.id),
      c: await h.registrationId(leagueId, teamC.id),
    };
    return { leagueId, teamMatchId, reg };
  }
  const schedules = (teamMatchId: string) =>
    h.prisma.v1TeamSchedule.findMany({ where: { teamMatchId }, select: { teamId: true, state: true } });
  const sideOf = async (teamMatchId: string, sideKey: 'HOME' | 'AWAY') => {
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    return h.prisma.v1GameSide.findUniqueOrThrow({ where: { gameId_sideKey: { gameId: game.id, sideKey } } });
  };

  it('한쪽만 채우면 사이드는 바뀌지만 팀 일정과 신청서는 아직 없다(반쪽 경기)', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);

    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch).toMatchObject({ hostTeamId: teamA.id, approvedApplicantTeamId: null, status: 'matched' });
    expect(await sideOf(teamMatchId, 'HOME')).toMatchObject({ teamId: teamA.id, displayNameSnapshot: teamA.name });
    expect(await sideOf(teamMatchId, 'AWAY')).toMatchObject({ teamId: null, displayNameSnapshot: '어웨이 팀 미정' });
    expect(await schedules(teamMatchId)).toEqual([]);
    expect(await h.prisma.v1TeamMatchApplication.count({ where: { teamMatchId } })).toBe(0);
  });

  it('양쪽이 모두 차는 순간 팀 일정 2건 + 승인 신청서가 생기고, 명단은 이벤트 처리 뒤 채워진다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);

    expect((await schedules(teamMatchId)).map((row) => [row.teamId, row.state]).sort()).toEqual(
      [[teamA.id, 'SCHEDULED'], [teamB.id, 'SCHEDULED']].sort(),
    );
    expect(
      await h.prisma.v1TeamMatchApplication.findUniqueOrThrow({
        where: { teamMatchId_applicantTeamId: { teamMatchId, applicantTeamId: teamB.id } },
      }),
    ).toMatchObject({ status: 'approved', message: '리그 대진 편성', reviewedByUserId: h.adminUserId });

    await drainOutboxWorker(h.prisma);
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId }, include: { participants: true } });
    // 팀원이 팀장 한 명뿐인 하네스 팀이라 참가자는 팀당 1명이다 — 0이면 명단 재계산 이벤트가 안 만들어진 것이다.
    expect(game.participants.length).toBeGreaterThanOrEqual(2);
  });

  it('한쪽을 비우면 팀 일정 두 건이 모두 취소되고 신청서는 withdrawn 이 된다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);
    await assign(teamMatchId, 'AWAY', null);

    expect((await schedules(teamMatchId)).every((row) => row.state === 'CANCELLED')).toBe(true);
    expect(await schedules(teamMatchId)).toHaveLength(2);
    expect(
      await h.prisma.v1TeamMatchApplication.findUniqueOrThrow({
        where: { teamMatchId_applicantTeamId: { teamMatchId, applicantTeamId: teamB.id } },
      }),
    ).toMatchObject({ status: 'withdrawn' });
    expect(await sideOf(teamMatchId, 'AWAY')).toMatchObject({ teamId: null, displayNameSnapshot: '어웨이 팀 미정' });
  });

  it('원정 A→B→A 교체에서도 유일 제약 위반 없이 최종 팀만 approved 다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.c);
    await assign(teamMatchId, 'AWAY', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);
    await assign(teamMatchId, 'AWAY', reg.a);

    const applications = await h.prisma.v1TeamMatchApplication.findMany({ where: { teamMatchId } });
    expect(applications.map((row) => [row.applicantTeamId, row.status]).sort()).toEqual(
      [[teamA.id, 'approved'], [teamB.id, 'withdrawn']].sort(),
    );
    const live = (await schedules(teamMatchId)).filter((row) => row.state === 'SCHEDULED');
    expect(live.map((row) => row.teamId).sort()).toEqual([teamA.id, teamC.id].sort());
  });

  it('팀을 바꾸면 이전 팀의 라인업이 무효화되고 활성 명단 조정이 시스템 회수된다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await assign(teamMatchId, 'AWAY', reg.b);
    await drainOutboxWorker(h.prisma);
    const game = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    const awaySide = await sideOf(teamMatchId, 'AWAY');
    await h.prisma.v1GameRosterAdjustment.create({
      data: {
        gameId: game.id, sideId: awaySide.id, teamId: teamB.id, userId: h.adminUserId,
        action: 'EXCLUDE', actorUserId: h.adminUserId, actorRole: 'ADMIN',
      },
    });

    await assign(teamMatchId, 'AWAY', reg.c);

    const adjustments = await h.prisma.v1GameRosterAdjustment.findMany({ where: { gameId: game.id, sideId: awaySide.id } });
    expect(adjustments.every((row) => row.revokedAt !== null && row.revokedByRole === 'SYSTEM')).toBe(true);
    const invalidated = await h.prisma.v1GameLineup.count({
      where: { gameId: game.id, sideId: awaySide.id, invalidationReason: 'SIDE_TEAM_CHANGED' },
    });
    expect(invalidated).toBeGreaterThan(0);
  });

  it('같은 팀을 양쪽에 넣으면 400, 확정되지 않은 등록은 400 이고 아무것도 바뀌지 않는다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await expect(assign(teamMatchId, 'AWAY', reg.a)).rejects.toMatchObject({ response: { code: 'FIXTURE_SAME_TEAM' } });
    const otherLeague = await h.makeLeague({ teams: [teamB] });
    const foreignReg = await h.registrationId(otherLeague, teamB.id);
    await expect(assign(teamMatchId, 'AWAY', foreignReg)).rejects.toMatchObject({ response: { code: 'REGISTRATION_INVALID' } });
    const teamMatch = await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } });
    expect(teamMatch.approvedApplicantTeamId).toBeNull();
  });

  it('경기가 시작됐거나 공식 결과가 있으면 팀을 바꿀 수 없다(FIXTURE_HAS_RESULT)', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    await h.prisma.v1Game.update({ where: { teamMatchId }, data: { state: 'LIVE' } });
    await expect(assign(teamMatchId, 'HOME', reg.b)).rejects.toMatchObject({ response: { code: 'FIXTURE_HAS_RESULT' } });
    expect((await h.prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: teamMatchId } })).hostTeamId).toBe(teamA.id);
  });

  it('같은 값을 다시 넣으면 아무 일도 하지 않는다(멱등) — 게임 버전이 올라가지 않는다', async () => {
    const { teamMatchId, reg } = await emptyFixture();
    await assign(teamMatchId, 'HOME', reg.a);
    const before = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    await assign(teamMatchId, 'HOME', reg.a);
    const after = await h.prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId } });
    expect(after.version).toBe(before.version);
  });
});
