import {
  fixtureNodeState,
  fixtureSideLabel,
  type FixtureNodeState,
  type SideKey,
  type SideLabelContext,
} from '@/lib/bracket-canvas-layout';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';
import type { LeagueBoardNode, LeagueBoardSide } from '@/lib/league-board-model';
import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketSlot,
  V1AdminTournamentRegistration,
} from '@/types/api';
import type { V1AdminLeagueTeam } from '@/types/league-match';

export interface MobileSide {
  slotId: string | null;
  slotKind: V1AdminBracketSlot['kind'] | null;
  registrationId: string | null;
  teamName: string | null;
  slotLabel: string | null;
}

export interface MobileNode {
  fixtureId: string;
  title: string;
  state: FixtureNodeState;
  home: MobileSide;
  away: MobileSide;
  scoreText: string | null;
  scheduledAt: string | null;
  venue: string | null;
  game: V1AdminBracketFixtureGame | null;
  /** 결선 경기 — 무승부 시 승부차기를 받는다(조별·리그는 받지 않는다). */
  knockout: boolean;
  quickEntered: boolean;
}

export interface MobileSection {
  key: string;
  heading: string | null;
  nodes: MobileNode[];
}

export interface MobileRound {
  key: string;
  label: string;
  sections: MobileSection[];
}

export interface MobilePickCandidate {
  registrationId: string;
  teamName: string;
}

export function sideDisplayName(side: MobileSide): string {
  return side.teamName || side.slotLabel || '미정';
}

export function hasTeam(side: MobileSide): boolean {
  return side.teamName !== null;
}

/** 팀이 없을 때의 문구(자리 라벨 → 앞 경기 승자/패자 → 미정)는 PR-3 `fixtureSideLabel` 하나가 정한다. */
export function bracketMobileSide(fixture: V1AdminBracketFixture, side: SideKey, labels: SideLabelContext): MobileSide {
  const registrationId = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
  const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
  return {
    slotId,
    slotKind: slotId === null ? null : (labels.slotsById.get(slotId)?.kind ?? null),
    registrationId,
    teamName: registrationId === null ? null : side === 'HOME' ? fixture.homeTeamName : fixture.awayTeamName,
    slotLabel: registrationId === null ? fixtureSideLabel(fixture, side, labels) : null,
  };
}

/** 리그 사이드의 이름·라벨은 PR-5b `buildLeagueBoard` 가 이미 정했다 — 팀/라벨로 가르고 자리 종류만 보탠다. */
export function leagueMobileSide(side: LeagueBoardSide, slotsById: ReadonlyMap<string, V1AdminBracketSlot>): MobileSide {
  return {
    slotId: side.slotId,
    slotKind: side.slotId === null ? null : (slotsById.get(side.slotId)?.kind ?? null),
    registrationId: side.registrationId,
    teamName: side.filled ? side.label : null,
    slotLabel: side.filled ? null : side.label,
  };
}

function scoreTextOf(state: FixtureNodeState, game: V1AdminBracketFixtureGame | null): string | null {
  if (state !== 'official' && state !== 'submitted') return null;
  const score = game?.latestRevision?.score ?? null;
  return score === null ? null : formatGameResultScoreWithPenalties(score);
}

function isQuickEntered(game: V1AdminBracketFixtureGame | null): boolean {
  return game?.latestRevision?.entryMethod === 'quick';
}

export function bracketMobileNode(
  fixture: V1AdminBracketFixture,
  groupName: string | null,
  knockout: boolean,
  labels: SideLabelContext,
): MobileNode {
  const game = fixture.game;
  // 취소는 게임을 SCHEDULED 로 남기는 경우가 있어 팀매치 status 가 먼저다(PR-5b `buildLeagueBoard` 와 같은 규칙).
  const state = fixture.status === 'cancelled' ? 'cancelled' : fixtureNodeState(game);
  return {
    fixtureId: fixture.id,
    title: groupName ? `${groupName} · ${fixture.fixtureNumber}번 경기` : `${fixture.fixtureNumber}번 경기`,
    state,
    home: bracketMobileSide(fixture, 'HOME', labels),
    away: bracketMobileSide(fixture, 'AWAY', labels),
    scoreText: scoreTextOf(state, game),
    scheduledAt: fixture.scheduledAt,
    venue: fixture.venue,
    game,
    knockout,
    quickEntered: isQuickEntered(game),
  };
}

export function leagueMobileNode(node: LeagueBoardNode, slotsById: ReadonlyMap<string, V1AdminBracketSlot>): MobileNode {
  return {
    fixtureId: node.fixtureId,
    title: node.title,
    state: node.state,
    home: leagueMobileSide(node.home, slotsById),
    away: leagueMobileSide(node.away, slotsById),
    scoreText: scoreTextOf(node.state, node.game),
    scheduledAt: node.startAt,
    venue: node.placeName,
    game: node.game,
    knockout: false,
    quickEntered: isQuickEntered(node.game),
  };
}

export function candidatesFromRegistrations(
  registrations: ReadonlyArray<Pick<V1AdminTournamentRegistration, 'id' | 'status' | 'teamName'>>,
): MobilePickCandidate[] {
  return registrations
    .filter((r) => r.status === 'confirmed')
    .map((r) => ({ registrationId: r.id, teamName: r.teamName ?? '이름 없는 팀' }));
}

export function candidatesFromLeagueTeams(
  teams: ReadonlyArray<Pick<V1AdminLeagueTeam, 'name' | 'registrationId'>>,
): MobilePickCandidate[] {
  return teams.flatMap((team) => (team.registrationId === null ? [] : [{ registrationId: team.registrationId, teamName: team.name }]));
}

/**
 * 서버 규칙(S3)과 같다 — 같은 팀은 ENTRY·BYE 자리 중 한 곳에만 둘 수 있고(교차 포함),
 * GROUP_RANK 자리는 이 제약과 무관하다. 지금 자리(target)에 있는 팀은 "다른 자리"가 아니다.
 */
export function pickableCandidates(
  candidates: MobilePickCandidate[],
  slots: V1AdminBracketSlot[],
  target: V1AdminBracketSlot,
): MobilePickCandidate[] {
  const placed = new Set(
    slots
      .filter((s) => s.id !== target.id && s.kind !== 'GROUP_RANK' && s.registrationId !== null)
      .map((s) => s.registrationId),
  );
  return candidates.filter((c) => !placed.has(c.registrationId));
}
