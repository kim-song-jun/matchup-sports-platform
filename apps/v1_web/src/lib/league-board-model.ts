import type { V1AdminBracketFixtureGame, V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { fixtureNodeState } from './bracket-canvas-layout';
import { DAY_MS, kstMidnightMs, toKstDateString } from './kst-calendar';
import { kstWeekKey } from './league-fixture-week';

export type LeagueBoardNodeState = ReturnType<typeof fixtureNodeState> | 'voided';

export interface LeagueBoardSide {
  slotId: string | null;
  label: string;
  filled: boolean;
  registrationId: string | null;
  /** 정해진 팀. 자리만 있고 팀이 빈 사이드·부전승은 null — 주차 요약이 쉬는 팀을 셀 때 쓴다. */
  teamId: string | null;
}

export interface LeagueBoardNode {
  fieldId?: string | null;
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

/** 한 주차의 운영 요약. 취소된 경기는 세지 않는다. 팀 목록을 아직 모르면 팀 칸은 비어 있다. */
export interface LeagueWeekSummary {
  gameCount: number;
  /** 리그 참가팀 중 이 주에 경기가 없는 팀(이름순). */
  restingTeamNames: string[];
  /** 이 주에 두 경기 이상 잡힌 팀(이름순) — 운영자가 의도했는지 확인할 경고다. */
  doubleBookedTeamNames: string[];
}

/**
 * 주차 한 칸. key 는 그 주 월요일의 KST 날짜(`YYYY-MM-DD`), weekNumber 는 경기가 있는 주의 순번(1부터) —
 * 서버·공개 화면과 같은 달력 주 규칙이다(`league-fixture-week.ts`, 2026-11-03 사용자 확정).
 */
export interface LeagueBoardColumn {
  key: string;
  weekNumber: number;
  /** 그 주 월요일·일요일의 KST 날짜(`YYYY-MM-DD`). */
  startDate: string;
  endDate: string;
  /** 이 주에 경기일이 둘 이상이면 true — 경기 카드에 날짜를 같이 보여 준다. */
  multiDay: boolean;
  nodes: LeagueBoardNode[];
  summary: LeagueWeekSummary;
}

export interface LeagueBoardSummary {
  slotCount: number;
  filledSlotCount: number;
  hiddenFixtureCount: number;
  hasEmptySlot: boolean;
  /** 아직 한 번도 맞붙지 않은(취소 아닌 경기가 없는) 참가팀 쌍의 수. 팀 목록을 모르면 0. */
  unplayedPairCount: number;
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
      teamId,
    };
  }
  // 자리 없이 원정이 비면 예전부터 있던 부전(bye) 경기다.
  return {
    slotId: resolvedSlotId,
    label: slot?.label ?? (side === 'home' ? '미정' : '부전승'),
    filled: false,
    registrationId: null,
    teamId: null,
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
      ...(fixture.fieldId === undefined ? {} : { fieldId: fixture.fieldId }),
      state: cancelled ? 'cancelled' : fixture.resultStage === 'voided' || game?.latestRevision?.state === 'VOID' ? 'voided' : fixtureNodeState(game),
      hiddenFromPublic:
        !cancelled &&
        ((fixture.homeSlotId != null && fixture.homeTeamId === null) ||
          (fixture.awaySlotId != null && fixture.awayTeamId === null)),
      home: buildSide('home', fixture.homeTeamId, fixture.homeSlotId, slotById, teamNameById),
      away: buildSide('away', fixture.awayTeamId, fixture.awaySlotId, slotById, teamNameById),
      game,
    };
    const key = kstWeekKey(new Date(fixture.startAt));
    const column = columnsByKey.get(key);
    if (column === undefined) columnsByKey.set(key, [node]);
    else column.push(node);
  }

  const columns = [...columnsByKey.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, nodes], index): LeagueBoardColumn => {
      const sorted = nodes.sort((left, right) => left.startAt.localeCompare(right.startAt) || left.title.localeCompare(right.title));
      return {
        key,
        weekNumber: index + 1,
        startDate: key,
        endDate: toKstDateString(new Date(kstMidnightMs(key) + 6 * DAY_MS)),
        multiDay: new Set(sorted.map((node) => toKstDateString(new Date(node.startAt)))).size > 1,
        nodes: sorted,
        summary: summarizeWeek(sorted, teamNameById),
      };
    });

  const filledSlotCount = slots.filter((slot) => slot.registrationId !== null).length;
  return {
    columns,
    summary: {
      slotCount: slots.length,
      filledSlotCount,
      hiddenFixtureCount: columns.reduce((sum, column) => sum + column.nodes.filter((node) => node.hiddenFromPublic).length, 0),
      hasEmptySlot: filledSlotCount < slots.length,
      unplayedPairCount: countUnplayedPairs(columns.flatMap((column) => column.nodes), teamNameById),
    },
  };
}

/** 취소·무효가 아닌 경기 — 쉬는 팀·중복·안 붙은 대진은 실제로 치를 경기로만 센다. */
function isLive(node: LeagueBoardNode): boolean {
  return node.state !== 'cancelled';
}

const byKoreanName = (left: string, right: string) => left.localeCompare(right, 'ko');

function summarizeWeek(nodes: readonly LeagueBoardNode[], teamNameById: ReadonlyMap<string, string>): LeagueWeekSummary {
  const live = nodes.filter(isLive);
  const gamesByTeam = new Map<string, number>();
  for (const node of live) {
    for (const teamId of [node.home.teamId, node.away.teamId]) {
      if (teamId !== null) gamesByTeam.set(teamId, (gamesByTeam.get(teamId) ?? 0) + 1);
    }
  }
  const nameOf = (teamId: string) => teamNameById.get(teamId) ?? '팀';
  return {
    gameCount: live.length,
    restingTeamNames: [...teamNameById.keys()].filter((teamId) => !gamesByTeam.has(teamId)).map(nameOf).sort(byKoreanName),
    doubleBookedTeamNames: [...gamesByTeam].filter(([, count]) => count > 1).map(([teamId]) => nameOf(teamId)).sort(byKoreanName),
  };
}

function countUnplayedPairs(nodes: readonly LeagueBoardNode[], teamNameById: ReadonlyMap<string, string>): number {
  const teamIds = [...teamNameById.keys()];
  const played = new Set<string>();
  for (const node of nodes.filter(isLive)) {
    const { teamId: home } = node.home;
    const { teamId: away } = node.away;
    if (home !== null && away !== null) played.add([home, away].sort().join(':'));
  }
  let unplayed = 0;
  for (const [index, left] of teamIds.entries()) {
    for (const right of teamIds.slice(index + 1)) {
      if (!played.has([left, right].sort().join(':'))) unplayed += 1;
    }
  }
  return unplayed;
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
