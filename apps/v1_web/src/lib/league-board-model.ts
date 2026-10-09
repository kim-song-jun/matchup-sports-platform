import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { fixtureNodeState } from './bracket-canvas-layout';
import { toKstDateString } from './kst-calendar';

export type LeagueBoardNodeState = ReturnType<typeof fixtureNodeState>;

export interface LeagueBoardSide {
  slotId: string | null;
  label: string;
  filled: boolean;
  registrationId: string | null;
}

export interface LeagueBoardNode {
  fixtureId: string;
  title: string;
  startAt: string;
  placeName: string;
  state: LeagueBoardNodeState;
  /** 서버 공개 게이트와 같은 술어 — 자리에 연결됐는데 팀이 빈 사이드가 있으면 공개 화면에 아직 안 나간다. */
  hiddenFromPublic: boolean;
  home: LeagueBoardSide;
  away: LeagueBoardSide;
  game: V1AdminBracketFixtureGame | null;
}

/** key 는 경기 시작의 KST 달력 날짜(`YYYY-MM-DD`), weekNumber 는 날짜 오름차순 순번(1부터). */
export interface LeagueBoardColumn {
  key: string;
  weekNumber: number;
  nodes: LeagueBoardNode[];
}

export interface LeagueBoardSummary {
  slotCount: number;
  filledSlotCount: number;
  hiddenFixtureCount: number;
  hasEmptySlot: boolean;
}

interface BuildInput {
  fixtures: readonly V1LeagueFixture[];
  slots: readonly V1AdminBracketSlot[];
  teamNameById: ReadonlyMap<string, string>;
}

function buildSide(
  side: 'home' | 'away',
  teamId: string | null,
  slotId: string | null | undefined,
  slotById: ReadonlyMap<string, V1AdminBracketSlot>,
  teamNameById: ReadonlyMap<string, string>,
): LeagueBoardSide {
  const slot = slotId == null ? undefined : slotById.get(slotId);
  const resolvedSlotId = slot?.id ?? null;
  if (teamId !== null) {
    return {
      slotId: resolvedSlotId,
      label: slot?.teamName ?? teamNameById.get(teamId) ?? '팀',
      filled: true,
      registrationId: slot?.registrationId ?? null,
    };
  }
  // 자리 없이 원정이 비면 예전부터 있던 부전(bye) 경기다.
  return {
    slotId: resolvedSlotId,
    label: slot?.label ?? (side === 'home' ? '미정' : '부전승'),
    filled: false,
    registrationId: null,
  };
}

export function buildLeagueBoard({ fixtures, slots, teamNameById }: BuildInput): {
  columns: LeagueBoardColumn[];
  summary: LeagueBoardSummary;
} {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const columnsByKey = new Map<string, LeagueBoardNode[]>();

  for (const fixture of fixtures) {
    const cancelled = fixture.status === 'cancelled';
    const game = fixture.game ?? null;
    const node: LeagueBoardNode = {
      fixtureId: fixture.teamMatchId,
      title: fixture.title,
      startAt: fixture.startAt,
      placeName: fixture.placeName,
      state: cancelled ? 'cancelled' : fixtureNodeState(game),
      hiddenFromPublic:
        !cancelled &&
        ((fixture.homeSlotId != null && fixture.homeTeamId === null) ||
          (fixture.awaySlotId != null && fixture.awayTeamId === null)),
      home: buildSide('home', fixture.homeTeamId, fixture.homeSlotId, slotById, teamNameById),
      away: buildSide('away', fixture.awayTeamId, fixture.awaySlotId, slotById, teamNameById),
      game,
    };
    const key = toKstDateString(new Date(fixture.startAt));
    const column = columnsByKey.get(key);
    if (column === undefined) columnsByKey.set(key, [node]);
    else column.push(node);
  }

  const columns = [...columnsByKey.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nodes], index) => ({
      key,
      weekNumber: index + 1,
      nodes: nodes.sort((left, right) => left.startAt.localeCompare(right.startAt) || left.title.localeCompare(right.title)),
    }));

  const filledSlotCount = slots.filter((slot) => slot.registrationId !== null).length;
  return {
    columns,
    summary: {
      slotCount: slots.length,
      filledSlotCount,
      hiddenFixtureCount: columns.reduce((sum, column) => sum + column.nodes.filter((node) => node.hiddenFromPublic).length, 0),
      hasEmptySlot: filledSlotCount < slots.length,
    },
  };
}

/**
 * 자리 없이 경기에 직접 들어간 팀의 등록 id. 취소된 경기와 자리에 연결된 사이드는 세지 않는다.
 * 트레이가 이 팀들을 "경기에 있음"으로 보여 주고 미배정 수에서 뺀다.
 */
export function leagueDirectPlacedRegistrationIds(
  fixtures: readonly V1LeagueFixture[],
  slots: readonly V1AdminBracketSlot[],
  teams: readonly V1AdminLeagueTeam[],
): Set<string> {
  const slotIds = new Set(slots.map((slot) => slot.id));
  const registrationByTeamId = new Map<string, string>();
  for (const team of teams) {
    if (team.registrationId !== null) registrationByTeamId.set(team.teamId, team.registrationId);
  }
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (fixture.status === 'cancelled' || fixtureNodeState(fixture.game ?? null) === 'cancelled') continue;
    const sides = [
      { teamId: fixture.homeTeamId, slotId: fixture.homeSlotId },
      { teamId: fixture.awayTeamId, slotId: fixture.awaySlotId },
    ];
    for (const { teamId, slotId } of sides) {
      if (teamId === null || (slotId != null && slotIds.has(slotId))) continue;
      const registrationId = registrationByTeamId.get(teamId);
      if (registrationId !== undefined) ids.add(registrationId);
    }
  }
  return ids;
}
