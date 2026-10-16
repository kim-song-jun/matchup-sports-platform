import { ConflictException } from '@nestjs/common';
import type { Prisma, V1GameLineupState, V1GameParticipant, V1GameState } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import type { OperationAuditActor } from '../../common/audit/operation-audit.contract';
import { carryRevokedConsent, loadRevokedConsentByUserId } from '../../team-matches/lineup-consent-carry';
import { TEAM_MATCH_ROSTER_DEPENDENT_EVENT_TYPES } from '../core/team-match-lineup-window';
import { createSourceRosterIdentityLinks } from '../games.service';

type Tx = Prisma.TransactionClient;
export const FRIENDLY_DEFAULT_ROSTER_FROZEN = 'FRIENDLY_DEFAULT_ROSTER_FROZEN';
export const FRIENDLY_LINEUP_DRAFT_SAVED = 'LINEUP_DRAFT_SAVED';
export const FRIENDLY_DEFAULT_ROSTER_ARRIVAL = 'FRIENDLY_DEFAULT_ROSTER_ARRIVAL';
const auditWriter = new OperationAuditWriterService();
const UUID_NAMESPACE = Buffer.from('9d48042cd1fe50c6a7dfd9cd1c7fa07b', 'hex');

interface Lineup {
  readonly id: string;
  readonly sideId: string;
  readonly revision: number;
  readonly state: V1GameLineupState;
  readonly submittedAt?: Date | null;
  readonly invalidatedAt?: Date | null;
}

export interface FriendlyRosterGame {
  readonly id: string;
  readonly state: V1GameState;
  readonly teamMatch: { readonly leagueId: string | null; readonly tournamentId: string | null } | null;
  readonly sides: readonly { readonly id: string; readonly teamId: string | null }[];
  readonly lineups: readonly Lineup[];
  readonly participants: readonly V1GameParticipant[];
  readonly sharedRecord?: { readonly version: number } | null;
  readonly resultRevisions?: readonly { readonly id: string }[];
}

export type FriendlyRosterSource = 'MANUAL' | 'DEFAULT_PREVIEW' | 'DEFAULT_FROZEN' | 'BLOCKED';
export interface FriendlyEffectiveSide {
  readonly sideId: string;
  readonly teamId: string;
  readonly source: FriendlyRosterSource;
  readonly hasSavedDraft: boolean;
  readonly lineup: Lineup | null;
  readonly participants: readonly V1GameParticipant[];
}
export interface FriendlyEffectiveRoster {
  readonly gameId: string;
  readonly sides: readonly FriendlyEffectiveSide[];
  readonly participants: V1GameParticipant[];
  readonly ready: boolean;
  readonly arrivalSequence: number;
}

interface DefaultArrival {
  readonly sideId: string;
  readonly teamId: string;
  readonly userId: string;
  readonly sequence: number;
  readonly arrivedAt: Date | null;
}

function arrivalKey(sideId: string, teamId: string, userId: string): string {
  return JSON.stringify([sideId, teamId, userId]);
}

function readDefaultArrival(value: Prisma.JsonValue): DefaultArrival | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.sideId !== 'string' || typeof value.teamId !== 'string' || typeof value.userId !== 'string' ||
    typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1 ||
    (value.arrivedAt !== null && typeof value.arrivedAt !== 'string')) return null;
  const arrivedAt = value.arrivedAt === null ? null : new Date(value.arrivedAt);
  if (arrivedAt !== null && Number.isNaN(arrivedAt.getTime())) return null;
  return { sideId: value.sideId, teamId: value.teamId, userId: value.userId, sequence: value.sequence, arrivedAt };
}

