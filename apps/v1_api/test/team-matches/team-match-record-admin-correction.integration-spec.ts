import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchRecordService } from '../../src/team-matches/team-match-record.service';
import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import type { MutateTeamMatchRecordDto } from '../../src/team-matches/dto/team-match-record.dto';
import { createSharedRecordFixture } from '../fixtures/team-match-shared-record.fixture';

/**
 * 2026-10-01 사용자 결정 "어드민은 언제든 수정" — 양 팀이 확인을 마친 친선 공동 기록도 플랫폼 어드민은
 * 고친다. 덮어쓰지 않고 새 공식 리비전으로 대체하고, 전적 투영이 새 포인터를 따라간다.
 * 플랫폼 주관이 아닌 일반 친선이 대상이다(주관 여부와 무관).
 */
const prisma = new PrismaService();
const records = new TeamMatchRecordService(prisma);
const user = (id: string) => ({ id, email: null, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });
const cmd = (action: MutateTeamMatchRecordDto['action'], version: number, fields = {}): MutateTeamMatchRecordDto => ({
  action,
  expectedVersion: version,
  commandId: randomUUID(),
  ...fields,
});

async function project(revisionId: string) {
  const event = await prisma.v1OutboxEvent.findFirstOrThrow({ where: { revisionId, type: 'GAME_RESULT_OFFICIAL' } });
  const claim = { ...event, leaseOwner: 'admin-correction-test', leaseUntil: new Date(Date.now() + 30000), afterCommit: [] };
  await prisma.$transaction((tx) => new GameResultOfficialProjectionService().handler(claim, tx));
}

/** 홈 1골(참가자[0])로 양 팀이 확인을 마친 일반 친선(플랫폼 주관 아님). */
async function officialFriendly() {
  const f = await createSharedRecordFixture(prisma);
  const added = await records.mutate(user(f.userIds[1]), f.match.id, cmd('add', 0, { sideId: f.sides[0].id, participantId: f.participants[0].id }));
  await records.mutate(user(f.userIds[1]), f.match.id, cmd('confirm', 1));
  expect((await records.mutate(user(f.userIds[3]), f.match.id, cmd('confirm', 2))).phase).toBe('official');
  const { currentOfficialRevisionId } = await prisma.v1Game.findUniqueOrThrow({ where: { id: f.game.id }, select: { currentOfficialRevisionId: true } });
  await project(currentOfficialRevisionId!);
  const admin = await prisma.v1AdminUser.create({ data: { userId: f.userIds[4], adminRole: 'ops' } });
  return { ...f, goalId: added.goals[0].id, admin, adminUser: user(f.userIds[4]), firstRevisionId: currentOfficialRevisionId! };
}

async function revisionsOf(gameId: string) {
  return prisma.v1GameResultRevision.findMany({ where: { gameId }, orderBy: { revision: 'asc' }, include: { resultParticipants: true } });
}

