import { createHash } from 'node:crypto';
import { Prisma, V1GameOfficialFactSourceType, V1GameSourceType, V1IdentityActorType, V1TeamMatchStatus, V1VisibilityMode } from '@prisma/client';

export type CanonicalTournamentSeedMatch = {
  readonly tournamentId: string;
  readonly sportId: string;
  readonly competitionConfigVersionId: string;
  readonly title: string;
  readonly startAt: Date;
  readonly placeName: string;
  readonly status: V1TeamMatchStatus;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeTeamName: string;
  readonly awayTeamName: string;
  readonly hostTeamId: string;
  readonly groupId: string | null;
  readonly round: string;
  readonly fixtureNumber: number;
  readonly legNumber?: number;
  readonly homeRegistrationId: string;
  readonly awayRegistrationId: string;
  readonly matchId: string;
  readonly homePlayers?: readonly { userId: string; displayName: string; jerseyNumber: number }[];
  readonly awayPlayers?: readonly { userId: string; displayName: string; jerseyNumber: number }[];
};

function resultFor(goalsFor: number, goalsAgainst: number): 'WON' | 'LOST' | 'DRAWN' {
  if (goalsFor > goalsAgainst) return 'WON';
  if (goalsFor < goalsAgainst) return 'LOST';
  return 'DRAWN';
}

