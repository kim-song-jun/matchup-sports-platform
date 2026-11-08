import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { TournamentsAdminService } from '../../src/tournaments/tournaments-admin.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(60_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'tie-break-order@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService(), new TournamentStaffAccessService(prisma));
const adminContext = new AdminContextService(prisma);
const templates = new BracketTemplateService(prisma, adminContext, games);
const admin = new TournamentsAdminService(prisma, adminContext, {} as NotificationsService);

const DEFAULT_ORDER = ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw'];
const GOALS_FIRST = ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw'];
const FAIR_PLAY_FIRST = ['points', 'fair_play', 'head_to_head', 'goal_difference', 'goals_for', 'seeded_draw'];

async function versionOf(tournamentId: string) {
  return (await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { updatedAt: true } })).updatedAt.toISOString();
}

/** 확정 결과 하나를 직접 만든다 — 결과 입력 경로가 아니라 "결과가 생겼다" 는 전제가 필요하다. */
async function settleFirstFixture(tournamentId: string, stage: 'group' | 'knockout') {
  const detail = await prisma.v1TournamentMatchDetails.findFirstOrThrow({
    where: { tournamentId, group: { is: { phase: stage === 'group' ? 'group' : { not: 'group' } } } },
  });
  const game = await prisma.v1Game.findFirstOrThrow({ where: { teamMatchId: detail.teamMatchId } });
  const revision = await prisma.v1GameResultRevision.create({
    data: { gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 1, away: 0 }, eventsHash: `tie-break-${tournamentId}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' },
  });
  await prisma.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date('2026-01-01T00:00:00.000Z') } });
  await prisma.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
  await prisma.v1TeamMatch.update({ where: { id: detail.teamMatchId }, data: { status: 'completed' } });
}

async function seedGroupTournament(label: string) {
  const seeded = await seedBracketTournament(prisma, { label, format: 'group_knockout', teamCount: 6 });
  await templates.apply(user, seeded.tournamentId, { kind: 'group_knockout', groupCount: 2, teamsPerGroup: 3, advancePerGroup: 2, legs: 1, thirdPlace: false });
  return seeded.tournamentId;
}

describe('대회별 동점 순서 (PostgreSQL)', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('고른 순서는 대회 행에 저장되고, 기본 순서나 안 고른 대회는 null 이다', async () => {
    const custom = await admin.create(user, { title: '득실 먼저 대회', sportId: ids.soccerSportId, teamCount: 8, tieBreakOrder: GOALS_FIRST });
    const plain = await admin.create(user, { title: '기본 순서 대회', sportId: ids.soccerSportId, teamCount: 8, tieBreakOrder: DEFAULT_ORDER });

    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: custom.id } })).tieBreakOrder).toEqual(GOALS_FIRST);
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: plain.id } })).tieBreakOrder).toBeNull();
    expect((await admin.get(user, custom.id)).tieBreakOrder).toEqual(GOALS_FIRST);
    expect((await admin.get(user, plain.id)).tieBreakOrder).toEqual(DEFAULT_ORDER);
  });

  it('예선 결과가 없으면 순서를 바꾸고 기본 순서로 되돌릴 수 있다', async () => {
    const tournamentId = await seedGroupTournament('tb-open');

    await admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: GOALS_FIRST });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).tieBreakOrder).toEqual(GOALS_FIRST);
    expect((await admin.get(user, tournamentId)).tieBreakOrderBlockedReason).toBeNull();

    await admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: null });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).tieBreakOrder).toBeNull();
  });

  it('예선 공식 결과가 하나라도 생기면 순서 변경은 409 로 막히고 같은 순서를 다시 보내는 저장은 통과한다', async () => {
    const tournamentId = await seedGroupTournament('tb-locked');
    await admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: GOALS_FIRST });
    await settleFirstFixture(tournamentId, 'group');

    expect((await admin.get(user, tournamentId)).tieBreakOrderBlockedReason).toContain('결과');
    await expect(admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: FAIR_PLAY_FIRST }))
      .rejects.toMatchObject({ response: { code: 'TIE_BREAK_ORDER_LOCKED' } });
    await expect(admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: null }))
      .rejects.toMatchObject({ response: { code: 'TIE_BREAK_ORDER_LOCKED' } });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).tieBreakOrder).toEqual(GOALS_FIRST);

    const renamed = await admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: GOALS_FIRST, title: '이름만 바꿈' });
    expect(renamed.title).toBe('이름만 바꿈');
  });

  it('커밋 전인 결과 확정이 쥔 경기 행을 기다렸다가 확정을 보고 순서 변경을 409 로 막는다', async () => {
    const tournamentId = await seedGroupTournament('tb-race');
    const expectedVersion = await versionOf(tournamentId);
    const detail = await prisma.v1TournamentMatchDetails.findFirstOrThrow({ where: { tournamentId, group: { is: { phase: 'group' } } } });
    const game = await prisma.v1Game.findFirstOrThrow({ where: { teamMatchId: detail.teamMatchId } });
    let holdsGameRow!: () => void;
    let commitConfirmation!: () => void;
    const gameRowHeld = new Promise<void>((resolve) => { holdsGameRow = resolve; });
    const mayCommit = new Promise<void>((resolve) => { commitConfirmation = resolve; });

    // Stands in for result confirmation: the OFFICIAL revision and the Game row lock exist only inside this open transaction.
    const confirming = prisma.$transaction(async (tx) => {
      const revision = await tx.v1GameResultRevision.create({
        data: { gameId: game.id, revision: 1, state: 'DRAFT', score: { home: 1, away: 0 }, eventsHash: `tie-break-race-${tournamentId}`, createdByActorType: 'SYSTEM', createdBySystemActor: 'TEST_FIXTURE' },
      });
      await tx.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', officialAt: new Date('2026-01-01T00:00:00.000Z') } });
      await tx.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id } });
      holdsGameRow();
      await mayCommit;
    }, { timeout: 30_000 });
    await gameRowHeld;

    const changing = admin.update(user, tournamentId, { expectedVersion, tieBreakOrder: FAIR_PLAY_FIRST });
    const whileConfirming = await Promise.race([
      changing.then(() => 'finished', () => 'finished'),
      new Promise<string>((resolve) => { setTimeout(() => resolve('waiting'), 1_500); }),
    ]);
    commitConfirmation();
    await confirming;

    expect(whileConfirming).toBe('waiting');
    await expect(changing).rejects.toMatchObject({ response: { code: 'TIE_BREAK_ORDER_LOCKED' } });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).tieBreakOrder).toBeNull();
  });

  it('결선 경기에만 결과가 있으면 잠기지 않는다 — 잠금은 예선 결과만 본다', async () => {
    const tournamentId = await seedGroupTournament('tb-knockout-only');
    await settleFirstFixture(tournamentId, 'knockout');

    expect((await admin.get(user, tournamentId)).tieBreakOrderBlockedReason).toBeNull();
    await admin.update(user, tournamentId, { expectedVersion: await versionOf(tournamentId), tieBreakOrder: GOALS_FIRST });
    expect((await prisma.v1Tournament.findUniqueOrThrow({ where: { id: tournamentId } })).tieBreakOrder).toEqual(GOALS_FIRST);
  });
});
