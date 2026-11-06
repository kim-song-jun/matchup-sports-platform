import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { projectCanonicalAdvancement } from '../../src/game-operations/tournament-team-match-advancement';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { SixTeamService } from '../../src/tournaments/six-team/six-team.service';
import { parseSixTeamState } from '../../src/tournaments/six-team/six-team-state';
import { TOURNAMENT_DETAIL_INCLUDE } from '../../src/tournaments/tournaments-read.query';
import { presentTournamentDetail } from '../../src/tournaments/tournament-detail.presenter';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';
import {
  competitionConfigFixture as ids,
  seedCompetitionConfigFixture,
} from '../fixtures/competition-config.fixture';

jest.setTimeout(90000);
const prisma = new PrismaService();
const user = {
  id: ids.adminUserId,
  email: 'six@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const admin = new AdminContextService(prisma);
const games = new GamesService(
  prisma,
  new OperationAuditWriterService(),
  new GameTakeoverService(),
  new TournamentStaffAccessService(prisma)
);
const templates = new BracketTemplateService(prisma, admin, games);
const decisions = new SixTeamService(prisma, admin);
async function create(label: string) {
  const seeded = await seedBracketTournament(prisma, {
    label,
    format: 'knockout',
    teamCount: 6,
  });
  await prisma.v1Tournament.update({
    where: { id: seeded.tournamentId },
    data: { teamCount: 6 },
  });
  const input = {
    schemaVersion: 2 as const,
    kind: 'knockout' as const,
    size: 6,
    participantCount: 6,
    sixTeamMode: true,
    registrationIds: seeded.registrationIds,
  };
  const preview = await templates.preview(user, seeded.tournamentId, input);
  await templates.apply(user, seeded.tournamentId, {
    ...input,
    previewHash: preview.previewHash,
    requestId: label,
  });
  const row = await prisma.v1Tournament.findUniqueOrThrow({
    where: { id: seeded.tournamentId },
  });
  return { ...seeded, state: parseSixTeamState(row.sixTeamBracket)! };
}
async function official(
  fixtureId: string,
  score: { home: number; away: number },
  revisionNumber = 1
) {
  const game = await prisma.v1Game.findUniqueOrThrow({
    where: { teamMatchId: fixtureId },
  });
  await prisma.$transaction(async (tx) => {
    const revision = await tx.v1GameResultRevision.create({
      data: {
        gameId: game.id,
        revision: revisionNumber,
        state: 'DRAFT',
        score,
        eventsHash: `six-${game.id}-${revisionNumber}`,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'TEST_FIXTURE',
      },
    });
    await tx.v1GameResultRevision.update({
      where: { id: revision.id },
      data: { state: 'OFFICIAL', officialAt: new Date() },
    });
    await tx.v1Game.update({
      where: { id: game.id },
      data: { state: 'ENDED', currentOfficialRevisionId: revision.id },
    });
    await tx.v1TeamMatch.update({
      where: { id: fixtureId },
      data: { status: 'completed' },
    });
    const details = await tx.v1TournamentMatchDetails.findUniqueOrThrow({
      where: { teamMatchId: fixtureId },
    });
    const match = await tx.v1TeamMatch.findUniqueOrThrow({
      where: { id: fixtureId },
    });
    await projectCanonicalAdvancement(
      tx,
      {
        revisionId: revision.id,
        gameId: game.id,
        revision: revisionNumber,
        score,
        sourceHash: revision.eventsHash,
        playedAt: new Date(),
        officialAt: new Date(),
        reason: null,
        outcomeReason: 'NORMAL',
        sourceType: 'TEAM_MATCH',
        currentOfficialRevisionId: revision.id,
        teamMatchId: fixtureId,
        tournamentTeamMatchId: fixtureId,
        leagueId: null,
        teamMatchTournamentId: details.tournamentId,
        tournamentId: details.tournamentId,
        homeTeamId: match.hostTeamId,
        awayTeamId: match.approvedApplicantTeamId,
        visibility: 'LIVE',
      },
      score
    );
  });
}
describe('6강 실제 저장·진출·정정', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  it('5경기 생성 → 자동 직행 → 수동 변경 → 준결승 승자 결승 배정, 실제 게임 사이드도 일치한다', async () => {
    const { tournamentId, state, registrationIds } = await create('six-flow');
    expect(
      await prisma.v1Game.count({ where: { teamMatch: { tournamentId } } })
    ).toBe(5);
    await official(state.rounds[0], { home: 5, away: 4 });
    await official(state.rounds[1], { home: 4, away: 0 });
    expect((await decisions.preview(user, tournamentId)).state.bye).toBeNull();
    await official(state.rounds[2], { home: 2, away: 0 });
    const preview = await decisions.preview(user, tournamentId);
    expect(preview.state.bye).toBe(registrationIds[0]);
    const changed = await decisions.decide(user, tournamentId, {
      version: preview.version,
      manual: true,
      bye: registrationIds[2],
      winners: {},
      reason: '현장 운영 결정',
    });
    expect(changed.state.bye).toBe(registrationIds[2]);
    const semi = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({
      where: { teamMatchId: state.rounds[3] },
      include: {
        teamMatch: { include: { game: { include: { sides: true } } } },
      },
    });
    expect([semi.homeRegistrationId, semi.awayRegistrationId]).toEqual([
      registrationIds[0],
      registrationIds[4],
    ]);
    const homeReg = await prisma.v1TournamentRegistration.findUniqueOrThrow({
      where: { id: registrationIds[0] },
    });
    expect(
      semi.teamMatch.game!.sides.find((side) => side.sideKey === 'HOME')?.teamId
    ).toBe(homeReg.teamId);
    await official(state.rounds[3], { home: 1, away: 0 });
    const final = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({
      where: { teamMatchId: state.rounds[4] },
    });
    expect([final.homeRegistrationId, final.awayRegistrationId]).toEqual([
      registrationIds[2],
      registrationIds[0],
    ]);
    expect(
      await prisma.v1Game.count({ where: { teamMatch: { tournamentId } } })
    ).toBe(5);
    await prisma.v1Tournament.update({
      where: { id: tournamentId },
      data: { bracketPublishedAt: new Date() },
    });
    const publicRow = await prisma.v1Tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      include: TOURNAMENT_DETAIL_INCLUDE,
    });
    const view = presentTournamentDetail(publicRow, true);
    expect(view.sixTeamBracket).toMatchObject({
      bye: registrationIds[2],
      manual: true,
    });
    expect(JSON.stringify(view.sixTeamBracket)).not.toContain('현장 운영 결정');
  });
  it('완전 동률이면 대기하고, 이미 시작한 준결승 배정 변경은 원자적으로 거절한다', async () => {
    const { tournamentId, state, registrationIds } = await create('six-tie');
    for (const id of state.rounds.slice(0, 3))
      await official(id, { home: 2, away: 1 });
    const preview = await decisions.preview(user, tournamentId);
    expect(preview.state.bye).toBeNull();
    await decisions.decide(user, tournamentId, {
      version: preview.version,
      manual: true,
      bye: registrationIds[0],
      winners: {},
      reason: '동률 지정',
    });
    const game = await prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId: state.rounds[3] },
    });
    await prisma.v1Game.update({
      where: { id: game.id },
      data: { state: 'LIVE' },
    });
    const before = await decisions.preview(user, tournamentId);
    await expect(
      decisions.decide(user, tournamentId, {
        version: before.version,
        manual: true,
        bye: registrationIds[2],
        winners: {},
        reason: '직행 변경',
      })
    ).rejects.toMatchObject({ response: { code: 'NEXT_FIXTURE_CONFLICT' } });
    expect((await decisions.preview(user, tournamentId)).state.bye).toBe(
      registrationIds[0]
    );
  });
  it('수동 선정 후 6강 결과 정정은 기존 배정을 덮어쓰지 않고 재검토를 표시한다', async () => {
    const { tournamentId, state, registrationIds } = await create(
      'six-correction'
    );
    for (const id of state.rounds.slice(0, 3))
      await official(id, { home: 2, away: 1 });
    const before = await decisions.preview(user, tournamentId);
    await decisions.decide(user, tournamentId, {
      version: before.version,
      manual: true,
      bye: registrationIds[0],
      winners: {},
      reason: '직행 확정',
    });
    await official(state.rounds[0], { home: 3, away: 1 }, 2);
    expect((await decisions.preview(user, tournamentId)).state).toMatchObject({
      bye: registrationIds[0],
      manual: true,
      needsReview: true,
    });
  });

  it('자동 선정은 공식 정정을 반영하고 전용 5경기의 개별 삭제·추가는 막는다', async () => {
    const { tournamentId, state, registrationIds } = await create(
      'six-auto-correct'
    );
    await official(state.rounds[0], { home: 5, away: 1 });
    await official(state.rounds[1], { home: 4, away: 0 });
    await official(state.rounds[2], { home: 2, away: 0 });
    await official(state.rounds[0], { home: 3, away: 1 }, 2);
    const after = await decisions.preview(user, tournamentId);
    expect(after.state).toMatchObject({
      bye: registrationIds[2],
      manual: false,
    });
    const bracket = new TournamentBracketService(prisma, admin, games);
    await expect(
      bracket.createFixture(user, tournamentId, {
        round: '추가',
        fixtureNumber: 6,
      })
    ).rejects.toMatchObject({
      response: { code: 'SIX_TEAM_STRUCTURE_LOCKED' },
    });
    await expect(
      bracket.deleteFixture(user, state.rounds[4])
    ).rejects.toMatchObject({
      response: { code: 'SIX_TEAM_STRUCTURE_LOCKED' },
    });
    const changed = await decisions.decide(user, tournamentId, {
      version: after.version,
      reason: '결승 방향 조정',
      manual: false,
      winners: {},
      swapFinal: true,
    });
    expect(changed.state.swapFinal).toBe(true);
    const final = await prisma.v1TournamentMatchDetails.findUniqueOrThrow({
      where: { teamMatchId: state.rounds[4] },
    });
    expect(final.awayRegistrationId).toBe(registrationIds[2]);
  });
});
