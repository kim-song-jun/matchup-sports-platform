/**
 * Task 14 — consent-safe public participant projection.
 *
 * Pure, side-effect-free derivation of what a participant looks like to public
 * consumers (bracket/record pages, etc.). This is intentionally decoupled from
 * Prisma so its rules can be unit-tested without a database:
 *
 * - A participant is only ever named publicly when it currently has an ACTIVE
 *   identity link (`V1ParticipantIdentityLinkCurrent`) AND the linked user's
 *   latest consent snapshot is GRANTED.
 * - `realName` never appears in the public shape — only the linked user's
 *   `nickname` (profile display name) is exposed, because roster
 *   `displayNameSnapshot` entries may contain a real name typed by a team
 *   manager and are never treated as public-safe on their own.
 * - Everything else (no link, revoked/never-granted consent, missing profile)
 *   degrades to the `unlinked` shape, which callers must render as a
 *   pseudonymous/team-only record (`Unlinked guests contribute to team record
 *   only`).
 */

export interface ParticipantProjectionInput {
  participantId: string;
  currentLink: { userId: string } | null;
  latestConsent: { state: 'GRANTED' | 'REVOKED' } | null;
  nickname: string | null;
}

export type PublicParticipantProjection =
  | { participantId: string; kind: 'linked'; nickname: string }
  | { participantId: string; kind: 'unlinked' };

export function projectParticipantForPublic(
  input: ParticipantProjectionInput,
): PublicParticipantProjection {
  const hasActiveLink = input.currentLink !== null;
  const hasGrantedConsent = input.latestConsent?.state === 'GRANTED';
  if (!hasActiveLink || !hasGrantedConsent || input.nickname === null) {
    return { participantId: input.participantId, kind: 'unlinked' };
  }
  return { participantId: input.participantId, kind: 'linked', nickname: input.nickname };
}
