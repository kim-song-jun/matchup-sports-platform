import { buildLeagueGrid } from '@/lib/bracket-league-grid-model';
import {
  buildSideLabelContext,
  classifyFixtureSide,
  fixtureNodeState,
  fixtureSideLabel,
  type FixtureNodeState,
  type SideKey,
  type SideSource,
  type SideLabelContext,
} from '@/lib/bracket-canvas-layout';
import { formatGameResultScoreWithPenalties } from '@/lib/game-result-score';
import { buildLeagueBoard, type LeagueBoardNode, type LeagueBoardSide } from '@/lib/league-board-model';
import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
  V1AdminTournamentRegistration,
  V1TournamentGroupPhase,
} from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';

export interface MobileSide {
  slotId: string | null;
  slotKind: V1AdminBracketSlot['kind'] | null;
  /** 데스크톱 칸 패널과 같은 분류 — 자리(slot)·앞 경기 결과(feeder)·경기에 직접 지정(direct). */
  source: SideSource;
  registrationId: string | null;
  teamName: string | null;
  slotLabel: string | null;
}

export interface MobileNode {
  fixtureId: string;
  /** 조별 단계 후보 제외에만 쓴다. 리그 매치(scope 'league')는 대회 조가 없어 null. */
  groupId: string | null;
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
    source: classifyFixtureSide(fixture, side, labels.slotsById),
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
    // 리그 경기는 앞 경기 결과로 채워지지 않는다 — 자리가 없으면 직접 지정이다.
    source: side.slotId !== null && slotsById.has(side.slotId) ? 'slot' : 'direct',
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
    groupId: fixture.groupId,
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
    groupId: null,
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

// 3·4위전은 결승과 같은 탭에 둔다 — 탭이 6개를 넘으면 390 폭에서 한 칸이 너무 좁아진다.
const PHASE_BUCKET: Record<V1TournamentGroupPhase, { key: string; label: string }> = {
  group: { key: 'group', label: '조별' },
  round16: { key: 'round16', label: '16강' },
  round12: { key: 'round12', label: '12강' },
  quarter: { key: 'quarter', label: '8강' },
  semi: { key: 'semi', label: '4강' },
  final: { key: 'final', label: '결승' },
  third_place: { key: 'final', label: '결승' },
};

type FixtureOrder = { fixtureNumber: number; legNumber: number };
const byFixtureOrder = (a: FixtureOrder, b: FixtureOrder) => a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber;

export function buildBracketMobileRounds(input: {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
}): MobileRound[] {
  const labels = buildSideLabelContext(input.groups, input.fixtures, input.slots);
  const groupIds = new Set(input.groups.map((group) => group.id));
  const groups = [...input.groups].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const rounds: MobileRound[] = [];
  const roundByKey = new Map<string, MobileRound>();
  const thirdPlaceSectionKeys = new Set<string>();

  for (const group of groups) {
    const nodes = input.fixtures
      .filter((f) => f.groupId === group.id)
      .sort(byFixtureOrder)
      .map((f) => bracketMobileNode(f, group.name, group.phase !== 'group', labels));
    if (nodes.length === 0) continue;

    const bucket = PHASE_BUCKET[group.phase as V1TournamentGroupPhase] ?? { key: `phase:${group.phase}`, label: group.name };
    let round = roundByKey.get(bucket.key);
    if (!round) {
      round = { key: bucket.key, label: bucket.label, sections: [] };
      roundByKey.set(bucket.key, round);
      rounds.push(round);
    }
    round.sections.push({ key: group.id, heading: group.name, nodes });
    if (group.phase === 'third_place') thirdPlaceSectionKeys.add(group.id);
  }

  for (const round of rounds) {
    if (round.key === 'group' && round.sections.length === 1) round.label = round.sections[0].heading ?? round.label;
    round.sections.sort((a, b) => Number(thirdPlaceSectionKeys.has(a.key)) - Number(thirdPlaceSectionKeys.has(b.key)));
  }

  const orphans = input.fixtures
    .filter((f) => f.groupId === null || !groupIds.has(f.groupId))
    .sort(byFixtureOrder)
    .map((f) => bracketMobileNode(f, null, false, labels));
  if (orphans.length > 0) rounds.push({ key: 'etc', label: '기타', sections: [{ key: 'etc', heading: null, nodes: orphans }] });
  return rounds;
}

export function buildLeagueTournamentMobileRounds(input: {
  groups: V1AdminBracketGroup[];
  fixtures: V1AdminBracketFixture[];
  slots: V1AdminBracketSlot[];
}): MobileRound[] {
  const labels = buildSideLabelContext(input.groups, input.fixtures, input.slots);
  const grid = buildLeagueGrid({ groups: input.groups, fixtures: input.fixtures });
  const multi = grid.columns.length > 1;
  return grid.rows.map((row) => ({
    key: row.key,
    label: row.label,
    sections: grid.columns.flatMap((column) => {
      const list = row.cells[column.key] ?? [];
      if (list.length === 0) return [];
      const groupName = multi ? column.label : null;
      return [{ key: column.key, heading: groupName, nodes: list.map((f) => bracketMobileNode(f, groupName, false, labels)) }];
    }),
  }));
}

// 리그 응답에는 라운드 번호가 없다 — 경기일(KST) 열이 라운드이고, 열 묶음과 'N주차' 번호는 PR-5b `buildLeagueBoard` 가 정한다.
export function buildLeagueMobileRounds(input: {
  fixtures: V1LeagueFixture[];
  slots: V1AdminBracketSlot[];
  teamNameById: ReadonlyMap<string, string>;
}): MobileRound[] {
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  return buildLeagueBoard(input).columns.map((column) => ({
    key: column.key,
    label: `${column.weekNumber}주차`,
    sections: [{ key: column.key, heading: null, nodes: column.nodes.map((node) => leagueMobileNode(node, slotsById)) }],
  }));
}

const UNFINISHED: ReadonlySet<FixtureNodeState> = new Set(['scheduled', 'live', 'submitted']);

/** 운영자가 지금 만져야 할 라운드 — 끝나지 않은 경기가 있는 첫 라운드, 없으면 마지막. */
export function pickInitialRoundKey(rounds: MobileRound[]): string | null {
  const open = rounds.find((round) => round.sections.some((section) => section.nodes.some((node) => UNFINISHED.has(node.state))));
  return open?.key ?? rounds.at(-1)?.key ?? null;
}
