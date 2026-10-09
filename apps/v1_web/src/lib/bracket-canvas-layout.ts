import { tournamentRoundLabel } from '@/lib/tournament-round-label';
import type {
  V1AdminBracketFixture,
  V1AdminBracketFixtureGame,
  V1AdminBracketGroup,
  V1AdminBracketSlot,
} from '@/types/api';
import { groupBlockGroups, groupRankAnchorY, layoutGroupBlocks, type GroupBlockLayout } from './bracket-canvas-group-layout';

export const CANVAS_NODE_WIDTH = 232;
export const CANVAS_HEADER_HEIGHT = 44;
export const CANVAS_ROW_HEIGHT = 44;
export const CANVAS_FOOTER_HEIGHT = 24;
export const CANVAS_NODE_HEIGHT = CANVAS_HEADER_HEIGHT + CANVAS_ROW_HEIGHT * 2 + CANVAS_FOOTER_HEIGHT;
export const CANVAS_COLUMN_GAP = 72;
export const CANVAS_ROW_GAP = 24;
export const CANVAS_PADDING = 24;
export const CANVAS_COLUMN_LABEL_HEIGHT = 32;

const FIRST_NODE_Y = CANVAS_PADDING + CANVAS_COLUMN_LABEL_HEIGHT;
/** 연결선이 칸 양쪽 줄 사이(홈/어웨이 경계)에 닿는 칸 안쪽 높이 */
const NODE_ANCHOR_Y = CANVAS_HEADER_HEIGHT + CANVAS_ROW_HEIGHT;

export type SideKey = 'HOME' | 'AWAY';
export type CanvasMode = 'bracket' | 'league';
export type FixtureNodeState = 'scheduled' | 'live' | 'submitted' | 'official' | 'cancelled';

export type CanvasLayoutInput = {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
  slots: readonly V1AdminBracketSlot[];
  mode: CanvasMode;
};
export type CanvasNodeLayout = { fixtureId: string; columnKey: string; x: number; y: number; width: number; height: number };
export type CanvasColumnLayout = { key: string; groupId: string | null; label: string; x: number; width: number; fixtureIds: string[] };
export type CanvasEdgeKind = 'WINNER' | 'LOSER' | 'BYE' | 'GROUP_RANK';
export type CanvasEdgeLayout = {
  id: string;
  kind: CanvasEdgeKind;
  fromFixtureId: string | null;
  toFixtureId: string;
  side: SideKey;
  path: string;
};
export type CanvasLayout = {
  width: number;
  height: number;
  columns: CanvasColumnLayout[];
  nodes: CanvasNodeLayout[];
  edges: CanvasEdgeLayout[];
  /** 조별+결선 대진의 조 편성 블록. 순위 자리가 없는 대진은 빈 배열. */
  groupBlocks: GroupBlockLayout[];
};

// 조별리그(group)는 결선보다 앞 열이고, 결선은 round16 > round12 > quarter > semi > final > third_place 순이다(한 대회에 16강·12강이 함께 있지는 않다). 모르는 단계는 맨 뒤.
const PHASE_ORDER: Readonly<Record<string, number>> = { group: 0, round16: 1, round12: 2, quarter: 3, semi: 4, final: 5, third_place: 6 };

type ColumnSeed = { key: string; groupId: string | null; label: string; fixtures: V1AdminBracketFixture[] };

const GROUP_BLOCKS_COLUMN_KEY = 'group-blocks';

/** 순위 자리가 있는 조별+결선 대진은 마지막 조별 열과 결선 첫 열 사이에 조 편성 블록 열을 끼운다. */
function withGroupBlocksColumn(seeds: ColumnSeed[], input: CanvasLayoutInput): ColumnSeed[] {
  if (input.mode !== 'bracket' || groupBlockGroups(input.groups, input.slots).length === 0) return seeds;
  const phaseOf = new Map(input.groups.map((group) => [group.id, group.phase]));
  const lastGroupColumn = seeds.reduce(
    (last, seed, index) => (seed.groupId !== null && phaseOf.get(seed.groupId) === 'group' ? index : last),
    -1,
  );
  const column: ColumnSeed = { key: GROUP_BLOCKS_COLUMN_KEY, groupId: null, label: '조 편성', fixtures: [] };
  return [...seeds.slice(0, lastGroupColumn + 1), column, ...seeds.slice(lastGroupColumn + 1)];
}

