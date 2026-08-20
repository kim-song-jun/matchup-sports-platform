import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient, V1IdentityActorType, V1IdentityLinkAction } from '@prisma/client';

type CandidateRow = { participantId: string; userId: string };
type TournamentRow = { id: string };

export type ParticipantIdentityLinkBackfillResult = {
  tournamentId: string;
  mode: 'dry-run' | 'apply';
  candidates: number;
  linked: number;
};

type MigrationReadClient = Pick<PrismaClient, '$queryRaw'>;

async function assertTournamentExists(
  client: MigrationReadClient,
  tournamentId: string,
): Promise<void> {
  const rows = await client.$queryRaw<TournamentRow[]>`
    SELECT tournament.id
    FROM v1_tournaments tournament
    WHERE tournament.id = ${tournamentId}
    LIMIT 1
  `;
  if (rows.length === 0) {
    throw new Error(`Tournament not found: ${tournamentId}`);
  }
}

/**
 * Finds only participant rows that already contributed to the current
 * OFFICIAL result of the requested tournament. The persisted participant
 * userId is the roster assertion; rows with any identity history are excluded
 * so a rejected/revoked link can never be resurrected by repair work.
 */
async function collectCandidates(
  client: MigrationReadClient,
  tournamentId: string,
): Promise<CandidateRow[]> {
  return client.$queryRaw<CandidateRow[]>`
    SELECT DISTINCT
      participant.id AS participantId,
      participant.user_id AS userId
    FROM v1_game_result_participants result_participant
    JOIN v1_game_result_revisions revision
      ON revision.id = result_participant.result_revision_id
    JOIN v1_games game
      ON game.id = revision.game_id
     AND game.current_official_revision_id = revision.id
    JOIN v1_tournament_fixtures fixture
      ON fixture.id = game.tournament_fixture_id
    JOIN v1_game_participants participant
      ON participant.id = result_participant.participant_id
    WHERE fixture.tournament_id = ${tournamentId}
      AND revision.state = 'OFFICIAL'
      AND revision.official_at IS NOT NULL
      AND participant.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM v1_participant_identity_link_current current_link
        WHERE current_link.participant_id = participant.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM v1_participant_identity_link_events identity_event
        WHERE identity_event.participant_id = participant.id
      )
    ORDER BY participant.id ASC
  `;
}

const SERIALIZABLE_RETRY_LIMIT = 3;

export async function runParticipantIdentityLinkBackfill(
  prisma: PrismaClient,
  input: { tournamentId: string; mode: 'dry-run' | 'apply' },
): Promise<ParticipantIdentityLinkBackfillResult> {
  if (input.mode === 'dry-run') {
    await assertTournamentExists(prisma, input.tournamentId);
    const candidates = await collectCandidates(prisma, input.tournamentId);
    return {
      tournamentId: input.tournamentId,
      mode: input.mode,
      candidates: candidates.length,
      linked: 0,
    };
  }

  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const readClient = tx as unknown as MigrationReadClient;
          await assertTournamentExists(readClient, input.tournamentId);
          const candidates = await collectCandidates(readClient, input.tournamentId);
          for (const candidate of candidates) {
            const linkId = randomUUID();
            const event = await tx.v1ParticipantIdentityLinkEvent.create({
              data: {
                participantId: candidate.participantId,
                linkId,
                eventVersion: 1,
                requestId: linkId,
                action: V1IdentityLinkAction.ROSTER_ASSERTED,
                userId: candidate.userId,
                actorType: V1IdentityActorType.SYSTEM,
                systemActor: 'GAME_BACKFILL',
                reason: `tournament:${input.tournamentId}:source-participant-user-id`,
              },
            });
            await tx.v1ParticipantIdentityLinkCurrent.create({
              data: {
                participantId: candidate.participantId,
                linkId,
                userId: candidate.userId,
                version: event.eventVersion,
                effectiveFrom: event.effectiveAt,
              },
            });
          }
          return {
            tournamentId: input.tournamentId,
            mode: input.mode,
            candidates: candidates.length,
            linked: candidates.length,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002');
      if (!retryable || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
    }
  }

  throw new Error('Participant identity-link backfill retry limit was exhausted');
}