describe('friendly shared record admin correction after confirmation (real DB)', () => {
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('supersedes the official revision, keeps history and audit, and moves team records to the corrected result', async () => {
    const f = await officialFriendly();
    const awayScorer = f.participants.find((participant) => participant.sideId === f.sides[1].id)!;

    expect(await records.read(f.adminUser, f.match.id)).toMatchObject({ phase: 'official', canEdit: true, operator: true });
    const view = await records.mutate(f.adminUser, f.match.id, cmd('edit', 3, { goalId: f.goalId, sideId: f.sides[1].id, participantId: awayScorer.id }));
    expect(view).toMatchObject({ phase: 'official', canEdit: true });
    expect(view.confirmations).toHaveLength(2);

    const [first, corrected] = await revisionsOf(f.game.id);
    expect(first).toMatchObject({ id: f.firstRevisionId, state: 'OFFICIAL', score: { home: 1, away: 0 } });
    expect(first.resultParticipants.find((p) => p.participantId === f.participants[0].id)?.goals).toBe(1);
    expect(corrected).toMatchObject({ revision: 2, state: 'OFFICIAL', supersedesId: f.firstRevisionId, score: { home: 0, away: 1 }, reason: '운영자 결과 정정' });
    expect(corrected.resultParticipants.find((p) => p.participantId === awayScorer.id)?.goals).toBe(1);
    expect(corrected.resultParticipants.find((p) => p.participantId === f.participants[0].id)?.goals).toBe(0);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: f.game.id } });
    expect(game).toMatchObject({ currentOfficialRevisionId: corrected.id, state: 'ENDED' });

    const changes = await prisma.v1TeamMatchRecordChange.findMany({ where: { gameId: f.game.id }, orderBy: { version: 'asc' } });
    expect(changes.at(-1)).toMatchObject({ actorUserId: f.adminUser.id, actorName: 'Teameet 운영', action: 'edit', goalId: f.goalId });
    expect(await prisma.v1AdminActionLog.findFirstOrThrow({ where: { adminUserId: f.admin.id, action: 'team_match.record_correction' } })).toMatchObject({
      targetId: f.match.id,
      beforeJson: expect.objectContaining({ revisionId: f.firstRevisionId }),
      afterJson: expect.objectContaining({ revisionId: corrected.id }),
    });

    await project(corrected.id);
    const facts = await prisma.v1TeamRecordFact.findMany({ where: { revisionId: corrected.id } });
    expect(facts.map((fact) => [fact.teamId, fact.result]).sort()).toEqual(
      [[f.teams[0].id, 'LOST'], [f.teams[1].id, 'WON']].sort(),
    );
    expect((await records.read(user(f.userIds[1]), f.match.id)).sides.map((side) => side.score)).toEqual([0, 1]);
    expect(await records.read(user(f.userIds[1]), f.match.id)).toMatchObject({ phase: 'official', officialCorrected: true });
  });

  it('replays the same correction command without another revision; a second correction supersedes the first one', async () => {
    const f = await officialFriendly();
    const input = cmd('delete', 3, { goalId: f.goalId });
    await records.mutate(f.adminUser, f.match.id, input);
    await records.mutate(f.adminUser, f.match.id, input);
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: f.game.id } })).toBe(2);

    await records.mutate(f.adminUser, f.match.id, cmd('add', 4, { sideId: f.sides[0].id }));
    const revisions = await revisionsOf(f.game.id);
    expect(revisions.map((revision) => [revision.revision, revision.supersedesId])).toEqual([
      [1, null],
      [2, revisions[0].id],
      [3, revisions[1].id],
    ]);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: f.game.id } })).currentOfficialRevisionId).toBe(revisions[2].id);
  });

  it('participants, team owners, support and revoked admins cannot correct, and confirmations stay with the teams', async () => {
    const f = await officialFriendly();
    const deleteGoal = () => cmd('delete', 3, { goalId: f.goalId });
    for (const id of [f.userIds[1], f.userIds[0]]) {
      await expect(records.mutate(user(id), f.match.id, deleteGoal())).rejects.toMatchObject({ response: { code: 'RECORD_NOT_EDITABLE' } });
    }
    await expect(records.mutate(f.adminUser, f.match.id, cmd('reopen', 3))).rejects.toMatchObject({ response: { code: 'TEAM_CONFIRMATION_REQUIRED' } });
    for (const data of [{ adminRole: 'support' as const }, { adminRole: 'ops' as const, revokedAt: new Date() }]) {
      await prisma.v1AdminUser.update({ where: { id: f.admin.id }, data });
      await expect(records.mutate(f.adminUser, f.match.id, deleteGoal())).rejects.toMatchObject({ status: 403 });
    }
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: f.game.id } })).toBe(1);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: f.game.id } })).currentOfficialRevisionId).toBe(f.firstRevisionId);
    expect(await records.read(user(f.userIds[1]), f.match.id)).toMatchObject({ phase: 'official', officialCorrected: false });
  });
});