/** UUIDv5 over immutable scope; the read-only preview and its first persisted snapshot share these IDs. */
export function friendlyDefaultParticipantId(gameId: string, sideId: string, basisLineupId: string, userId: string): string {
  const bytes = createHash('sha1').update(UUID_NAMESPACE).update(JSON.stringify([gameId, sideId, basisLineupId, userId])).digest();
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function frozenLineupIds(audits: readonly { readonly actorType: string; readonly systemActor: string | null; readonly action: string; readonly after: Prisma.JsonValue }[]): ReadonlySet<string> {
  return new Set(audits.flatMap((audit) => {
    const value = audit.after;
    if (audit.actorType !== 'SYSTEM' || audit.systemActor !== FRIENDLY_DEFAULT_ROSTER_FROZEN || audit.action !== FRIENDLY_DEFAULT_ROSTER_FROZEN || value === null || typeof value !== 'object' || Array.isArray(value)) return [];
    return typeof value.lineupId === 'string' ? [value.lineupId] : [];
  }));
}

export async function readFriendlyEffectiveRoster(tx: Tx, gameId: string): Promise<FriendlyEffectiveRoster | null> {
  const game = await tx.v1Game.findUnique({ where: { id: gameId }, include: {
    teamMatch: { select: { leagueId: true, tournamentId: true } }, sides: true,
    lineups: { orderBy: { revision: 'desc' } }, participants: true, sharedRecord: true,
    resultRevisions: { take: 1, select: { id: true } },
  } });
  return game === null ? null : loadFriendlyEffectiveRoster(tx, game);
}

/** Current defaults are a projection. Only a successful, authorized command may persist them. */
export async function loadFriendlyEffectiveRoster(tx: Tx, game: FriendlyRosterGame): Promise<FriendlyEffectiveRoster | null> {
  if (game.teamMatch === null || game.teamMatch.leagueId !== null || game.teamMatch.tournamentId !== null) return null;
  const assigned = game.sides.filter((side): side is { readonly id: string; readonly teamId: string } => side.teamId !== null);
  const allManual = assigned.every((side) => {
    const latest = game.lineups.filter((lineup) => lineup.sideId === side.id).sort((a, b) => b.revision - a.revision)[0];
    return latest !== undefined && latest.invalidatedAt == null && (latest.state === 'SUBMITTED' || latest.state === 'LOCKED');
  });
  const audits = allManual ? [] : await tx.v1OperationAudit.findMany({
    where: { resourceType: 'GAME', resourceId: game.id, action: { in: [FRIENDLY_DEFAULT_ROSTER_FROZEN, FRIENDLY_LINEUP_DRAFT_SAVED, FRIENDLY_DEFAULT_ROSTER_ARRIVAL, 'LINEUP_CHANGE_REQUESTED'] } },
    select: { actorType: true, systemActor: true, action: true, after: true },
  });
  const frozen = frozenLineupIds(audits);
  const arrivals = new Map<string, DefaultArrival>();
  let arrivalSequence = 0;
  for (const audit of audits) {
    if (audit.actorType !== 'USER' || audit.action !== FRIENDLY_DEFAULT_ROSTER_ARRIVAL) continue;
    const arrival = readDefaultArrival(audit.after);
    if (arrival === null) continue;
    arrivalSequence = Math.max(arrivalSequence, arrival.sequence);
    const key = arrivalKey(arrival.sideId, arrival.teamId, arrival.userId);
    if ((arrivals.get(key)?.sequence ?? 0) < arrival.sequence) arrivals.set(key, arrival);
  }
  const savedDraftIds = new Set(audits.flatMap((audit) => {
    const value = audit.after;
    if (audit.actorType !== 'USER' || audit.action !== FRIENDLY_LINEUP_DRAFT_SAVED || value === null || typeof value !== 'object' || Array.isArray(value)) return [];
    return typeof value.lineupId === 'string' ? [value.lineupId] : [];
  }));
  const pending: FriendlyEffectiveSide[] = assigned.map((side) => {
    const history = game.lineups.filter((lineup) => lineup.sideId === side.id).sort((a, b) => b.revision - a.revision);
    const latest = history[0] ?? null;
    const participants = latest === null ? [] : game.participants.filter((participant) => participant.sideId === side.id && participant.lineupId === latest.id);
    const humanHistory = history.some((lineup) => lineup.state === 'SUBMITTED' || lineup.state === 'LOCKED' || lineup.submittedAt != null);
    const reviewPending = audits.some((audit) => {
      const value = audit.after;
      return audit.action === 'LINEUP_CHANGE_REQUESTED' && value !== null && typeof value === 'object' && !Array.isArray(value) && value.sideId === side.id;
    });
    const source: FriendlyRosterSource = latest === null || latest.invalidatedAt != null
      ? 'BLOCKED'
      : latest.state === 'SUBMITTED' || latest.state === 'LOCKED'
        ? 'MANUAL'
        : humanHistory || reviewPending || latest.state !== 'DRAFT'
          ? 'BLOCKED'
          : frozen.has(latest.id) ? 'DEFAULT_FROZEN' : 'DEFAULT_PREVIEW';
    return {
      sideId: side.id, teamId: side.teamId, lineup: latest, source,
      hasSavedDraft: source === 'DEFAULT_PREVIEW' && latest !== null && (latest.revision > 1 || savedDraftIds.has(latest.id)),
      participants: source === 'BLOCKED' ? [] : participants,
    };
  });
  const preview = pending.filter((side) => side.source === 'DEFAULT_PREVIEW');
  const hasRecord = preview.length > 0 && (game.state === 'ENDED' || game.state === 'CANCELLED' || game.sharedRecord != null || (game.resultRevisions?.length ?? 0) > 0 || await tx.v1GameEvent.findFirst({
    where: { gameId: game.id, type: { in: [...TEAM_MATCH_ROSTER_DEPENDENT_EVENT_TYPES] } }, select: { id: true },
  }) !== null);
  const members = preview.length === 0 || hasRecord ? [] : await tx.v1TeamMembership.findMany({
    where: { teamId: { in: preview.map((side) => side.teamId) }, status: 'active', team: { status: 'active', deletedAt: null }, user: { accountStatus: 'active', deletedAt: null } },
    orderBy: [{ teamId: 'asc' }, { id: 'asc' }],
    select: { userId: true, teamId: true, jerseyNumber: true, user: { select: { profile: { select: { nickname: true, displayName: true, deletedAt: true } } } } },
  });
  const sides = pending.map((side): FriendlyEffectiveSide => {
    if (side.source !== 'DEFAULT_PREVIEW' || side.lineup === null) return side;
    if (hasRecord) return { ...side, source: 'BLOCKED', participants: [] };
    const basisId = side.lineup.id;
    return { ...side, participants: members.filter((member) => member.teamId === side.teamId).map((member): V1GameParticipant => {
      const arrival = arrivals.get(arrivalKey(side.sideId, side.teamId, member.userId));
      return {
        id: friendlyDefaultParticipantId(game.id, side.sideId, basisId, member.userId),
        gameId: game.id, sideId: side.sideId, lineupId: basisId, userId: member.userId,
        displayNameSnapshot: member.user.profile?.deletedAt == null ? member.user.profile?.nickname?.trim() || member.user.profile?.displayName?.trim() || '팀원' : '팀원',
        jerseyNumber: member.jerseyNumber, position: null, positionX: null, positionY: null, started: true,
        arrivedAt: arrival === undefined ? game.participants.find((participant) => participant.lineupId === basisId && participant.userId === member.userId)?.arrivedAt ?? null : arrival.arrivedAt,
        createdAt: new Date(0), updatedAt: new Date(0),
      };
    }) };
  });
  return { gameId: game.id, sides, participants: sides.flatMap((side) => [...side.participants]), ready: sides.length === 2 && sides.every((side) => side.source !== 'BLOCKED' && side.participants.length > 0), arrivalSequence };
}

/** The caller holds Game FOR UPDATE; check-in never freezes or edits a human draft's membership. */
export async function writeFriendlyDefaultArrivals(
  tx: Tx,
  roster: FriendlyEffectiveRoster,
  side: FriendlyEffectiveSide,
  participantIds: readonly string[],
  arrived: boolean,
  actor: OperationAuditActor,
) {
  if (side.source !== 'DEFAULT_PREVIEW' || side.lineup === null || actor.type === 'SYSTEM') {
    throw new ConflictException({ code: 'FRIENDLY_DEFAULT_ARRIVAL_CHANGED', message: '명단이 변경됐어요. 다시 불러와 주세요.' });
  }
  let sequence = roster.arrivalSequence;
  let changedCount = 0;
  const participants: Array<{ id: string; sideId: string; arrivedAt: Date | null }> = [];
  for (const participantId of participantIds) {
    const participant = side.participants.find((row) => row.id === participantId);
    if (participant === undefined || participant.userId === null) {
      throw new ConflictException({ code: 'FRIENDLY_DEFAULT_ARRIVAL_CHANGED', message: '명단이 변경됐어요. 다시 불러와 주세요.' });
    }
    const arrivedAt = arrived ? participant.arrivedAt ?? new Date() : null;
    participants.push({ id: participant.id, sideId: side.sideId, arrivedAt });
    if ((participant.arrivedAt !== null) === arrived) continue;
    sequence += 1;
    changedCount += 1;
    await auditWriter.create(tx, {
      actor, requestId: `${roster.gameId}:default-arrival:${sequence}`, action: FRIENDLY_DEFAULT_ROSTER_ARRIVAL,
      targetType: 'GAME', targetId: roster.gameId, occurredAt: new Date(),
      before: { arrivedAt: participant.arrivedAt?.toISOString() ?? null },
      after: {
        basisLineupId: side.lineup.id, sideId: side.sideId, teamId: side.teamId,
        userId: participant.userId, participantId: participant.id, sequence, arrivedAt: arrivedAt?.toISOString() ?? null,
      },
    });
  }
  return { participants, changedCount };
}

/** The caller holds the existing Game row lock. Failed commands roll back this append-only snapshot. */
export async function freezeFriendlyEffectiveRoster(tx: Tx, roster: FriendlyEffectiveRoster): Promise<void> {
  if (!roster.ready) throw new ConflictException({ code: 'ROSTER_INCOMPLETE', message: '양 팀의 출전 가능한 기본 명단 또는 제출 명단이 필요해요.' });
  for (const side of roster.sides) {
    if (side.source !== 'DEFAULT_PREVIEW' || side.lineup === null) continue;
    const carried = await loadRevokedConsentByUserId(tx, side.lineup.id);
    const lineup = await tx.v1GameLineup.create({ data: {
      gameId: roster.gameId, sideId: side.sideId, revision: side.lineup.revision + 1,
      state: 'DRAFT', submittedAt: null, supersedesId: side.lineup.id,
    } });
    await tx.v1GameParticipant.createMany({ data: side.participants.map((participant) => ({
      id: participant.id, gameId: roster.gameId, sideId: side.sideId, lineupId: lineup.id, userId: participant.userId,
      displayNameSnapshot: participant.displayNameSnapshot, jerseyNumber: participant.jerseyNumber,
      position: participant.position, positionX: participant.positionX, positionY: participant.positionY,
      started: true, arrivedAt: participant.arrivedAt,
    })) });
    await createSourceRosterIdentityLinks(tx, side.participants.flatMap((participant) => participant.userId === null ? [] : [{ participantId: participant.id, userId: participant.userId }]),
      { actorType: 'SYSTEM', systemActor: FRIENDLY_DEFAULT_ROSTER_FROZEN }, 'friendly_default_roster_freeze');
    for (const participant of side.participants) {
      if (participant.userId !== null) await carryRevokedConsent(tx, participant.id, carried.get(participant.userId));
    }
    await auditWriter.create(tx, {
      actor: { type: 'SYSTEM', id: FRIENDLY_DEFAULT_ROSTER_FROZEN },
      requestId: `${roster.gameId}:${lineup.id}`, action: FRIENDLY_DEFAULT_ROSTER_FROZEN,
      targetType: 'GAME', targetId: roster.gameId, occurredAt: new Date(), before: { lineupId: side.lineup.id },
      after: { lineupId: lineup.id, basisLineupId: side.lineup.id, sideId: side.sideId },
    });
  }
}
