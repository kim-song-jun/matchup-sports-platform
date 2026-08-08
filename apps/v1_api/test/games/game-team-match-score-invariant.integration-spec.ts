import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';

// Task 17: resolveActor (games.service.ts, TEAM_MATCH branch) unconditionally
// forbids `event_append` / `event_reverse` for a TEAM_MATCH game, so a
// TEAM_MATCH-sourced game can never have a real V1GameEvent row. Before this
// fix, validateGameResultInvariants (game-invariants.ts) cross-checked the
// submitted score against the resulting always-empty event stream, so every
// team-match result revision with a score other than 0:0 rejected with 422
// SCORE_EVENT_MISMATCH — a real win/loss could never be recorded.
// game-team-result-authority.integration-spec.ts never caught this because
// every case there submits {home: 0, away: 0}, the one score that happens to
// satisfy the broken invariant.
//
// This spec proves the fix end to end through the real service: a genuine
// non-zero score (3:1), with per-participant goals that sum to it, drafts,
// submits, and reaches OFFICIAL on opponent approval — with zero
// V1GameEvent rows ever created. If the TEAM_MATCH exemption in
// game-invariants.ts is reverted, `createResultRevision` below throws 422
// SCORE_EVENT_MISMATCH and this test fails.
//
// Task T1-1 update: resolveActor's unconditional forbid described above was
// narrowed to opponent-only — the host team's owner/manager can now append
// and reverse real V1GameEvent rows (see
// game-team-match-event-authority.integration-spec.ts). This spec's own
// "zero V1GameEvent rows ever created" case above still exercises and pins
// the TEAM_MATCH-without-events exemption in game-invariants.ts; the
// opposite boundary — a team match that DOES have real events, where the
// submitted score must agree with them — is covered by
// game-team-match-event-score-mismatch.integration-spec.ts.
const ids = {
  hostUser: '85000000-0000-4000-8000-000000000001',
  opponentUser: '85000000-0000-4000-8000-000000000002',
  sport: '85000000-0000-4000-8000-000000000010',
  region: '85000000-0000-4000-8000-000000000011',
  hostTeam: '85000000-0000-4000-8000-000000000020',
  opponentTeam: '85000000-0000-4000-8000-000000000021',
  teamMatch: '85000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('Task 17 team-match score invariant (event-vs-score exemption)', () => {
  let configId: string;
  let gameId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 17 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 football-v1 preset is required');
    }
    configId = config.id;
    await prisma.v1User.createMany({
      data: [ids.hostUser, ids.opponentUser].map((id, index) => ({
        id,
        email: `task17-score-invariant-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'football', name: 'Task 17 Score Invariant Football' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK17_SCORE_REGION', name: 'Task 17 Score Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.hostUser,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 17 Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.opponentUser,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 17 Opponent',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 17 score invariant match',
        placeName: 'Task 17 ground',
        startAt: new Date('2026-08-15T00:00:00.000Z'),
        status: 'matched' as const,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 17 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 17 Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'host-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Task 17 Host One' },
        { sourceParticipantId: 'host-2', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Task 17 Host Two' },
        { sourceParticipantId: 'away-1', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Task 17 Away One' },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.hostUser,
      role: 'team_owner',
      teamId: ids.hostTeam,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(
        tx,
        input,
        context(actor, 'task17-source-create', input),
      ),
    );
    gameId = created.gameId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('drafts, submits, and reaches OFFICIAL with a real 3:1 score and per-participant goals that sum to it, despite zero live game events', async () => {
    const participants = await prisma.v1GameParticipant.findMany({ where: { gameId } });
    const hostOne = participants.find((p) => p.displayNameSnapshot === 'Task 17 Host One');
    const hostTwo = participants.find((p) => p.displayNameSnapshot === 'Task 17 Host Two');
    const awayOne = participants.find((p) => p.displayNameSnapshot === 'Task 17 Away One');
    if (hostOne === undefined || hostTwo === undefined || awayOne === undefined) {
      throw new Error('Expected all three seeded participants to be persisted');
    }

    // Zero V1GameEvent rows exist for this game — team matches can never
    // produce one (resolveActor forbids event_append/event_reverse for
    // TEAM_MATCH). If the invariant's TEAM_MATCH exemption were reverted,
    // eventScore would be {HOME: 0, AWAY: 0} here and this draft would throw
    // 422 SCORE_EVENT_MISMATCH against the submitted 3:1.
    expect(await prisma.v1GameEvent.count({ where: { gameId } })).toBe(0);

    const draft = await service.createResultRevision(
      authUser(ids.hostUser),
      gameId,
      'task17-score-draft',
      {
        expectedVersion: 0,
        clientCommandId: 'task17-score-draft',
        score: { home: 3, away: 1 },
        actualParticipants: [
          {
            participantId: hostOne.id,
            sideId: hostOne.sideId,
            started: true,
            goals: 2,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
          {
            participantId: hostTwo.id,
            sideId: hostTwo.sideId,
            started: true,
            goals: 1,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
          {
            participantId: awayOne.id,
            sideId: awayOne.sideId,
            started: true,
            goals: 1,
            cards: { yellow: 1, red: 0 },
            goalkeeper: false,
          },
        ],
        eventsHash: 'task17-score-draft-events',
      },
    );
    expect(draft.revisionState).toBe('DRAFT');

    const submitted = await service.submitResultRevision(
      authUser(ids.hostUser),
      gameId,
      draft.revisionId,
      'task17-score-submit',
      { expectedVersion: draft.version, clientCommandId: 'task17-score-submit' },
    );
    expect(submitted.revisionState).toBe('SUBMITTED');

    const decided = await service.decideResultRevision(
      authUser(ids.opponentUser),
      gameId,
      draft.revisionId,
      'task17-score-decide',
      { expectedVersion: submitted.version, clientCommandId: 'task17-score-decide', decision: 'approve' },
    );
    expect(decided.revisionState).toBe('OFFICIAL');

    const persistedRevision = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: draft.revisionId },
      include: { resultParticipants: true },
    });
    expect(persistedRevision.score).toEqual({ home: 3, away: 1 });
    expect(
      persistedRevision.resultParticipants
        .map((p) => ({ participantId: p.participantId, goals: p.goals }))
        .sort((a, b) => a.participantId.localeCompare(b.participantId)),
    ).toEqual(
      [
        { participantId: hostOne.id, goals: 2 },
        { participantId: hostTwo.id, goals: 1 },
        { participantId: awayOne.id, goals: 1 },
      ].sort((a, b) => a.participantId.localeCompare(b.participantId)),
    );
  });
});
