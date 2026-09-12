import { Prisma, V1GameSideKey, V1GameSourceType, V1VisibilityMode } from '@prisma/client';

type SideInput = { sideKey: 'HOME' | 'AWAY'; teamId?: string | null; displayNameSnapshot: string };
type ParticipantInput = {
  sideKey: 'HOME' | 'AWAY';
  userId?: string;
  displayNameSnapshot: string;
  jerseyNumber?: number;
  position?: string;
};

type CanonicalGameAggregateInput = {
  sourceType: typeof V1GameSourceType.TEAM_MATCH;
  sourceId: string;
  competitionConfigVersionId: string;
  state?: 'SCHEDULED' | 'CANCELLED';
  sides: readonly SideInput[];
  participants: readonly ParticipantInput[];
  periodCount: number;
  visibilityMode: V1VisibilityMode;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Creates the canonical TeamMatch-owned game aggregate used by runtime and historical import. */
export async function persistCanonicalGameAggregate(
  tx: Prisma.TransactionClient,
  input: CanonicalGameAggregateInput,
  onIdentity?: (participantId: string, userId: string) => Promise<void>,
) {
  if (input.sourceType !== V1GameSourceType.TEAM_MATCH) {
    throw new Error('CANONICAL_GAME_SOURCE_REQUIRED');
  }

  const game = await tx.v1Game.create({
    data: {
      sourceType: V1GameSourceType.TEAM_MATCH,
      teamMatchId: input.sourceId,
      competitionConfigVersionId: input.competitionConfigVersionId,
      state: input.state,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    },
  });
  const sides = new Map<'HOME' | 'AWAY', { id: string; lineupId: string }>();
  for (const sideInput of input.sides) {
    const side = await tx.v1GameSide.create({
      data: {
        gameId: game.id,
        sideKey: sideInput.sideKey as V1GameSideKey,
        teamId: sideInput.teamId ?? null,
        displayNameSnapshot: sideInput.displayNameSnapshot,
      },
    });
    const lineup = await tx.v1GameLineup.create({ data: { gameId: game.id, sideId: side.id, revision: 1 } });
    sides.set(sideInput.sideKey, { id: side.id, lineupId: lineup.id });
  }
  for (const participant of input.participants) {
    const side = sides.get(participant.sideKey);
    if (!side) throw new Error('PARTICIPANT_INVALID');
    const created = await tx.v1GameParticipant.create({
      data: {
        gameId: game.id,
        sideId: side.id,
        lineupId: side.lineupId,
        userId: participant.userId,
        displayNameSnapshot: participant.displayNameSnapshot,
        jerseyNumber: participant.jerseyNumber,
        position: participant.position,
      },
      select: { id: true },
    });
    if (participant.userId && onIdentity) await onIdentity(created.id, participant.userId);
  }
  if (input.periodCount > 0) {
    await tx.v1GamePeriod.createMany({
      data: Array.from({ length: input.periodCount }, (_, index) => ({ gameId: game.id, number: index + 1 })),
    });
  }
  await tx.v1GameVisibilityPolicy.create({ data: { gameId: game.id, mode: input.visibilityMode } });
  return game;
}
