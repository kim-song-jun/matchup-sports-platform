import { HttpException } from '@nestjs/common';
import {
  V1GameSideKey,
  V1GameSourceType,
  V1GameState,
} from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';

// Task 16: host-only draft/submit authority, the matched-opponent precondition that replaces
// the removed `/team-matches/:teamMatchId/complete` shortcut, and the atomic TeamMatch
// completion side effect that keeps review eligibility (reviews.service.ts) working now that
// that shortcut is gone. See docs/api/domains/games.md and docs/api/v1/domains/team-matches.md
// for the frozen contract notes this spec proves.

const ids = {
  hostUser: '64000000-0000-4000-8000-000000000001',
  opponentUser: '64000000-0000-4000-8000-000000000002',
  sport: '64000000-0000-4000-8000-000000000010',
  region: '64000000-0000-4000-8000-000000000011',
  hostTeam: '64000000-0000-4000-8000-000000000020',
  opponentTeam: '64000000-0000-4000-8000-000000000021',
  authorityMatch: '64000000-0000-4000-8000-000000000030',
  unmatchedMatch: '64000000-0000-4000-8000-000000000031',
  completionMatch: '64000000-0000-4000-8000-000000000032',
  correctionMatch: '64000000-0000-4000-8000-000000000033',
} as const;

// The v1_pin_sport_competition_config trigger (apps/v1_api/prisma/migrations/
// 20260729000200_v1_competition_config/migration.sql) resolves the pinned
// competition config from the sport's `code` column via
// v1_competition_config_for_sport(), which only accepts 'soccer' | 'football' |
// 'futsal'. Task-scoped codes (e.g. 'task16football') raise 23514
// COMPETITION_CONFIG_SPORT_UNSUPPORTED. Other suites share a single 'football'
// sport row via upsert; mirror that here instead of creating a unique code.
let sportId: string;

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

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

async function createTeamMatchGame(
  teamMatchId: string,
  matchedOpponent: boolean,
  configId: string,
): Promise<string> {
  await prisma.v1TeamMatch.create({
    data: {
      id: teamMatchId,
      hostTeamId: ids.hostTeam,
      createdByUserId: ids.hostUser,
      sportId,
      regionId: ids.region,
      title: `Task 16 authority ${teamMatchId}`,
      placeName: 'Task 16 ground',
      startAt: new Date('2026-08-10T00:00:00.000Z'),
      competitionConfigVersionId: configId,
      ...(matchedOpponent
        ? { status: 'matched' as const, approvedApplicantTeamId: ids.opponentTeam }
        : {}),
    },
  });
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TEAM_MATCH,
    sourceId: teamMatchId,
    competitionConfigVersionId: configId,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 16 Host' },
      {
        sideKey: V1GameSideKey.AWAY,
        teamId: matchedOpponent ? ids.opponentTeam : null,
        displayNameSnapshot: matchedOpponent ? 'Task 16 Opponent' : '상대 팀 미정',
      },
    ],
    participants: [],
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
      context(actor, `task16-source-create-${teamMatchId}`, input),
    ),
  );
  return created.gameId;
}

