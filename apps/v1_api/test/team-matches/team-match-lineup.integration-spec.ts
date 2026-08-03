import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchLineupService } from '../../src/team-matches/team-match-lineup.service';

const ids = {
  hostOwner: '69000000-0000-4000-8000-000000000001',
  hostP2: '69000000-0000-4000-8000-000000000002',
  hostP3: '69000000-0000-4000-8000-000000000003',
  hostNotAttending: '69000000-0000-4000-8000-000000000004',
  opponentOwner: '69000000-0000-4000-8000-000000000005',
  oppP2: '69000000-0000-4000-8000-000000000006',
  oppP3: '69000000-0000-4000-8000-000000000007',
  strangerUser: '69000000-0000-4000-8000-000000000008',
  sport: '69000000-0000-4000-8000-000000000010',
  region: '69000000-0000-4000-8000-000000000011',
  hostTeam: '69000000-0000-4000-8000-000000000020',
  opponentTeam: '69000000-0000-4000-8000-000000000021',
  futureMatch: '69000000-0000-4000-8000-000000000030',
  pastMatch: '69000000-0000-4000-8000-000000000031',
  futureSchedule: '69000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const service = new TeamMatchLineupService(prisma, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.hostOwner, role: 'team_owner' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

/** Always reads the caller's own current lineup version fresh, rather than
 * hand-tracking it across saves — every save/submit/change-request creates
 * (or reuses) its own revision number, so hardcoding literals is brittle. */
async function currentVersion(userId: string, teamMatchId: string): Promise<number> {
  const view = await service.getLineup(authUser(userId), teamMatchId);
  return view.version;
}

const validHostStarters = [
  { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
  { userId: ids.hostP2, jerseyNumber: 2 },
  { userId: ids.hostP3, jerseyNumber: 3 },
];

const validOpponentStarters = [
  { userId: ids.opponentOwner, jerseyNumber: 1, goalkeeper: true },
  { userId: ids.oppP2, jerseyNumber: 2 },
  { userId: ids.oppP3, jerseyNumber: 3 },
];

describe('Task 14 team-match lineup builder', () => {
  let configId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 14 integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 futsal-v1 preset is required');
    }
    configId = config.id;

    const allUserIds = [
      ids.hostOwner,
      ids.hostP2,
      ids.hostP3,
      ids.hostNotAttending,
      ids.opponentOwner,
      ids.oppP2,
      ids.oppP3,
      ids.strangerUser,
    ];
    await prisma.v1User.createMany({
      data: allUserIds.map((id, index) => ({
        id,
        email: `task14-lineup-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'futsal', name: 'Task 14 Lineup Futsal' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK14_LINEUP_REGION', name: 'Task 14 Lineup Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostOwner, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Lineup Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentOwner, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Lineup Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostOwner, role: 'owner', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostP2, role: 'member', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostP3, role: 'member', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostNotAttending, role: 'member', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentOwner, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.oppP2, role: 'member', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.oppP3, role: 'member', status: 'active' },
      ],
    });

    const futureStartAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.futureMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 14 future lineup match',
        placeName: 'Task 14 futsal court',
        startAt: futureStartAt,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });
    const pastStartAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.pastMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostOwner,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 14 past lineup match',
        placeName: 'Task 14 futsal court',
        startAt: pastStartAt,
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });

    for (const teamMatchId of [ids.futureMatch, ids.pastMatch]) {
      const input: GameSourceCreationInput = {
        sourceType: V1GameSourceType.TEAM_MATCH,
        sourceId: teamMatchId,
        competitionConfigVersionId: configId,
        sides: [
          { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 14 Lineup Host' },
          { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 14 Lineup Opponent' },
        ],
        participants: [],
      };
      await prisma.$transaction((tx) =>
        games.createFromSourceInTransaction(tx, input, creationContext(`lineup-source-${teamMatchId}`, input)),
      );
    }

    await prisma.v1TeamSchedule.create({
      data: {
        id: ids.futureSchedule,
        teamId: ids.hostTeam,
        teamMatchId: ids.futureMatch,
        title: 'Task 14 lineup schedule',
        type: 'MATCH',
        startAt: futureStartAt,
        endAt: new Date(futureStartAt.getTime() + 60 * 60 * 1000),
        timezone: 'Asia/Seoul',
      },
    });
    await prisma.v1ScheduleAttendance.createMany({
      data: [
        { scheduleId: ids.futureSchedule, userId: ids.hostOwner, status: 'GOING' },
        { scheduleId: ids.futureSchedule, userId: ids.hostP2, status: 'GOING' },
        { scheduleId: ids.futureSchedule, userId: ids.hostP3, status: 'GOING' },
        { scheduleId: ids.futureSchedule, userId: ids.hostNotAttending, status: 'NOT_GOING' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a below-minimum roster, duplicate jerseys, and a missing goalkeeper before touching eligibility', async () => {
    const version = await currentVersion(ids.hostOwner, ids.futureMatch);

    const tooFew = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, undefined, {
        expectedVersion: version,
        starters: validHostStarters.slice(0, 2),
        bench: [],
      }),
    );
    expectHttpCode(tooFew, 422, 'LINEUP_SIZE_INVALID');

    const duplicateJersey = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, undefined, {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 1 },
          { userId: ids.hostP3, jerseyNumber: 3 },
        ],
        bench: [],
      }),
    );
    expectHttpCode(duplicateJersey, 422, 'LINEUP_DUPLICATE_JERSEY_NUMBER');

    const noGoalkeeper = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, undefined, {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1 },
          { userId: ids.hostP2, jerseyNumber: 2 },
          { userId: ids.hostP3, jerseyNumber: 3 },
        ],
        bench: [],
      }),
    );
    expectHttpCode(noGoalkeeper, 422, 'LINEUP_GOALKEEPER_INVALID');

    // None of the rejected attempts should have created a new revision.
    expect(await currentVersion(ids.hostOwner, ids.futureMatch)).toBe(version);
  });

  // Task 15 blocker-1 regression: the client used to lose a placed roster member's userId on
  // every hydrate (reopen/conflict-reload) — see lineup.test.tsx's "hydrate-then-add" test —
  // which could let a rebuilt payload carry the same userId twice (once linked, once re-added
  // as if unplaced). The server is the final backstop: reverting this guard makes this test fail.
  it('rejects a save where the same linked userId appears twice across starters and bench', async () => {
    const version = await currentVersion(ids.hostOwner, ids.futureMatch);

    const duplicateParticipant = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, undefined, {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 2 },
          { userId: ids.hostP3, jerseyNumber: 3 },
        ],
        bench: [{ userId: ids.hostP2, jerseyNumber: 12 }],
      }),
    );
    expectHttpCode(duplicateParticipant, 422, 'LINEUP_DUPLICATE_PARTICIPANT');

    // The rejected attempt must not have created a new revision.
    expect(await currentVersion(ids.hostOwner, ids.futureMatch)).toBe(version);
  });

  it('rejects a non-member and a non-attending member, but allows an unlinked guest', async () => {
    const version = await currentVersion(ids.hostOwner, ids.futureMatch);

    const nonMember = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, undefined, {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 2 },
          { userId: ids.strangerUser, jerseyNumber: 3 },
        ],
        bench: [],
      }),
    );
    expectHttpCode(nonMember, 422, 'LINEUP_PARTICIPANT_INELIGIBLE');

    const notAttending = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, undefined, {
        expectedVersion: version,
        starters: [
          { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
          { userId: ids.hostP2, jerseyNumber: 2 },
          { userId: ids.hostNotAttending, jerseyNumber: 3 },
        ],
        bench: [],
      }),
    );
    expectHttpCode(notAttending, 422, 'LINEUP_PARTICIPANT_INELIGIBLE');

    const withGuest = await service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-guest-draft', {
      expectedVersion: version,
      starters: [
        { userId: ids.hostOwner, jerseyNumber: 1, goalkeeper: true },
        { userId: ids.hostP2, jerseyNumber: 2 },
        { displayName: '용병 게스트', jerseyNumber: 3 },
      ],
      bench: [],
    });
    expect(withGuest.state).toBe('DRAFT');
    expect(withGuest.version).toBe(version + 1);

    const view = await service.getLineup(authUser(ids.hostOwner), ids.futureMatch);
    expect(view.starters.map((starter) => starter.displayName)).toContain('용병 게스트');
  });

  it('saves a valid draft, rejects a stale-version resave, submits it, and blocks direct re-edit afterward', async () => {
    const version = await currentVersion(ids.hostOwner, ids.futureMatch);

    const saved = await service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-draft-1', {
      expectedVersion: version,
      starters: validHostStarters,
      bench: [],
    });
    expect(saved).toEqual(
      expect.objectContaining({ teamMatchId: ids.futureMatch, state: 'DRAFT', version: version + 1 }),
    );

    const stale = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-draft-stale', {
        expectedVersion: version, // stale: the previous save already moved the chain to version+1
        starters: validHostStarters,
        bench: [],
      }),
    );
    expectHttpCode(stale, 409, 'VERSION_CONFLICT');

    const view = await service.getLineup(authUser(ids.hostOwner), ids.futureMatch);
    expect(view.starters).toHaveLength(3);
    expect(view.starters.filter((starter) => starter.goalkeeper)).toHaveLength(1);
    expect(view.state).toBe('DRAFT');
    expect(view.version).toBe(saved.version);
    // Task 17: the result-entry screen resolves a scorer/carded player by this
    // real `V1GameParticipant.id` — a name-only lineup payload cannot build
    // `actualParticipants[].participantId` for the result draft.
    expect(view.starters.every((starter) => typeof starter.id === 'string' && starter.id.length > 0)).toBe(true);
    expect(new Set(view.starters.map((starter) => starter.id)).size).toBe(view.starters.length);

    // Two concurrent submits racing against the SAME still-DRAFT revision,
    // each with its own Idempotency-Key (so neither is an idempotent replay
    // of the other) — SERIALIZABLE isolation must let exactly one win.
    const race = await Promise.allSettled([
      service.submitLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-submit-race-a', {
        expectedVersion: saved.version,
      }),
      service.submitLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-submit-race-b', {
        expectedVersion: saved.version,
      }),
    ]);
    const fulfilled = race.filter(
      (outcome): outcome is PromiseFulfilledResult<Awaited<ReturnType<typeof service.submitLineup>>> =>
        outcome.status === 'fulfilled',
    );
    expect(fulfilled).toHaveLength(1);
    expect(race.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

    const submitted = fulfilled[0].value;
    expect(submitted.state).toBe('SUBMITTED');
    expect(submitted.publicLineupAt).not.toBeNull();

    const policy = await prisma.v1GameVisibilityPolicy.findUniqueOrThrow({
      where: { gameId: submitted.gameId },
    });
    const teamMatch = await prisma.v1TeamMatch.findUniqueOrThrow({ where: { id: ids.futureMatch } });
    expect(policy.lineupAt?.getTime()).toBe(teamMatch.startAt.getTime() - 60 * 60 * 1000);

    const editAfterSubmit = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-draft-after-submit', {
        expectedVersion: submitted.version,
        starters: validHostStarters,
        bench: [],
      }),
    );
    expectHttpCode(editAfterSubmit, 409, 'LINEUP_LOCKED_FOR_DIRECT_EDIT');
  });

  it('lets the opponent manager request a change on the other side before lock, but not on their own side', async () => {
    const version = await currentVersion(ids.opponentOwner, ids.futureMatch);
    const oppSaved = await service.saveLineup(authUser(ids.opponentOwner), ids.futureMatch, 'idem-opp-draft-1', {
      expectedVersion: version,
      starters: validOpponentStarters,
      bench: [],
    });
    const oppSubmitted = await service.submitLineup(authUser(ids.opponentOwner), ids.futureMatch, 'idem-opp-submit-1', {
      expectedVersion: oppSaved.version,
    });
    expect(oppSubmitted.state).toBe('SUBMITTED');

    // Host's manager requests a change — this always targets the side the
    // caller does NOT manage, i.e. the opponent's just-submitted lineup.
    const changeRequested = await service.requestChange(authUser(ids.hostOwner), ids.futureMatch, 'idem-change-1', {
      expectedVersion: oppSubmitted.version,
      reason: '등번호를 다시 확인해 주세요',
    });
    expect(changeRequested).toEqual(
      expect.objectContaining({ sideId: oppSubmitted.sideId, state: 'change_requested' }),
    );

    const reopened = await prisma.v1GameLineup.findUniqueOrThrow({ where: { id: changeRequested.lineupId } });
    expect(reopened.state).toBe('DRAFT');
    expect(reopened.supersedesId).toBe(oppSubmitted.lineupId);

    // Requesting again against the now-DRAFT (not yet re-submitted) opponent
    // lineup has nothing SUBMITTED to challenge.
    const nothingToChallenge = await captureFailure(() =>
      service.requestChange(authUser(ids.hostOwner), ids.futureMatch, 'idem-change-2', {
        expectedVersion: reopened.revision,
        reason: 'again',
      }),
    );
    expectHttpCode(nothingToChallenge, 404, 'LINEUP_SUBMISSION_NOT_FOUND');
  });

  it('denies change-request once the match deadline has locked the lineup, and denies a non-participant caller entirely', async () => {
    // `saveLineup`/`submitLineup` both reject once the match has already
    // started (see the separate LINEUP_DEADLINE_PASSED assertion below), so
    // a SUBMITTED-before-deadline lineup for this already-started match is
    // seeded directly rather than through the service.
    const pastGame = await prisma.v1Game.findUniqueOrThrow({ where: { teamMatchId: ids.pastMatch } });
    const pastOpponentSide = await prisma.v1GameSide.findFirstOrThrow({
      where: { gameId: pastGame.id, sideKey: 'AWAY' },
    });
    const pastLineup = await prisma.v1GameLineup.findFirstOrThrow({
      where: { gameId: pastGame.id, sideId: pastOpponentSide.id },
    });
    await prisma.v1GameParticipant.createMany({
      data: validOpponentStarters.map((starter) => ({
        gameId: pastGame.id,
        sideId: pastOpponentSide.id,
        lineupId: pastLineup.id,
        displayNameSnapshot: `player-${starter.jerseyNumber}`,
        jerseyNumber: starter.jerseyNumber,
        position: starter.goalkeeper ? 'GK' : null,
      })),
    });
    await prisma.v1GameLineup.update({
      where: { id: pastLineup.id },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    });

    const lockedChangeRequest = await captureFailure(() =>
      service.requestChange(authUser(ids.hostOwner), ids.pastMatch, 'idem-change-past', {
        expectedVersion: pastLineup.revision,
        reason: '너무 늦었어요',
      }),
    );
    expectHttpCode(lockedChangeRequest, 409, 'LINEUP_LOCKED');

    const lockedRow = await prisma.v1GameLineup.findUniqueOrThrow({ where: { id: pastLineup.id } });
    expect(lockedRow.state).toBe('LOCKED');

    const nonParticipant = await captureFailure(() =>
      service.getLineup(authUser(ids.strangerUser), ids.pastMatch),
    );
    expectHttpCode(nonParticipant, 403, 'PERMISSION_DENIED');

    const submitPastDeadline = await captureFailure(() =>
      service.submitLineup(authUser(ids.hostOwner), ids.pastMatch, 'idem-host-past-submit', {
        expectedVersion: 1,
      }),
    );
    expectHttpCode(submitPastDeadline, 409, 'LINEUP_DEADLINE_PASSED');
  });

  it('replays an identical idempotent save exactly once instead of creating a second revision', async () => {
    const version = await currentVersion(ids.hostOwner, ids.futureMatch);
    const dto = { expectedVersion: version, starters: validHostStarters, bench: [] };

    const first = await service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-replay-key', dto);
    const replay = await service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-replay-key', dto);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(await currentVersion(ids.hostOwner, ids.futureMatch)).toBe(first.version);

    const conflictingPayload = await captureFailure(() =>
      service.saveLineup(authUser(ids.hostOwner), ids.futureMatch, 'idem-host-replay-key', {
        ...dto,
        starters: [...validHostStarters].reverse(),
      }),
    );
    expectHttpCode(conflictingPayload, 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
  });
});