export function deterministicCanonicalMatchId(namespace: string): string {
  const hex = createHash('sha256').update(namespace).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export async function ensureCanonicalTournamentMatch(
  tx: Prisma.TransactionClient,
  input: CanonicalTournamentSeedMatch,
) {
  const legNumber = input.legNumber ?? 1;
  const existingDetails = await tx.v1TournamentMatchDetails.findUnique({
    where: {
      tournamentId_round_fixtureNumber_legNumber: {
        tournamentId: input.tournamentId,
        round: input.round,
        fixtureNumber: input.fixtureNumber,
        legNumber,
      },
    },
    select: { teamMatchId: true },
  });
  const matchId = existingDetails?.teamMatchId ?? input.matchId;
  const common = {
    hostTeamId: input.hostTeamId,
    sportId: input.sportId,
    title: input.title,
    placeName: input.placeName,
    startAt: input.startAt,
    approvedApplicantTeamId: input.awayTeamId,
    competitionConfigVersionId: input.competitionConfigVersionId,
    tournamentId: input.tournamentId,
  };
  const existingTeamMatch = await tx.v1TeamMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      tournamentId: true,
      sportId: true,
      competitionConfigVersionId: true,
      hostTeamId: true,
      approvedApplicantTeamId: true,
      game: { select: { id: true, sourceType: true, teamMatchId: true, competitionConfigVersionId: true, currentOfficialRevisionId: true } },
    },
  });
  if (existingTeamMatch && (
    existingTeamMatch.tournamentId !== input.tournamentId
    || existingTeamMatch.sportId !== input.sportId
    || existingTeamMatch.competitionConfigVersionId !== input.competitionConfigVersionId
    || existingTeamMatch.hostTeamId !== input.hostTeamId
    || existingTeamMatch.approvedApplicantTeamId !== input.awayTeamId
    || (existingTeamMatch.game && (
      existingTeamMatch.game.sourceType !== V1GameSourceType.TEAM_MATCH
      || existingTeamMatch.game.teamMatchId !== matchId
      || existingTeamMatch.game.competitionConfigVersionId !== input.competitionConfigVersionId
    ))
  )) {
    throw new Error(`Canonical seed match ${matchId} has an incompatible existing ownership or source binding.`);
  }
  const existingDetailsFull = existingDetails
    ? await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: matchId }, select: { tournamentId: true, groupId: true, round: true, fixtureNumber: true, legNumber: true, homeRegistrationId: true, awayRegistrationId: true } })
    : null;
  if (existingDetailsFull && (
    existingDetailsFull.tournamentId !== input.tournamentId
    || existingDetailsFull.groupId !== input.groupId
    || existingDetailsFull.round !== input.round
    || existingDetailsFull.fixtureNumber !== input.fixtureNumber
    || existingDetailsFull.legNumber !== legNumber
    || existingDetailsFull.homeRegistrationId !== input.homeRegistrationId
    || existingDetailsFull.awayRegistrationId !== input.awayRegistrationId
  )) {
    throw new Error(`Canonical seed match ${matchId} has incompatible tournament details.`);
  }
  const teamMatch = await tx.v1TeamMatch.upsert({
    where: { id: matchId },
    update: { title: input.title, placeName: input.placeName },
    create: { id: matchId, ...common, status: input.status },
    select: { id: true, game: { select: { id: true, currentOfficialRevisionId: true } } },
  });
  const hadExistingGame = teamMatch.game !== null;
  await tx.v1TournamentMatchDetails.upsert({
    where: { teamMatchId: teamMatch.id },
    update: {},
    create: {
      teamMatchId: teamMatch.id,
      tournamentId: input.tournamentId,
      groupId: input.groupId,
      round: input.round,
      fixtureNumber: input.fixtureNumber,
      legNumber,
      homeRegistrationId: input.homeRegistrationId,
      awayRegistrationId: input.awayRegistrationId,
    },
  });

  let game = teamMatch.game;
  if (!game) {
    const created = await tx.v1Game.create({
      data: {
        sourceType: V1GameSourceType.TEAM_MATCH,
        teamMatchId: teamMatch.id,
        competitionConfigVersionId: input.competitionConfigVersionId,
      },
      select: { id: true, currentOfficialRevisionId: true },
    });
    game = created;
  }
  const sideInputs = [
    { sideKey: 'HOME' as const, teamId: input.homeTeamId, name: input.homeTeamName, players: input.homePlayers ?? [] },
    { sideKey: 'AWAY' as const, teamId: input.awayTeamId, name: input.awayTeamName, players: input.awayPlayers ?? [] },
  ];
  for (const sideInput of sideInputs) {
    const existingSide = await tx.v1GameSide.findUnique({
      where: { gameId_sideKey: { gameId: game.id, sideKey: sideInput.sideKey } },
      select: { id: true, teamId: true, displayNameSnapshot: true },
    });
    if (hadExistingGame && (!existingSide || existingSide.teamId !== sideInput.teamId)) {
      throw new Error(`Canonical seed game ${game.id} has an incompatible ${sideInput.sideKey} side snapshot.`);
    }
    const side = existingSide ?? await tx.v1GameSide.create({
      data: { gameId: game.id, sideKey: sideInput.sideKey, teamId: sideInput.teamId, displayNameSnapshot: sideInput.name },
      select: { id: true },
    });
    const existingLineup = await tx.v1GameLineup.findUnique({
      where: { gameId_sideId_revision: { gameId: game.id, sideId: side.id, revision: 1 } },
      select: { id: true },
    });
    if (hadExistingGame && !existingLineup) {
      throw new Error(`Canonical seed game ${game.id} is missing its revision-1 ${sideInput.sideKey} lineup.`);
    }
    const lineup = existingLineup ?? await tx.v1GameLineup.create({
      data: { gameId: game.id, sideId: side.id, revision: 1 },
      select: { id: true },
    });
    for (const player of sideInput.players) {
      const participantId = deterministicCanonicalMatchId(`${game.id}:${sideInput.sideKey}:${player.userId}`);
      const existingParticipant = await tx.v1GameParticipant.findUnique({
        where: { id: participantId },
        select: { id: true, gameId: true, sideId: true, lineupId: true, userId: true, displayNameSnapshot: true, jerseyNumber: true },
      });
    if (hadExistingGame && (!existingParticipant
        || existingParticipant.gameId !== game.id
        || existingParticipant.sideId !== side.id
        || existingParticipant.userId !== player.userId)) {
        throw new Error(`Canonical seed participant ${participantId} has an incompatible operational snapshot.`);
      }
      const participant = existingParticipant ?? await tx.v1GameParticipant.create({
        data: { id: participantId, gameId: game.id, sideId: side.id, lineupId: lineup.id, userId: player.userId, displayNameSnapshot: player.displayName, jerseyNumber: player.jerseyNumber, started: true },
        select: { id: true },
      });
      const identity = await tx.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId: participant.id }, select: { userId: true } });
      if (identity && identity.userId !== player.userId) {
        throw new Error(`Canonical seed participant ${participant.id} is linked to a different user.`);
      }
      if (!hadExistingGame) {
        await tx.v1ParticipantIdentityLinkCurrent.create({
          data: {
            participantId: participant.id,
            linkId: deterministicCanonicalMatchId(`${participant.id}:identity`),
            userId: player.userId,
            version: 1,
            effectiveFrom: input.startAt,
          },
        });
      }
    }
  }
  await Promise.all([
    tx.v1GamePeriod.upsert({ where: { gameId_number: { gameId: game.id, number: 1 } }, update: {}, create: { gameId: game.id, number: 1 } }),
    tx.v1GamePeriod.upsert({ where: { gameId_number: { gameId: game.id, number: 2 } }, update: {}, create: { gameId: game.id, number: 2 } }),
    tx.v1GameVisibilityPolicy.upsert({ where: { gameId: game.id }, update: {}, create: { gameId: game.id, mode: input.status === V1TeamMatchStatus.completed ? V1VisibilityMode.OFFICIAL_ONLY : V1VisibilityMode.LIVE } }),
  ]);
  return { id: teamMatch.id, gameId: game.id, currentOfficialRevisionId: game.currentOfficialRevisionId, isPristineGame: !hadExistingGame };
}