describe('Task 16 team result draft/submit authority and completion', () => {
  let configId: string;
  let authorityGameId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 16 integration verification');
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
        email: `task16-authority-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    sportId = (
      await prisma.v1Sport.upsert({
        where: { code: 'football' },
        create: { id: ids.sport, code: 'football', name: 'Task 16 Football' },
        update: {},
      })
    ).id;
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK16_REGION', name: 'Task 16 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.hostUser,
          sportId,
          regionId: ids.region,
          name: 'Task 16 Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.opponentUser,
          sportId,
          regionId: ids.region,
          name: 'Task 16 Opponent',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects an opponent manager drafting a team result and leaves no revision row', async () => {
    authorityGameId = await createTeamMatchGame(ids.authorityMatch, true, configId);

    const draftByOpponent = await captureFailure(() =>
      service.createResultRevision(authUser(ids.opponentUser), authorityGameId, 'opponent-draft', {
        expectedVersion: 0,
        clientCommandId: 'opponent-draft',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'opponent-draft-events',
      }),
    );
    expectHttpCode(draftByOpponent, 403, 'PERMISSION_DENIED');
    expect(
      await prisma.v1GameResultRevision.count({ where: { gameId: authorityGameId } }),
    ).toBe(0);
  });

  it('rejects an opponent manager submitting a team result even against a real revision id', async () => {
    const draft = await service.createResultRevision(
      authUser(ids.hostUser),
      authorityGameId,
      'host-draft-for-opponent-submit-check',
      {
        expectedVersion: 0,
        clientCommandId: 'host-draft-for-opponent-submit-check',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'host-draft-events',
      },
    );

    const submitByOpponent = await captureFailure(() =>
      service.submitResultRevision(
        authUser(ids.opponentUser),
        authorityGameId,
        draft.revisionId,
        'opponent-submit',
        { expectedVersion: 1, clientCommandId: 'opponent-submit' },
      ),
    );
    expectHttpCode(submitByOpponent, 403, 'PERMISSION_DENIED');

    const untouched = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: draft.revisionId },
    });
    expect(untouched.state).toBe('DRAFT');
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: authorityGameId } });
    expect(game.state).toBe(V1GameState.SCHEDULED);
  });

  it('blocks drafting and submitting a result before the team match has a matched, approved opponent', async () => {
    const unmatchedGameId = await createTeamMatchGame(ids.unmatchedMatch, false, configId);

    const draft = await captureFailure(() =>
      service.createResultRevision(authUser(ids.hostUser), unmatchedGameId, 'unmatched-draft', {
        expectedVersion: 0,
        clientCommandId: 'unmatched-draft',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'unmatched-draft-events',
      }),
    );
    expectHttpCode(draft, 409, 'TEAM_MATCH_NOT_MATCHED');

    const submit = await captureFailure(() =>
      service.submitResultRevision(
        authUser(ids.hostUser),
        unmatchedGameId,
        'not-a-real-revision-id',
        'unmatched-submit',
        { expectedVersion: 0, clientCommandId: 'unmatched-submit' },
      ),
    );
    expectHttpCode(submit, 409, 'TEAM_MATCH_NOT_MATCHED');
    expect(
      await prisma.v1GameResultRevision.count({ where: { gameId: unmatchedGameId } }),
    ).toBe(0);
  });

  it('rolls back a stale-version submit without partially completing the team match, then completes it atomically on the real submit', async () => {
    const gameId = await createTeamMatchGame(ids.completionMatch, true, configId);
    const draft = await service.createResultRevision(
      authUser(ids.hostUser),
      gameId,
      'completion-draft',
      {
        expectedVersion: 0,
        clientCommandId: 'completion-draft',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'completion-draft-events',
      },
    );
    expect(draft.revisionState).toBe('DRAFT');

    const staleSubmit = await captureFailure(() =>
      service.submitResultRevision(
        authUser(ids.hostUser),
        gameId,
        draft.revisionId,
        'completion-stale-submit',
        { expectedVersion: 0, clientCommandId: 'completion-stale-submit' },
      ),
    );
    expectHttpCode(staleSubmit, 409, 'VERSION_CONFLICT');

    const afterStale = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(afterStale.state).toBe(V1GameState.SCHEDULED);
    const revisionAfterStale = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: draft.revisionId },
    });
    expect(revisionAfterStale.state).toBe('DRAFT');
    const teamMatchAfterStale = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: ids.completionMatch },
    });
    expect(teamMatchAfterStale.status).toBe('matched');
    expect(teamMatchAfterStale.completedAt).toBeNull();

    const submitted = await service.submitResultRevision(
      authUser(ids.hostUser),
      gameId,
      draft.revisionId,
      'completion-submit',
      { expectedVersion: draft.version, clientCommandId: 'completion-submit' },
    );
    expect(submitted.state).toBe(V1GameState.ENDED);
    expect(submitted.revisionState).toBe('SUBMITTED');

    const teamMatchAfterSubmit = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: ids.completionMatch },
    });
    expect(teamMatchAfterSubmit.status).toBe('completed');
    expect(teamMatchAfterSubmit.completedAt).not.toBeNull();

    const decided = await service.decideResultRevision(
      authUser(ids.opponentUser),
      gameId,
      draft.revisionId,
      'completion-decision',
      { expectedVersion: submitted.version, clientCommandId: 'completion-decision', decision: 'approve' },
    );
    expect(decided.revisionState).toBe('OFFICIAL');
  });

  it('walks the full correction loop to OFFICIAL: draft -> submit -> opponent change-request -> corrected draft -> resubmit -> opponent approve', async () => {
    // Regression guard for the assertTeamMatchMatched precondition: if it ever
    // regresses to only accepting status === 'matched', the corrected-revision
    // create() call below throws 409 TEAM_MATCH_NOT_MATCHED and this test fails,
    // because the first submitResultRevision has already flipped the TeamMatch to
    // 'completed' by the time the host tries to draft the correction.
    const gameId = await createTeamMatchGame(ids.correctionMatch, true, configId);

    const firstDraft = await service.createResultRevision(
      authUser(ids.hostUser),
      gameId,
      'correction-first-draft',
      {
        expectedVersion: 0,
        clientCommandId: 'correction-first-draft',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'correction-first-draft-events',
      },
    );
    expect(firstDraft.revisionState).toBe('DRAFT');

    const firstSubmit = await service.submitResultRevision(
      authUser(ids.hostUser),
      gameId,
      firstDraft.revisionId,
      'correction-first-submit',
      { expectedVersion: firstDraft.version, clientCommandId: 'correction-first-submit' },
    );
    expect(firstSubmit.state).toBe(V1GameState.ENDED);
    expect(firstSubmit.revisionState).toBe('SUBMITTED');

    const teamMatchAfterFirstSubmit = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: ids.correctionMatch },
    });
    expect(teamMatchAfterFirstSubmit.status).toBe('completed');
    expect(teamMatchAfterFirstSubmit.completedAt).not.toBeNull();

    // Blocker 2 regression guard: the atomic completion side effect must write a
    // v1_status_change_logs row matching the transition, exactly once — not zero
    // (diverges silently from every other team_match transition) and not more than
    // once (would happen if a later no-op resubmit re-logged a fromStatus===toStatus
    // "transition" that never actually occurred).
    const completionLogs = await prisma.v1StatusChangeLog.findMany({
      where: { targetType: 'team_match', targetId: ids.correctionMatch, toStatus: 'completed' },
    });
    expect(completionLogs).toHaveLength(1);
    expect(completionLogs[0].fromStatus).toBe('matched');
    expect(completionLogs[0].actorType).toBe('user');
    expect(completionLogs[0].actorUserId).toBe(ids.hostUser);

    const opponentChangeRequest = await service.decideResultRevision(
      authUser(ids.opponentUser),
      gameId,
      firstDraft.revisionId,
      'correction-change-request',
      {
        expectedVersion: firstSubmit.version,
        clientCommandId: 'correction-change-request',
        decision: 'change_request',
        reason: 'score is wrong',
      },
    );
    expect(opponentChangeRequest.revisionState).toBe('CHANGE_REQUESTED');

    // This is the call the precondition regression makes permanently unreachable:
    // the TeamMatch is 'completed' (not 'matched') by this point, and the host is
    // drafting the superseding revision the change-request requires.
    const correctedDraft = await service.createResultRevision(
      authUser(ids.hostUser),
      gameId,
      'correction-corrected-draft',
      {
        expectedVersion: opponentChangeRequest.version,
        clientCommandId: 'correction-corrected-draft',
        score: { home: 0, away: 0 },
        actualParticipants: [],
        eventsHash: 'correction-corrected-draft-events',
      },
    );
    expect(correctedDraft.revisionState).toBe('DRAFT');
    expect(correctedDraft.revision).toBe(firstDraft.revision + 1);

    const correctedRevisionRow = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: correctedDraft.revisionId },
    });
    expect(correctedRevisionRow.supersedesId).toBe(firstDraft.revisionId);

    // Deadlock regression guard: assertGameLifecycleTransition's
    // TEAM_RESULT_SUBMISSION branch used to only permit `from` in
    // {SCHEDULED, LIVE, PAUSED}. The Game is already ENDED here (the first
    // submission put it there), so a regression back to that narrower
    // predicate makes this resubmit throw 409 INVALID_STATE_TRANSITION
    // forever — the corrected revision could be drafted but never submitted,
    // decided, or become OFFICIAL.
    const correctedSubmit = await service.submitResultRevision(
      authUser(ids.hostUser),
      gameId,
      correctedDraft.revisionId,
      'correction-corrected-submit',
      { expectedVersion: correctedDraft.version, clientCommandId: 'correction-corrected-submit' },
    );
    expect(correctedSubmit.state).toBe(V1GameState.ENDED);
    expect(correctedSubmit.revisionState).toBe('SUBMITTED');

    // The TeamMatch was already `completed` by the first submission, so this
    // resubmit must be a no-op on it: still exactly one completion log row,
    // not a second one from a fromStatus===toStatus "transition" that never
    // actually occurred.
    const completionLogsAfterResubmit = await prisma.v1StatusChangeLog.findMany({
      where: { targetType: 'team_match', targetId: ids.correctionMatch, toStatus: 'completed' },
    });
    expect(completionLogsAfterResubmit).toHaveLength(1);

    const opponentApproval = await service.decideResultRevision(
      authUser(ids.opponentUser),
      gameId,
      correctedDraft.revisionId,
      'correction-corrected-approve',
      {
        expectedVersion: correctedSubmit.version,
        clientCommandId: 'correction-corrected-approve',
        decision: 'approve',
      },
    );
    expect(opponentApproval.revisionState).toBe('OFFICIAL');

    // Full-loop assertion: the corrected revision — and only the corrected
    // revision — is OFFICIAL, it points back at the revision it supersedes,
    // and the Game's official pointer resolves to it. The first (CHANGE_
    // REQUESTED) revision is retained untouched, not deleted or mutated.
    const correctedRevisionAfterApproval = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: correctedDraft.revisionId },
    });
    expect(correctedRevisionAfterApproval.state).toBe('OFFICIAL');
    expect(correctedRevisionAfterApproval.supersedesId).toBe(firstDraft.revisionId);
    expect(correctedRevisionAfterApproval.officialAt).not.toBeNull();

    const firstRevisionAfterApproval = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: firstDraft.revisionId },
    });
    expect(firstRevisionAfterApproval.state).toBe('CHANGE_REQUESTED');

    const gameAfterApproval = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(gameAfterApproval.currentOfficialRevisionId).toBe(correctedDraft.revisionId);
    expect(gameAfterApproval.state).toBe(V1GameState.ENDED);
  });
});
