import { randomUUID } from 'node:crypto';
import type { V1AuthUser } from '../../src/auth/v1-auth-user';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { MutateTeamMatchRecordDto } from '../../src/team-matches/dto/team-match-record.dto';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';
import { TeamMatchRecordService } from '../../src/team-matches/team-match-record.service';
import { createSharedRecordFixture } from '../fixtures/team-match-shared-record.fixture';

const prisma = new PrismaService();
const records = new TeamMatchRecordService(prisma);
const lineups = new TeamMatchLineupService(prisma, new OperationAuditWriterService());
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const user = (id: string): V1AuthUser => ({ id, email: null, accountStatus: 'active', onboardingStatus: 'completed' });
const command = (
  action: MutateTeamMatchRecordDto['action'],
  expectedVersion: number,
  fields: Pick<MutateTeamMatchRecordDto, 'sideId' | 'participantId'> = {},
): MutateTeamMatchRecordDto => ({ action, expectedVersion, commandId: randomUUID(), ...fields });

async function automaticFixture() {
  return createSharedRecordFixture(prisma, -30 * 60_000, { lineupState: 'DRAFT' });
}

async function storedRosterCounts(gameId: string, teamMatchId: string) {
  const [lineups, participants, audits] = await Promise.all([
    prisma.v1GameLineup.count({ where: { gameId } }),
    prisma.v1GameParticipant.count({ where: { gameId } }),
    prisma.v1OperationAudit.count({ where: { OR: [{ resourceId: gameId }, { teamMatchId }] } }),
  ]);
  return { lineups, participants, audits };
}

