import {
  Prisma,
  V1GameSourceType,
  V1IdentityActorType,
} from '@prisma/client';

import { buildShowcaseResultParticipantPlan } from './showcase-result-participant-plan';

export interface ExistingShowcaseOfficialRepairInput {
  readonly fixtureId: string;
  readonly tournamentId: string;
  readonly scheduledAt: Date;
  readonly recordedAt: Date;
  readonly homeScore: number;
  readonly awayScore: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly gameId: string;
  readonly currentOfficialRevisionId: string;
  readonly homeSideId: string;
  readonly awaySideId: string;
  readonly homeParticipantId: string;
  readonly awayParticipantId: string;
  readonly homeUserId: string;
  readonly awayUserId: string;
}

function resultFor(goalsFor: number, goalsAgainst: number) {
  if (goalsFor > goalsAgainst) return 'WON';
  if (goalsFor < goalsAgainst) return 'LOST';
  return 'DRAWN';
}

export async function repairExistingShowcaseOfficialResult(
  tx: Prisma.TransactionClient,
  input: ExistingShowcaseOfficialRepairInput,
) {
  const current = await tx.v1GameResultRevision.findUnique({
    where: { id: input.currentOfficialRevisionId },
    select: {
      id: true,
      gameId: true,
      revision: true,
      state: true,
      score: true,
      goalEvents: true,
      eventsHash: true,
      missingScorer: true,
      mvpParticipantId: true,
      outcomeReason: true,
      outcomeNote: true,
      officialAt: true,
      resultParticipants: {
        select: {
          participantId: true,
          sideId: true,
          started: true,
          minutesPlayed: true,
          goals: true,
          assists: true,
          fouls: true,
          cards: true,
          goalkeeper: true,
        },
      },
    },
  });
  if (
    !current
    || current.gameId !== input.gameId
    || current.state !== 'OFFICIAL'
    || current.officialAt === null
  ) {
    throw new Error('Showcase fixture ' + input.fixtureId + ' has an invalid current official revision.');
  }

  const plan = buildShowcaseResultParticipantPlan({
    homeSideId: input.homeSideId,
    awaySideId: input.awaySideId,
    homeParticipantId: input.homeParticipantId,
    awayParticipantId: input.awayParticipantId,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    currentRows: current.resultParticipants,
  });
  for (const identity of [
    { participantId: input.homeParticipantId, userId: input.homeUserId },
    { participantId: input.awayParticipantId, userId: input.awayUserId },
  ]) {
    await tx.v1ParticipantIdentityLinkCurrent.upsert({
      where: { participantId: identity.participantId },
      update: {},
      create: {
        participantId: identity.participantId,
        linkId: 'alpha-showcase-link-' + identity.participantId,
        userId: identity.userId,
        version: 1,
        effectiveFrom: input.recordedAt,
      },
    });
  }
  if (!plan.requiresRevision) return 'preserved' as const;

  const revisionNumber = current.revision + 1;
  const eventsHash = 'alpha-showcase-roster:' + input.fixtureId + ':r' + revisionNumber
    + ':' + input.homeScore + '-' + input.awayScore;
  const revision = await tx.v1GameResultRevision.create({
    data: {
      gameId: input.gameId,
      revision: revisionNumber,
      score: current.score as Prisma.InputJsonValue,
      goalEvents: current.goalEvents === null
        ? Prisma.JsonNull
        : current.goalEvents as Prisma.InputJsonValue,
      eventsHash,
      missingScorer: current.missingScorer,
      mvpParticipantId: current.mvpParticipantId,
      outcomeReason: current.outcomeReason,
      outcomeNote: current.outcomeNote,
      reason: 'Alpha showcase representative participant repair',
      createdByActorType: V1IdentityActorType.SYSTEM,
      createdBySystemActor: 'ALPHA_SHOWCASE_RESULT_SEED',
      supersedesId: current.id,
    },
  });
  await tx.v1GameResultParticipant.createMany({
    data: plan.rows.map((row) => ({
      resultRevisionId: revision.id,
      participantId: row.participantId,
      sideId: row.sideId,
      started: row.started,
      minutesPlayed: row.minutesPlayed,
      goals: row.goals,
      assists: row.assists,
      fouls: row.fouls,
      cards: row.cards as Prisma.InputJsonValue,
      goalkeeper: row.goalkeeper,
    })),
  });
  await tx.v1GameResultRevision.update({
    where: { id: revision.id },
    data: {
      state: 'OFFICIAL',
      submittedAt: input.recordedAt,
      officialAt: input.recordedAt,
    },
  });
  await tx.v1Game.update({
    where: { id: input.gameId },
    data: { currentOfficialRevisionId: revision.id, version: { increment: 1 } },
  });
  await tx.v1GameOfficialFact.create({
    data: {
      revisionId: revision.id,
      gameId: input.gameId,
      revision: revisionNumber,
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      tournamentId: input.tournamentId,
      homeTeamId: input.homeTeamId,
      awayTeamId: input.awayTeamId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      score: current.score as Prisma.InputJsonValue,
      eventsHash,
      officialAt: input.recordedAt,
    },
  });
  await tx.v1TeamRecordFact.createMany({
    data: [
      {
        revisionId: revision.id,
        gameId: input.gameId,
        teamId: input.homeTeamId,
        opponentTeamId: input.awayTeamId,
        tournamentId: input.tournamentId,
        result: resultFor(input.homeScore, input.awayScore),
        goalsFor: input.homeScore,
        goalsAgainst: input.awayScore,
        sourceHash: eventsHash + ':home',
        playedAt: input.scheduledAt,
        officialAt: input.recordedAt,
      },
      {
        revisionId: revision.id,
        gameId: input.gameId,
        teamId: input.awayTeamId,
        opponentTeamId: input.homeTeamId,
        tournamentId: input.tournamentId,
        result: resultFor(input.awayScore, input.homeScore),
        goalsFor: input.awayScore,
        goalsAgainst: input.homeScore,
        sourceHash: eventsHash + ':away',
        playedAt: input.scheduledAt,
        officialAt: input.recordedAt,
      },
    ],
    skipDuplicates: true,
  });
  return 'repaired' as const;
}