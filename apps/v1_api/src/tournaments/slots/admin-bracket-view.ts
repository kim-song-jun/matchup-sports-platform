import { V1GameResultRevisionState, type Prisma, type V1GameState, type V1TournamentSlotKind } from '@prisma/client';
import { revisionEntryMethod, type RevisionEntryMethod } from '../../tournament-operations/results/quick-result.constants';
import { parseTournamentFixtureOfficialScore } from '../tournament-fixture-official-result';
import { slotLabelFromRow } from './tournament-slot-label';

export const adminBracketSlotInclude = {
  group: { select: { name: true, phase: true } },
  sourceGroup: { select: { name: true } },
  registration: { select: { team: { select: { name: true } } } },
} satisfies Prisma.V1TournamentSlotInclude;

export type AdminBracketSlotRow = Prisma.V1TournamentSlotGetPayload<{ include: typeof adminBracketSlotInclude }>;

export type AdminBracketSlot = {
  id: string;
  kind: V1TournamentSlotKind;
  groupId: string | null;
  sourceGroupId: string | null;
  position: number;
  label: string;
  registrationId: string | null;
  teamName: string | null;
};

export function serializeAdminBracketSlot(row: AdminBracketSlotRow): AdminBracketSlot {
  return {
    id: row.id,
    kind: row.kind,
    groupId: row.groupId,
    sourceGroupId: row.sourceGroupId,
    position: row.position,
    label: slotLabelFromRow(row),
    registrationId: row.registrationId,
    teamName: row.registration?.team.name ?? null,
  };
}

/** `tournamentTeamMatchBracketInclude` 가 게임에서 읽는 필드 중 이 직렬화가 쓰는 것. `resultRevisions` 는 revision 내림차순 1건이다. */
export type AdminBracketGameInput = {
  id: string;
  state: V1GameState;
  version: number;
  _count: { events: number };
  /** The pointer revision, same basis as `assertStartedTeamChangeAllowed`. */
  currentOfficialRevision: { state: V1GameResultRevisionState } | null;
  resultRevisions: ReadonlyArray<{
    id: string;
    state: V1GameResultRevisionState;
    score: Prisma.JsonValue;
    reason: string | null;
    supersedesId: string | null;
  }>;
};

export type AdminBracketGame = {
  id: string;
  state: V1GameState;
  version: number;
  hasLiveRecords: boolean;
  /** True while the official pointer revision is OFFICIAL, even if a newer correction draft is in progress. */
  hasOfficialResult: boolean;
  latestRevision: {
    id: string;
    state: V1GameResultRevisionState;
    score: { home: number; away: number; penalties?: { home: number; away: number } } | null;
    entryMethod: RevisionEntryMethod;
  } | null;
};

function revisionScore(score: Prisma.JsonValue): NonNullable<AdminBracketGame['latestRevision']>['score'] {
  const parsed = parseTournamentFixtureOfficialScore(score);
  if (parsed === null) return null;
  return {
    home: parsed.homeScore,
    away: parsed.awayScore,
    ...(parsed.homePenaltyScore !== null && parsed.awayPenaltyScore !== null
      ? { penalties: { home: parsed.homePenaltyScore, away: parsed.awayPenaltyScore } }
      : {}),
  };
}

export function serializeAdminBracketGame(game: AdminBracketGameInput): AdminBracketGame {
  const latest = game.resultRevisions[0];
  return {
    id: game.id,
    state: game.state,
    version: game.version,
    hasLiveRecords: game._count.events > 0,
    hasOfficialResult: game.currentOfficialRevision?.state === V1GameResultRevisionState.OFFICIAL,
    latestRevision: latest === undefined
      ? null
      : { id: latest.id, state: latest.state, score: revisionScore(latest.score), entryMethod: revisionEntryMethod(latest) },
  };
}