function compareFixtures(a: V1AdminBracketFixture, b: V1AdminBracketFixture): number {
  return a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber || a.id.localeCompare(b.id);
}

function bracketColumns(groups: readonly V1AdminBracketGroup[], fixtures: readonly V1AdminBracketFixture[]): ColumnSeed[] {
  const seeds: ColumnSeed[] = [...groups]
    .sort((a, b) => (PHASE_ORDER[a.phase] ?? 99) - (PHASE_ORDER[b.phase] ?? 99) || a.sortOrder - b.sortOrder)
    .map((group) => ({
      key: group.id,
      groupId: group.id,
      label: group.name,
      fixtures: fixtures.filter((fixture) => fixture.groupId === group.id).sort(compareFixtures),
    }));
  const known = new Set(groups.map((group) => group.id));
  const orphans = fixtures.filter((fixture) => fixture.groupId === null || !known.has(fixture.groupId)).sort(compareFixtures);
  return orphans.length > 0 ? [...seeds, { key: 'ungrouped', groupId: null, label: '조 미정', fixtures: orphans }] : seeds;
}

function leagueColumns(fixtures: readonly V1AdminBracketFixture[]): ColumnSeed[] {
  const byRound = new Map<string, V1AdminBracketFixture[]>();
  for (const fixture of [...fixtures].sort(compareFixtures)) {
    byRound.set(fixture.round, [...(byRound.get(fixture.round) ?? []), fixture]);
  }
  return [...byRound.entries()].map(([round, list]) => ({
    key: `round:${round}`,
    groupId: list[0].groupId,
    label: tournamentRoundLabel(round),
    fixtures: list,
  }));
}

function sideAnchorY(node: CanvasNodeLayout, side: SideKey): number {
  return node.y + CANVAS_HEADER_HEIGHT + (side === 'HOME' ? CANVAS_ROW_HEIGHT / 2 : CANVAS_ROW_HEIGHT * 1.5);
}

/** 원천 칸 오른쪽 가운데 → 대상 열 바로 앞 간격 가운데에서 꺾어 → 대상 사이드 줄. */
function elbowPath(fromX: number, fromY: number, toX: number, toY: number): string {
  return `M${fromX} ${fromY} H${toX - CANVAS_COLUMN_GAP / 2} V${toY} H${toX}`;
}