export async function ensureCanonicalOfficialResult(
  tx: Prisma.TransactionClient,
  input: { readonly gameId: string; readonly tournamentId: string; readonly homeTeamId: string; readonly awayTeamId: string; readonly homeScore: number; readonly awayScore: number; readonly playedAt: Date; readonly recordedAt: Date; readonly sourceHash: string },
) {
  const game = await tx.v1Game.findUnique({
    where: { id: input.gameId },
    select: {
      sourceType: true,
      teamMatchId: true,
      currentOfficialRevisionId: true,
      currentOfficialRevision: {
        select: {
          gameId: true,
          revision: true,
          state: true,
          officialAt: true,
          eventsHash: true,
          officialFact: { select: { revision: true, sourceType: true, tournamentId: true, homeTeamId: true, awayTeamId: true, gameId: true, eventsHash: true, officialAt: true } },
        },
      },
      resultRevisions: { select: { id: true }, orderBy: { revision: 'desc' }, take: 1 },
    },
  });
  if (!game) throw new Error(`Canonical seed game ${input.gameId} was not found.`);
  if (game.sourceType !== V1GameSourceType.TEAM_MATCH || game.teamMatchId === null) {
    throw new Error(`Canonical seed game ${input.gameId} has an incompatible source binding.`);
  }
  if (game.currentOfficialRevisionId) {
    const revision = game.currentOfficialRevision;
    if (
      !revision
      || revision.gameId !== input.gameId
      || revision.state !== 'OFFICIAL'
      || revision.officialAt === null
      || !revision.officialFact
      || revision.officialFact.revision !== revision.revision
      || revision.officialFact.sourceType !== V1GameOfficialFactSourceType.TEAM_MATCH
      || revision.officialFact.gameId !== input.gameId
      || revision.officialFact.tournamentId !== input.tournamentId
      || revision.officialFact.homeTeamId !== input.homeTeamId
      || revision.officialFact.awayTeamId !== input.awayTeamId
      || revision.officialFact.eventsHash !== revision.eventsHash
      || revision.officialFact.officialAt.getTime() !== revision.officialAt.getTime()
    ) {
      throw new Error(`Canonical seed game ${input.gameId} has an invalid current official result.`);
    }
    return game.currentOfficialRevisionId;
  }
  if (game.resultRevisions.length > 0) {
    throw new Error(`Canonical seed game ${input.gameId} has a non-official revision without a current official pointer.`);
  }
  const revision = await tx.v1GameResultRevision.create({
    data: {
      gameId: input.gameId,
      revision: 1,
      state: 'DRAFT',
      score: { home: input.homeScore, away: input.awayScore },
      goalEvents: [],
      eventsHash: input.sourceHash,
      createdByActorType: V1IdentityActorType.SYSTEM,
      createdBySystemActor: 'ALPHA_TOURNAMENT_SEED',
    },
  });
  await tx.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL', submittedAt: input.recordedAt, officialAt: input.recordedAt } });
  await tx.v1Game.update({ where: { id: input.gameId }, data: { currentOfficialRevisionId: revision.id, state: 'ENDED' } });
  await tx.v1GameOfficialFact.create({
    data: { revisionId: revision.id, gameId: input.gameId, revision: 1, sourceType: V1GameOfficialFactSourceType.TEAM_MATCH, tournamentId: input.tournamentId, homeTeamId: input.homeTeamId, awayTeamId: input.awayTeamId, homeScore: input.homeScore, awayScore: input.awayScore, score: { home: input.homeScore, away: input.awayScore }, eventsHash: input.sourceHash, officialAt: input.recordedAt },
  });
  await tx.v1TeamRecordFact.createMany({
    data: [
      { revisionId: revision.id, gameId: input.gameId, teamId: input.homeTeamId, opponentTeamId: input.awayTeamId, tournamentId: input.tournamentId, result: resultFor(input.homeScore, input.awayScore), goalsFor: input.homeScore, goalsAgainst: input.awayScore, sourceHash: `${input.sourceHash}:home`, playedAt: input.playedAt, officialAt: input.recordedAt },
      { revisionId: revision.id, gameId: input.gameId, teamId: input.awayTeamId, opponentTeamId: input.homeTeamId, tournamentId: input.tournamentId, result: resultFor(input.awayScore, input.homeScore), goalsFor: input.awayScore, goalsAgainst: input.homeScore, sourceHash: `${input.sourceHash}:away`, playedAt: input.playedAt, officialAt: input.recordedAt },
    ],
    skipDuplicates: true,
  });
  return revision.id;
}
