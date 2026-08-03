import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Task 24 -- consent-gated personal projection eligibility.
 *
 * Binding source: the plan's "Consent truth table" + D-03/D-11. Consent is
 * versioned *per participant snapshot* (one row per single game-appearance),
 * never globally per user, so eligibility must be evaluated per
 * `V1GameParticipant` row, not once per user.
 *
 * The whole truth table collapses into one rule when read against the
 * *latest* consent snapshot tied to the participant's *current* identity
 * link:
 *
 * - No current link at all (unlinked guest, or a link that was later
 *   removed) -> never eligible. This is also true immediately after an
 *   "unlink" -- `V1ParticipantIdentityLinkCurrent` simply has no row (or a
 *   different linkId) once a link is revoked, so the guard falls out for
 *   free without a separate "was this ever linked" branch.
 * - Two-party link attested without any consent snapshot yet -> no snapshot
 *   exists, so `latest` is `undefined` -> not eligible ("null consent
 *   version" in the truth table).
 * - Latest snapshot state is `REVOKED` -> not eligible, *including* every
 *   row that predates the revoke ("all identity-linked career rows,
 *   including pre-T3 rows, hide immediately").
 * - Latest snapshot state is `GRANTED` -> eligible only for games whose
 *   `officialAt` is at or after that snapshot's `effectiveAt` ("no pre-T2
 *   backfill"; after a revoke+regrant cycle, "only events at/after T4
 *   become eligible; hidden older rows stay hidden" -- because the *older*
 *   grant's effectiveAt is no longer the latest one being compared against).
 */
export type PublicConsentState = 'GRANTED' | 'REVOKED';

export interface ParticipantConsentEligibility {
  readonly participantId: string;
  /** The user this participant row is currently linked to, or null if unlinked. */
  readonly linkedUserId: string | null;
  readonly latestConsentState: PublicConsentState | null;
  readonly latestConsentEffectiveAt: Date | null;
}

/**
 * Pure decision: is this participant's identity eligible to appear in a
 * public personal projection (career record, named lineup slot, named
 * event/MVP attribution) for a fact whose authoritative time is
 * `factOfficialAt`?
 *
 * `factOfficialAt` is `null` for a game that has no official result yet
 * (still live/pending) -- callers evaluating "is this participant
 * *currently* nameable right now" (e.g. a live lineup) should pass the
 * current time instead.
 */
export function isParticipantPubliclyEligible(
  row: ParticipantConsentEligibility,
  factOfficialAt: Date,
): boolean {
  if (row.linkedUserId === null) return false;
  if (row.latestConsentState !== 'GRANTED') return false;
  if (row.latestConsentEffectiveAt === null) return false;
  return row.latestConsentEffectiveAt.getTime() <= factOfficialAt.getTime();
}

/**
 * Batch-loads current-link + latest-consent state for a set of
 * `V1GameParticipant` IDs. Returns a Map keyed by participantId; a missing
 * key means "no current link at all" (unlinked guest), which callers must
 * treat as never-eligible.
 */
export async function loadParticipantConsentEligibility(
  prisma: PrismaService,
  participantIds: readonly string[],
): Promise<Map<string, ParticipantConsentEligibility>> {
  const result = new Map<string, ParticipantConsentEligibility>();
  const uniqueIds = Array.from(new Set(participantIds));
  if (uniqueIds.length === 0) return result;

  const links = await prisma.v1ParticipantIdentityLinkCurrent.findMany({
    where: { participantId: { in: uniqueIds } },
    select: { participantId: true, linkId: true, userId: true },
  });
  if (links.length === 0) return result;

  const linkIds = links.map((link) => link.linkId);
  // Ordered by consentVersion desc so the first snapshot seen per linkId in
  // the loop below is the latest one -- no separate groupBy/aggregate pass.
  const snapshots = await prisma.v1ParticipantConsentSnapshot.findMany({
    where: { linkId: { in: linkIds } },
    orderBy: { consentVersion: 'desc' },
    select: { linkId: true, state: true, effectiveAt: true },
  });
  const latestByLinkId = new Map<string, { state: PublicConsentState; effectiveAt: Date }>();
  for (const snapshot of snapshots) {
    if (!latestByLinkId.has(snapshot.linkId)) {
      latestByLinkId.set(snapshot.linkId, { state: snapshot.state, effectiveAt: snapshot.effectiveAt });
    }
  }

  for (const link of links) {
    const latest = latestByLinkId.get(link.linkId) ?? null;
    result.set(link.participantId, {
      participantId: link.participantId,
      linkedUserId: link.userId,
      latestConsentState: latest?.state ?? null,
      latestConsentEffectiveAt: latest?.effectiveAt ?? null,
    });
  }
  return result;
}

/** Non-eligible/unlinked default -- used so lookups never need an `undefined` branch. */
export function unlinkedParticipant(participantId: string): ParticipantConsentEligibility {
  return {
    participantId,
    linkedUserId: null,
    latestConsentState: null,
    latestConsentEffectiveAt: null,
  };
}