export function buildCanvasLayout(input: CanvasLayoutInput): CanvasLayout {
  const baseSeeds = input.mode === 'league' ? leagueColumns(input.fixtures) : bracketColumns(input.groups, input.fixtures);
  const seeds = withGroupBlocksColumn(baseSeeds, input);
  const slotsById = new Map(input.slots.map((slot) => [slot.id, slot]));
  const placed = new Map<string, CanvasNodeLayout>();
  const columns: CanvasColumnLayout[] = [];
  const groupBlocks: GroupBlockLayout[] = [];

  seeds.forEach((seed, index) => {
    const x = CANVAS_PADDING + index * (CANVAS_NODE_WIDTH + CANVAS_COLUMN_GAP);
    if (seed.key === GROUP_BLOCKS_COLUMN_KEY) {
      groupBlocks.push(
        ...layoutGroupBlocks({
          groups: input.groups,
          slots: input.slots,
          x,
          top: FIRST_NODE_Y,
          width: CANVAS_NODE_WIDTH,
          headerHeight: CANVAS_HEADER_HEIGHT,
          rowHeight: CANVAS_ROW_HEIGHT,
          gap: CANVAS_ROW_GAP,
        }),
      );
      columns.push({ key: seed.key, groupId: null, label: seed.label, x, width: CANVAS_NODE_WIDTH, fixtureIds: [] });
      return;
    }
    let cursor = FIRST_NODE_Y;
    for (const fixture of seed.fixtures) {
      // 이미 놓인 원천 칸들의 연결 높이 평균에 맞추되, 위 칸과 겹치면 아래로 민다.
      const anchors =
        input.mode === 'bracket'
          ? (fixture.bracketSources ?? [])
              .map((source) => placed.get(source.fixtureId))
              .filter((node): node is CanvasNodeLayout => node !== undefined)
              .map((node) => node.y + NODE_ANCHOR_Y)
          : [];
      const desired = anchors.length > 0 ? Math.round(anchors.reduce((sum, value) => sum + value, 0) / anchors.length) - NODE_ANCHOR_Y : cursor;
      const y = Math.max(desired, cursor);
      placed.set(fixture.id, { fixtureId: fixture.id, columnKey: seed.key, x, y, width: CANVAS_NODE_WIDTH, height: CANVAS_NODE_HEIGHT });
      cursor = y + CANVAS_NODE_HEIGHT + CANVAS_ROW_GAP;
    }
    columns.push({ key: seed.key, groupId: seed.groupId, label: seed.label, x, width: CANVAS_NODE_WIDTH, fixtureIds: seed.fixtures.map((fixture) => fixture.id) });
  });

  const blockByGroup = new Map(groupBlocks.map((block) => [block.groupId, block]));
  const edges: CanvasEdgeLayout[] = [];
  for (const seed of seeds) {
    for (const fixture of seed.fixtures) {
      const target = placed.get(fixture.id);
      if (target === undefined) continue;
      for (const source of input.mode === 'bracket' ? fixture.bracketSources ?? [] : []) {
        const from = placed.get(source.fixtureId);
        if (from === undefined) continue;
        edges.push({
          id: `${source.fixtureId}->${fixture.id}:${source.side}`,
          kind: source.outcome,
          fromFixtureId: source.fixtureId,
          toFixtureId: fixture.id,
          side: source.side,
          path: elbowPath(from.x + CANVAS_NODE_WIDTH, from.y + NODE_ANCHOR_Y, target.x, sideAnchorY(target, source.side)),
        });
      }
      for (const side of ['HOME', 'AWAY'] as const) {
        const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
        const slot = slotId === null ? undefined : slotsById.get(slotId);
        if (slot?.kind === 'BYE') {
          edges.push({
            id: `bye:${fixture.id}:${side}`,
            kind: 'BYE',
            fromFixtureId: null,
            toFixtureId: fixture.id,
            side,
            path: `M${target.x - CANVAS_COLUMN_GAP / 2} ${sideAnchorY(target, side)} H${target.x}`,
          });
        }
        const block = slot?.kind === 'GROUP_RANK' && slot.sourceGroupId !== null ? blockByGroup.get(slot.sourceGroupId) : undefined;
        if (slot !== undefined && block !== undefined) {
          edges.push({
            id: `rank:${fixture.id}:${side}`,
            kind: 'GROUP_RANK',
            fromFixtureId: null,
            toFixtureId: fixture.id,
            side,
            path: elbowPath(block.x + block.width, groupRankAnchorY(block, slot.position), target.x, sideAnchorY(target, side)),
          });
        }
      }
    }
  }

  const nodes = [...placed.values()];
  const width = seeds.length === 0 ? CANVAS_PADDING * 2 : CANVAS_PADDING * 2 + seeds.length * CANVAS_NODE_WIDTH + (seeds.length - 1) * CANVAS_COLUMN_GAP;
  const nodesBottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height), FIRST_NODE_Y);
  const bottom = groupBlocks.reduce((max, block) => Math.max(max, block.y + block.height), nodesBottom);
  return { width, height: bottom + CANVAS_PADDING, columns, nodes, edges, groupBlocks };
}

/** 확정 전 결과(제출됨·정정 초안)도 `submitted` — 무효는 다시 입력할 수 있는 `scheduled` 로 돌아간다. */
export function fixtureNodeState(game: V1AdminBracketFixtureGame | null): FixtureNodeState {
  if (game === null) return 'scheduled';
  if (game.state === 'CANCELLED') return 'cancelled';
  if (game.state === 'LIVE' || game.state === 'PAUSED') return 'live';
  const revision = game.latestRevision;
  if (revision === null) return game.state === 'ENDED' ? 'submitted' : 'scheduled';
  if (revision.state === 'OFFICIAL') return 'official';
  if (revision.state === 'VOID') return 'scheduled';
  return 'submitted';
}