describe('MD-QA #146: friendly effective default roster through the actual record service (real DB)', () => {
  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('reads all eligible current members from untouched automatic drafts without persisting a submission or roster', async () => {
    // Given: both automatic revisions have never been submitted or manually edited.
    const fixture = await automaticFixture();
    const before = await storedRosterCounts(fixture.game.id, fixture.match.id);

    // When: the actual authenticated record reader projects its effective participants.
    const view = await records.read(user(fixture.userIds[0]), fixture.match.id);

    // Then: all four qualified members are usable, while GET remains read-only.
    expect(view).toMatchObject({ lineupReady: true, canEdit: true, missingSides: [] });
    expect(view.participants.map((participant) => participant.name).sort()).toEqual(['김민수', '박지훈', '이서준', '최도윤'].sort());
    expect(await storedRosterCounts(fixture.game.id, fixture.match.id)).toEqual(before);
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id, state: { in: ['SUBMITTED', 'LOCKED'] } } })).toBe(0);
  });

  it('allows the first authorized real record command and persists its effective default without claiming human submission', async () => {
    // Given: no lineup page or preparation endpoint has been opened.
    const fixture = await automaticFixture();

    // When: the home captain records the first goal through the actual mutation path.
    const view = await records.mutate(user(fixture.userIds[0]), fixture.match.id, command('add', 0, { sideId: fixture.sides[0].id }));

    // Then: the command succeeds with four effective participants and no fabricated submitted lineup.
    expect(view).toMatchObject({ version: 1, lineupReady: true, canEdit: true });
    expect(view.participants).toHaveLength(4);
    expect(view.goals).toEqual([expect.objectContaining({ sideId: fixture.sides[0].id })]);
    expect(await prisma.v1TeamMatchRecordChange.count({ where: { gameId: fixture.game.id } })).toBe(1);
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id, state: { in: ['SUBMITTED', 'LOCKED'] } } })).toBe(0);
  });

  it('preserves a saved custom draft across actual lineup GET → save → GET without changing record defaults or CAS', async () => {
    // Given: the owner opens an untouched automatic draft with the current full roster.
    const fixture = await automaticFixture();
    const owner = user(fixture.userIds[0]);
    const before = await lineups.getLineup(owner, fixture.match.id);
    expect(before).toMatchObject({ state: 'DRAFT', version: 1, effectiveRosterSource: 'DEFAULT_PREVIEW', hasSavedDraft: false });
    expect(before.participants.map((participant) => participant.userId).sort()).toEqual(fixture.userIds.slice(0, 2).sort());

    // When: the owner saves only one player, then opens the same actual editor route again.
    const saved = await lineups.saveLineup(owner, fixture.match.id, randomUUID(), {
      expectedVersion: before.version, participants: [{ userId: fixture.userIds[0], jerseyNumber: 17 }],
    });
    const afterSave = await storedRosterCounts(fixture.game.id, fixture.match.id);
    const reloaded = await lineups.getLineup(owner, fixture.match.id);

    // Then: the editor retains the human draft while recording still uses the current default until submission.
    expect(reloaded).toMatchObject({ lineupId: saved.lineupId, version: saved.version, revision: 2, state: 'DRAFT', effectiveRosterSource: 'DEFAULT_PREVIEW', hasSavedDraft: true });
    expect(reloaded.participants).toEqual([expect.objectContaining({ userId: fixture.userIds[0], jerseyNumber: 17 })]);
    expect((await records.read(owner, fixture.match.id)).participants).toHaveLength(4);
    expect(await storedRosterCounts(fixture.game.id, fixture.match.id)).toEqual(afterSave);
    await expect(lineups.saveLineup(owner, fixture.match.id, randomUUID(), {
      expectedVersion: before.version, participants: [{ userId: fixture.userIds[1] }],
    })).rejects.toMatchObject({ status: 409, response: { code: 'VERSION_CONFLICT' } });
    expect((await lineups.getLineup(owner, fixture.match.id)).participants).toEqual(reloaded.participants);
  });

  it('uses a late join and excludes a departed member before the first record, including the new scorer identifier', async () => {
    // Given: the creation snapshot is stale, but current team membership has changed.
    const fixture = await automaticFixture();
    await prisma.v1TeamMembership.update({
      where: { teamId_userId: { teamId: fixture.teams[0].id, userId: fixture.userIds[1] } },
      data: { status: 'left', leftAt: new Date() },
    });
    await prisma.v1TeamMembership.create({ data: { teamId: fixture.teams[0].id, userId: fixture.userIds[4], status: 'active', role: 'member' } });
    const before = await storedRosterCounts(fixture.game.id, fixture.match.id);
    const preview = await records.read(user(fixture.userIds[0]), fixture.match.id);
    expect(preview.participants.map((participant) => participant.name).sort()).toEqual(['김민수', '관람 사용자', '이서준', '최도윤'].sort());
    expect(await storedRosterCounts(fixture.game.id, fixture.match.id)).toEqual(before);
    const lateJoin = preview.participants.find((participant) => participant.name === '관람 사용자');
    if (lateJoin === undefined) throw new Error('The current default roster must expose the late-joining member.');

    // When: a real goal refers to the identifier returned by that read-only preview.
    const recorded = await records.mutate(user(fixture.userIds[0]), fixture.match.id, command('add', 0, { sideId: fixture.sides[0].id, participantId: lateJoin.id }));

    // Then: the same scorer becomes a durable participant, with no departed member restored.
    expect(recorded.goals).toEqual([expect.objectContaining({ participantId: lateJoin.id })]);
    const persisted = await prisma.v1GameParticipant.findUniqueOrThrow({ where: { id: lateJoin.id } });
    expect(persisted).toMatchObject({ gameId: fixture.game.id, sideId: fixture.sides[0].id, userId: fixture.userIds[4] });
    expect(recorded.participants.map((participant) => participant.name)).not.toContain('박지훈');
  });

  it.each(['suspended', 'deleted'] as const)('excludes an %s account even when its membership row remains active', async (accountStatus) => {
    // Given: a current membership still points to a player who is no longer eligible.
    const fixture = await automaticFixture();
    await prisma.v1User.update({ where: { id: fixture.userIds[1] }, data: { accountStatus, ...(accountStatus === 'deleted' ? { deletedAt: new Date() } : {}) } });

    // When: the actual service reads the effective default roster.
    const view = await records.read(user(fixture.userIds[0]), fixture.match.id);

    // Then: the account is absent while the other team's valid participants remain.
    expect(view).toMatchObject({ lineupReady: true });
    expect(view.participants.map((participant) => participant.name).sort()).toEqual(['김민수', '이서준', '최도윤'].sort());
  });

  it('preserves a submitted manual roster instead of adding a newly joined teammate', async () => {
    // Given: the explicit submitted roster is already authoritative.
    const fixture = await createSharedRecordFixture(prisma);
    await prisma.v1TeamMembership.create({ data: { teamId: fixture.teams[0].id, userId: fixture.userIds[4], status: 'active', role: 'member' } });

    // When: the same record reader loads the match.
    const view = await records.read(user(fixture.userIds[0]), fixture.match.id);

    // Then: every original participant identifier survives and no current-member default replaces it.
    expect(view.participants.map((participant) => participant.id).sort()).toEqual(fixture.participants.map((participant) => participant.id).sort());
    expect(view.participants.map((participant) => participant.name)).not.toContain('관람 사용자');
  });

  it('keeps a reopened manual draft blocked after a previous human submission', async () => {
    // Given: the team had submitted a roster and now has a pending replacement draft.
    const fixture = await createSharedRecordFixture(prisma);
    const previous = await prisma.v1GameLineup.findFirstOrThrow({ where: { gameId: fixture.game.id, sideId: fixture.sides[0].id } });
    await prisma.v1GameLineup.create({ data: { gameId: fixture.game.id, sideId: fixture.sides[0].id, revision: 2, state: 'DRAFT', supersedesId: previous.id } });

    // When: the captain tries to record while that review is still pending.
    await expect(records.mutate(user(fixture.userIds[0]), fixture.match.id, command('confirm', 0))).rejects.toMatchObject({ status: 409, response: { code: 'ROSTER_INCOMPLETE' } });

    // Then: a current-members fallback cannot bypass the existing submission/review lock.
    expect(await prisma.v1TeamMatchRecord.count({ where: { gameId: fixture.game.id } })).toBe(0);
  });

  it('freezes the default at the first record and retains its participant identities through official result creation', async () => {
    // Given: a first real command has established the actual appearance snapshot.
    const fixture = await automaticFixture();
    const first = await records.mutate(user(fixture.userIds[0]), fixture.match.id, command('add', 0, { sideId: fixture.sides[0].id }));
    const participantIds = first.participants.map((participant) => participant.id).sort();
    await prisma.v1TeamMembership.update({ where: { teamId_userId: { teamId: fixture.teams[0].id, userId: fixture.userIds[1] } }, data: { status: 'left', leftAt: new Date() } });
    await prisma.v1TeamMembership.create({ data: { teamId: fixture.teams[0].id, userId: fixture.userIds[4], status: 'active', role: 'member' } });

    // When: both teams confirm after membership has changed.
    const afterMembershipChange = await records.read(user(fixture.userIds[0]), fixture.match.id);
    await records.mutate(user(fixture.userIds[0]), fixture.match.id, command('confirm', 1));
    await records.mutate(user(fixture.userIds[2]), fixture.match.id, command('confirm', 2));

    // Then: frozen participants, existing identifiers and result-participant FKs survive unchanged.
    expect(afterMembershipChange.participants.map((participant) => participant.id).sort()).toEqual(participantIds);
    expect(afterMembershipChange.participants.map((participant) => participant.name)).toContain('박지훈');
    expect(afterMembershipChange.participants.map((participant) => participant.name)).not.toContain('관람 사용자');
    const result = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: fixture.game.id, state: 'OFFICIAL' }, include: { resultParticipants: true } });
    expect(result.resultParticipants.map((participant) => participant.participantId).sort()).toEqual(participantIds);
    expect(await prisma.v1GameParticipant.count({ where: { id: { in: participantIds }, gameId: fixture.game.id } })).toBe(4);
  });

  it('serializes simultaneous first commands into one freeze and one actual record revision', async () => {
    // Given: both team captains observed the same pre-record version.
    const fixture = await automaticFixture();

    // When: both submit a distinct first goal concurrently through real row-lock transactions.
    const results = await Promise.allSettled([
      records.mutate(user(fixture.userIds[0]), fixture.match.id, command('add', 0, { sideId: fixture.sides[0].id })),
      records.mutate(user(fixture.userIds[2]), fixture.match.id, command('add', 0, { sideId: fixture.sides[1].id })),
    ]);

    // Then: the stale command conflicts and cannot append another default snapshot or record.
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ status: 409, response: { code: 'VERSION_CONFLICT' } });
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id } })).toBe(4);
    expect(await prisma.v1GameParticipant.count({ where: { gameId: fixture.game.id } })).toBe(8);
    expect(await prisma.v1OperationAudit.count({ where: { resourceType: 'GAME', resourceId: fixture.game.id, action: 'FRIENDLY_DEFAULT_ROSTER_FROZEN' } })).toBe(2);
    expect(await prisma.v1TeamMatchRecordChange.count({ where: { gameId: fixture.game.id } })).toBe(1);
    expect(await records.read(user(fixture.userIds[0]), fixture.match.id)).toMatchObject({ version: 1, lineupReady: true });
  });

  it('opens the existing append-only late-add route for a proven frozen default while retaining existing goal FKs', async () => {
    // Given: the first goal has frozen the default and references a real participant id.
    const fixture = await automaticFixture();
    const owner = user(fixture.userIds[0]);
    const preview = await records.read(owner, fixture.match.id);
    const scorer = preview.participants.find((participant) => participant.sideId === fixture.sides[0].id);
    if (scorer === undefined) throw new Error('The home scorer must be available before the first record.');
    await records.mutate(owner, fixture.match.id, command('add', 0, { sideId: fixture.sides[0].id, participantId: scorer.id }));
    const frozen = await lineups.getLineup(owner, fixture.match.id);
    expect(frozen).toMatchObject({ state: 'DRAFT', effectiveRosterSource: 'DEFAULT_FROZEN', lateAdditionAllowed: true, editable: false });
    await prisma.v1TeamMembership.create({ data: { teamId: fixture.teams[0].id, userId: fixture.userIds[4], status: 'active', role: 'member' } });

    // When: the captain explicitly adds the later arrival through the existing authorized route.
    const added = await lineups.addLateParticipant(owner, fixture.match.id, randomUUID(), { userId: fixture.userIds[4], jerseyNumber: 19 });
    const after = await records.read(owner, fixture.match.id);

    // Then: the same frozen revision gains one row and the previously recorded scorer remains unchanged.
    expect(added.lineupId).toBe(frozen.lineupId);
    expect(after).toMatchObject({ version: 2, lineupReady: true });
    expect(after.participants).toHaveLength(5);
    expect(after.goals).toEqual([expect.objectContaining({ participantId: scorer.id })]);
    expect(after.participants.some((participant) => participant.id === added.participantId)).toBe(true);
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id } })).toBe(4);
    expect(await prisma.v1GameParticipant.findUnique({ where: { id: scorer.id } })).not.toBeNull();
  });

  it('persists a real preview arrival through a direct human submission of the current qualified default', async () => {
    // Given: the original snapshot is stale and the owner checks in a current player.
    const fixture = await automaticFixture();
    const owner = user(fixture.userIds[0]);
    await prisma.v1TeamMembership.update({ where: { teamId_userId: { teamId: fixture.teams[0].id, userId: fixture.userIds[1] } }, data: { status: 'left', leftAt: new Date() } });
    await prisma.v1TeamMembership.create({ data: { teamId: fixture.teams[0].id, userId: fixture.userIds[4], status: 'active', role: 'member' } });
    const preview = await lineups.getLineup(owner, fixture.match.id);
    const scorer = preview.participants.find((participant) => participant.userId === fixture.userIds[0]);
    if (scorer === undefined) throw new Error('The captain must be in the current default.');
    const arrived = await games.setParticipantArrival(owner, fixture.game.id, scorer.id, true);
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id } })).toBe(2);

    // When: the actual owner submits that displayed default without saving another draft first.
    await lineups.submitLineup(owner, fixture.match.id, randomUUID(), { expectedVersion: preview.version });

    // Then: the actual manual snapshot keeps current IDs/arrival, the departed player is absent, and the opponent is untouched.
    const submitted = await lineups.getLineup(owner, fixture.match.id);
    expect(submitted).toMatchObject({ state: 'SUBMITTED', effectiveRosterSource: 'MANUAL' });
    expect(submitted.participants.map((participant) => participant.id).sort()).toEqual(preview.participants.map((participant) => participant.id).sort());
    expect(submitted.participants.map((participant) => participant.userId)).not.toContain(fixture.userIds[1]);
    expect(await prisma.v1GameParticipant.findUnique({ where: { id: scorer.id } })).toMatchObject({ arrivedAt: arrived.arrivedAt });
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id, sideId: fixture.sides[1].id, state: { in: ['SUBMITTED', 'LOCKED'] } } })).toBe(0);
  });

  it('serializes a real arrival with first-record freeze without losing its stable participant identity or arrival', async () => {
    // Given: check-in and the first score can arrive from two actual clients at the same time.
    const fixture = await automaticFixture();
    const owner = user(fixture.userIds[0]);
    const preview = await records.read(owner, fixture.match.id);
    const scorer = preview.participants.find((participant) => participant.sideId === fixture.sides[0].id);
    if (scorer === undefined) throw new Error('The scorer must exist in the current default.');

    // When: the real Game row lock serializes arrival and first-record transactions in either order.
    await Promise.all([
      games.setParticipantArrival(owner, fixture.game.id, scorer.id, true),
      records.mutate(owner, fixture.match.id, command('add', 0, { sideId: fixture.sides[0].id, participantId: scorer.id })),
    ]);

    // Then: both commands survive and the final frozen row retains the same actual arrival and scorer FK.
    expect(await prisma.v1GameParticipant.findUnique({ where: { id: scorer.id } })).toMatchObject({ arrivedAt: expect.any(Date) });
    const recorded = await records.read(owner, fixture.match.id);
    expect(recorded).toMatchObject({ version: 1, lineupReady: true });
    expect(recorded.goals).toEqual([expect.objectContaining({ participantId: scorer.id })]);
    expect(await prisma.v1GameLineup.count({ where: { gameId: fixture.game.id } })).toBe(4);
    expect(await prisma.v1OperationAudit.count({ where: { resourceType: 'GAME', resourceId: fixture.game.id, action: 'FRIENDLY_DEFAULT_ROSTER_FROZEN' } })).toBe(2);
  });
});
