import { GameResultOfficialProjectionService } from '../../src/game-operations/game-result-official-projection.service';
import { TeamMatchesService } from '../../src/team-matches/team-matches.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchRecordService } from '../../src/team-matches/team-match-record.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { createSharedRecordFixture } from '../fixtures/team-match-shared-record.fixture';
import type { MutateTeamMatchRecordDto } from '../../src/team-matches/dto/team-match-record.dto';

const prisma = new PrismaService();
const records = new TeamMatchRecordService(prisma);
const user = (id: string) => ({ id, email: null, accountStatus: 'active' as const, onboardingStatus: 'completed' as const });
const cmd = (action: MutateTeamMatchRecordDto['action'], version: number, fields = {}): MutateTeamMatchRecordDto => ({ action, expectedVersion: version, commandId: randomUUID(), ...fields });

describe('friendly match shared score sheet (real DB)', () => {
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  it('ordinary players from both lineups add, edit each other, delete and restore the same goal; public view hides identities', async () => {
    const f = await createSharedRecordFixture(prisma);
    const host = user(f.userIds[1]); const away = user(f.userIds[3]);
    const first = await records.mutate(host, f.match.id, cmd('add', 0, { sideId: f.sides[0].id, participantId: f.participants[0].id, minute: 12 }));
    expect(first.sides.find((s) => s.key === 'HOME')?.score).toBe(1);
    const edited = await records.mutate(away, f.match.id, cmd('edit', 1, { goalId: first.goals[0].id, sideId: f.sides[0].id, participantId: f.participants[1].id }));
    expect(edited.goals[0].participantId).toBe(f.participants[1].id);
    expect(edited.history[0].actorName).toBe('최도윤');
    const deleted = await records.mutate(host, f.match.id, cmd('delete', 2, { goalId: first.goals[0].id }));
    expect(deleted.sides.every((s) => s.score === 0)).toBe(true);
    const restored = await records.mutate(away, f.match.id, cmd('undo', 3, { changeId: deleted.history[0].id }));
    expect(restored.goals[0].participantId).toBe(f.participants[1].id);
    const publicView = await records.read(null, f.match.id);
    expect(publicView.sides.find((s) => s.key === 'HOME')?.score).toBeNull();
    expect(publicView).toMatchObject({ canEdit: false, participant: false, participants: [], history: [], goals: [] });
  });
  it('honors public visibility policy and the live-score kill switch without limiting participants', async () => {
    const f = await createSharedRecordFixture(prisma);
    await prisma.v1GameOperationFlag.upsert({ where: { key: 'PUBLIC_LIVE' }, create: { key: 'PUBLIC_LIVE', value: 'on', ownerActor: 'shared-record-integration' }, update: { value: 'on' } });
    try {
      expect((await records.read(null, f.match.id)).sides[0].score).toBe(0);
      await prisma.v1GameVisibilityPolicy.update({ where: { gameId: f.game.id }, data: { mode: 'STATUS_ONLY' } });
      expect((await records.read(null, f.match.id)).sides[0].score).toBeNull();
      await prisma.v1GameVisibilityPolicy.update({ where: { gameId: f.game.id }, data: { mode: 'HIDDEN' } });
      await expect(records.read(null, f.match.id)).rejects.toMatchObject({ status: 404 });
      expect((await records.read(user(f.userIds[1]), f.match.id)).canEdit).toBe(true);
    } finally {
      await prisma.v1GameOperationFlag.update({ where: { key: 'PUBLIC_LIVE' }, data: { value: 'off' } });
    }
  });
  it('rejects spectators, wrong-side scorers and pre-kickoff writes', async () => {
    const f = await createSharedRecordFixture(prisma);
    await expect(records.mutate(user(f.userIds[4]), f.match.id, cmd('add', 0, { sideId: f.sides[0].id }))).rejects.toMatchObject({ status: 403 });
    await expect(records.mutate(user(f.userIds[1]), f.match.id, cmd('add', 0, { sideId: f.sides[0].id, participantId: f.participants[2].id }))).rejects.toMatchObject({ status: 422 });
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { startAt: new Date(Date.now() + 60_000) } });
    expect((await records.read(user(f.userIds[1]), f.match.id)).phase).toBe('scheduled');
    await expect(records.mutate(user(f.userIds[1]), f.match.id, cmd('confirm', 0))).rejects.toMatchObject({ status: 409 });
  });
  it('serializes simultaneous edits and replays requests without adding duplicate goals', async () => {
    const f = await createSharedRecordFixture(prisma);
    const actor = user(f.userIds[1]); const input = cmd('add', 0, { sideId: f.sides[0].id });
    const results = await Promise.allSettled([records.mutate(actor, f.match.id, input), records.mutate(user(f.userIds[3]), f.match.id, cmd('add', 0, { sideId: f.sides[1].id }))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const current = await records.read(actor, f.match.id);
    expect(current.goals).toHaveLength(1);
    if (results[0].status === 'fulfilled') {
      expect((await records.mutate(actor, f.match.id, input)).goals).toHaveLength(1);
      await expect(records.mutate(actor, f.match.id, { ...input, sideId: f.sides[1].id })).rejects.toMatchObject({ status: 409 });
    }
  });
  it('counts own goals for the opposing team and leaves unknown scorers unassigned', async () => {
    const f = await createSharedRecordFixture(prisma);
    await records.mutate(user(f.userIds[1]), f.match.id, cmd('add', 0, { sideId: f.sides[1].id, participantId: f.participants[0].id, ownGoal: true }));
    const view = await records.mutate(user(f.userIds[3]), f.match.id, cmd('add', 1, { sideId: f.sides[0].id }));
    expect(view.sides.map((s) => s.score)).toEqual([1, 1]);
    expect(view.goals.find((g) => !g.ownGoal)?.participantId).toBeNull();
  });
  it('invalidates previous confirmations on edits and requires different teams; finalizes canonical result atomically and locks writes', async () => {
    const f = await createSharedRecordFixture(prisma);
    const host = user(f.userIds[1]); const away = user(f.userIds[3]);
    await records.mutate(host, f.match.id, cmd('confirm', 0));
    await expect(records.mutate(user(f.userIds[0]), f.match.id, cmd('confirm', 1))).rejects.toMatchObject({ status: 409 });
    const edited = await records.mutate(away, f.match.id, cmd('add', 1, { sideId: f.sides[0].id, participantId: f.participants[0].id }));
    expect(edited.confirmations).toEqual([]);
    await records.mutate(host, f.match.id, cmd('confirm', 2));
    const confirm = cmd('confirm', 3);
    const official = await records.mutate(away, f.match.id, confirm);
    expect(official).toMatchObject({ phase: 'official', canEdit: false });
    expect((await records.mutate(away, f.match.id, confirm)).phase).toBe('official');
    await expect(records.mutate(host, f.match.id, cmd('delete', 4, { goalId: edited.goals[0].id }))).rejects.toMatchObject({ status: 409 });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: f.game.id }, include: { currentOfficialRevision: { include: { resultParticipants: true } }, teamMatch: true } });
    expect(game.state).toBe('ENDED'); expect(game.teamMatch?.status).toBe('completed');
    expect(game.currentOfficialRevision).toMatchObject({ state: 'OFFICIAL', score: { home: 1, away: 0 } });
    expect(game.currentOfficialRevision?.resultParticipants.find((p) => p.participantId === f.participants[0].id)?.goals).toBe(1);
    expect(await prisma.v1OutboxEvent.count({ where: { aggregateId: f.game.id, type: 'GAME_RESULT_OFFICIAL' } })).toBe(1);
    const event = await prisma.v1OutboxEvent.findFirstOrThrow({ where: { aggregateId: f.game.id, type: 'GAME_RESULT_OFFICIAL' } });
    const projector = new GameResultOfficialProjectionService();
    const claim = { ...event, leaseOwner: 'record-test', leaseUntil: new Date(Date.now() + 30000), afterCommit: [] };
    await prisma.$transaction((tx) => projector.handler(claim, tx));
    await prisma.$transaction((tx) => projector.handler(claim, tx));
    expect(await prisma.v1TeamRecordFact.count({ where: { gameId: f.game.id } })).toBe(2);
    expect(await prisma.v1GameOfficialFact.count({ where: { gameId: f.game.id } })).toBe(1);

  });
  it('cannot undo an old change over a newer edit', async () => {
    const f = await createSharedRecordFixture(prisma); const actor = user(f.userIds[1]);
    const added = await records.mutate(actor, f.match.id, cmd('add', 0, { sideId: f.sides[0].id }));
    await records.mutate(actor, f.match.id, cmd('edit', 1, { goalId: added.goals[0].id, sideId: f.sides[0].id, participantId: f.participants[0].id }));
    await expect(records.mutate(actor, f.match.id, cmd('undo', 2, { changeId: added.history[0].id }))).rejects.toMatchObject({ status: 409 });
  });
  it('a superseded submitted lineup does not grant rights when newest revision is draft', async () => {
    const f = await createSharedRecordFixture(prisma);
    await prisma.v1GameLineup.create({ data: { gameId: f.game.id, sideId: f.sides[0].id, revision: 2, state: 'DRAFT' } });
    expect((await records.read(user(f.userIds[1]), f.match.id)).canEdit).toBe(false);
    await expect(records.mutate(user(f.userIds[1]), f.match.id, cmd('confirm', 0))).rejects.toMatchObject({ status: 403 });
  });
  it('cancelled and existing result games cannot be edited through the shared endpoint', async () => {
    const f = await createSharedRecordFixture(prisma);
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { status: 'cancelled' } });
    await expect(records.mutate(user(f.userIds[1]), f.match.id, cmd('confirm', 0))).rejects.toMatchObject({ status: 409 });
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { status: 'matched' } });
    await prisma.v1GameResultRevision.create({ data: { gameId: f.game.id, revision: 1, score: { home: 2, away: 1 }, eventsHash: 'legacy', createdByActorType: 'USER', createdByUserId: f.userIds[0] } });
    expect((await records.read(user(f.userIds[1]), f.match.id)).phase).toBe('legacy');
    await expect(records.mutate(user(f.userIds[1]), f.match.id, cmd('confirm', 0))).rejects.toMatchObject({ status: 409 });
  });
  it('old host submission cannot replace an active shared record', async () => {
    const f = await createSharedRecordFixture(prisma);
    await records.mutate(user(f.userIds[1]), f.match.id, cmd('add', 0, { sideId: f.sides[0].id }));
    const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
    const id = randomUUID();
    await expect(games.createResultRevision(user(f.userIds[0]), f.game.id, id, { clientCommandId: id, expectedVersion: 1, score: { home: 0, away: 0 }, eventsHash: 'other', actualParticipants: [] })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SHARED_RECORD_REQUIRED' }) });
  });
  it('default and recommended discovery retain a started matched game even after its application deadline', async () => {
    const f = await createSharedRecordFixture(prisma);
    await prisma.v1TeamMatch.update({ where: { id: f.match.id }, data: { deadlineAt: new Date(Date.now() - 3600_000) } });
    const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
    const matches = new TeamMatchesService(prisma, {} as NotificationsService, games);
    for (const sort of [undefined, 'recommended'] as const) {
      const page = await matches.list(null, { teamId: f.teams[0].id, sort });
      expect(page.items.find((item) => item.teamMatchId === f.match.id)).toMatchObject({ status: 'matched', isLive: true });
    }
  });

});