/** 서버 `SLOT_LOCKED` 와 같은 기준 — 게임이 예정이고 결과가 없을 때만 자리를 바꿀 수 있다. */
export function isFixtureLocked(fixture: V1AdminBracketFixture): boolean {
  const game = fixture.game;
  return game !== null && (game.state !== 'SCHEDULED' || game.latestRevision !== null);
}

export type SideSource = 'slot' | 'feeder' | 'direct';

/** 사이드의 팀이 어디서 오는지: 자리(slot) · 이전 경기(feeder) · 경기에 직접 지정(direct). */
export function classifyFixtureSide(
  fixture: V1AdminBracketFixture,
  side: SideKey,
  slotsById: ReadonlyMap<string, V1AdminBracketSlot>,
): SideSource {
  const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
  if (slotId !== null && slotsById.has(slotId)) return 'slot';
  return fixture.bracketSources?.some((source) => source.side === side) ? 'feeder' : 'direct';
}

/** 자리 없이 경기에 직접 지정된 팀 id(옛 대진·경기 추가). 취소된 경기는 세지 않는다. */
export function directPlacedRegistrationIds(
  fixtures: readonly V1AdminBracketFixture[],
  slots: readonly V1AdminBracketSlot[],
): Set<string> {
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    // 게임만 취소돼도(경기 상태는 그대로) 취소로 본다 — 칸의 상태 칩과 같은 기준.
    if (fixture.status === 'cancelled' || fixtureNodeState(fixture.game) === 'cancelled') continue;
    for (const side of ['HOME', 'AWAY'] as const) {
      const id = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
      if (id !== null && classifyFixtureSide(fixture, side, slotsById) === 'direct') ids.add(id);
    }
  }
  return ids;
}

export function isSlotAssignable(slot: V1AdminBracketSlot): boolean {
  return slot.kind !== 'GROUP_RANK';
}

export type SideLabelContext = {
  slotsById: ReadonlyMap<string, V1AdminBracketSlot>;
  fixturesById: ReadonlyMap<string, V1AdminBracketFixture>;
  groupsById: ReadonlyMap<string, V1AdminBracketGroup>;
};

export function buildSideLabelContext(
  groups: readonly V1AdminBracketGroup[],
  fixtures: readonly V1AdminBracketFixture[],
  slots: readonly V1AdminBracketSlot[],
): SideLabelContext {
  return {
    slotsById: new Map(slots.map((slot) => [slot.id, slot])),
    fixturesById: new Map(fixtures.map((fixture) => [fixture.id, fixture])),
    groupsById: new Map(groups.map((group) => [group.id, group])),
  };
}

export function fixtureSideLabel(fixture: V1AdminBracketFixture, side: SideKey, ctx: SideLabelContext): string {
  const registrationId = side === 'HOME' ? fixture.homeRegistrationId : fixture.awayRegistrationId;
  if (registrationId !== null) return side === 'HOME' ? fixture.homeTeamName : fixture.awayTeamName;
  const slotId = side === 'HOME' ? fixture.homeSlotId : fixture.awaySlotId;
  const slot = slotId === null ? undefined : ctx.slotsById.get(slotId);
  if (slot !== undefined) return slot.label;
  const source = fixture.bracketSources?.find((candidate) => candidate.side === side);
  const sourceFixture = source === undefined ? undefined : ctx.fixturesById.get(source.fixtureId);
  if (source !== undefined && sourceFixture !== undefined) {
    const groupName = sourceFixture.groupId === null ? undefined : ctx.groupsById.get(sourceFixture.groupId)?.name;
    return `${groupName ?? tournamentRoundLabel(sourceFixture.round)} ${sourceFixture.fixtureNumber}번 경기 ${source.outcome === 'LOSER' ? '패자' : '승자'}`;
  }
  return '미정';
}
