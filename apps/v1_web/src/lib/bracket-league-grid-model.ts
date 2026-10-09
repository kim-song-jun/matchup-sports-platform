import type { V1AdminBracketFixture, V1AdminBracketGroup } from '@/types/api';
import { tournamentRoundLabel } from '@/lib/tournament-round-label';

export const LEAGUE_UNGROUPED_COLUMN_KEY = 'ungrouped';

export type LeagueGridColumn = { key: string; groupId: string | null; label: string; fixtureCount: number };
export type LeagueGridRow = { key: string; label: string; cells: Record<string, V1AdminBracketFixture[]> };
export type LeagueGridModel = { columns: LeagueGridColumn[]; rows: LeagueGridRow[]; legacyChunking: boolean };

const LEAGUE_ROUND = /^league_r(\d+)$/;

const roundNumber = (round: string): number | null => {
  const hit = LEAGUE_ROUND.exec(round.trim());
  return hit === null ? null : Number(hit[1]);
};

const byFixtureOrder = (a: V1AdminBracketFixture, b: V1AdminBracketFixture) =>
  a.fixtureNumber - b.fixtureNumber || a.legNumber - b.legNumber || a.id.localeCompare(b.id);

export function sortLeagueGroups(groups: readonly V1AdminBracketGroup[]): V1AdminBracketGroup[] {
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));
}

/** 팀 수 → 한 라운드에 한 조가 치르는 경기 수. 조 편성이 비면 그 열 경기에 나온 서로 다른 팀으로 센다. */
function gamesPerRound(group: V1AdminBracketGroup | undefined, fixtures: readonly V1AdminBracketFixture[]): number {
  const teamCount =
    group !== undefined && group.groupTeams.length > 0
      ? group.groupTeams.length
      : new Set(fixtures.flatMap((f) => [f.homeRegistrationId, f.awayRegistrationId]).filter((id): id is string => id !== null)).size;
  return Math.max(1, Math.floor(teamCount / 2));
}

type RowDraft = { key: string; label: string; sort: number; order: number; cells: Map<string, V1AdminBracketFixture[]> };

export function buildLeagueGrid(input: {
  groups: readonly V1AdminBracketGroup[];
  fixtures: readonly V1AdminBracketFixture[];
}): LeagueGridModel {
  const groups = sortLeagueGroups(input.groups);
  const known = new Set(groups.map((group) => group.id));
  const fixtures = [...input.fixtures].sort(byFixtureOrder);
  const columnKeyOf = (f: V1AdminBracketFixture) => (f.groupId !== null && known.has(f.groupId) ? f.groupId : LEAGUE_UNGROUPED_COLUMN_KEY);

  const byColumn = new Map<string, V1AdminBracketFixture[]>(groups.map((group) => [group.id, []]));
  for (const fixture of fixtures) {
    const key = columnKeyOf(fixture);
    byColumn.set(key, [...(byColumn.get(key) ?? []), fixture]);
  }
  const columns: LeagueGridColumn[] = groups.map((group) => ({
    key: group.id,
    groupId: group.id,
    label: group.name,
    fixtureCount: byColumn.get(group.id)?.length ?? 0,
  }));
  const orphans = byColumn.get(LEAGUE_UNGROUPED_COLUMN_KEY);
  if (orphans !== undefined && orphans.length > 0) {
    columns.push({ key: LEAGUE_UNGROUPED_COLUMN_KEY, groupId: null, label: groups.length === 0 ? '전체 경기' : '조 미정', fixtureCount: orphans.length });
  }

  const numbered = fixtures.some((f) => roundNumber(f.round) !== null);
  const drafts = new Map<string, RowDraft>();
  const place = (columnKey: string, fixture: V1AdminBracketFixture, key: string, label: string, sort: number) => {
    const draft = drafts.get(key) ?? { key, label, sort, order: drafts.size, cells: new Map() };
    draft.cells.set(columnKey, [...(draft.cells.get(columnKey) ?? []), fixture]);
    drafts.set(key, draft);
  };

  for (const column of columns) {
    const list = byColumn.get(column.key) ?? [];
    const chunk = gamesPerRound(groups.find((group) => group.id === column.groupId), list);
    list.forEach((fixture, index) => {
      if (!numbered) {
        const row = Math.floor(index / chunk);
        place(column.key, fixture, `c:${row}`, `${row + 1}라운드`, row);
        return;
      }
      const n = roundNumber(fixture.round);
      if (n !== null) place(column.key, fixture, `r:${n}`, `${n}라운드`, n);
      else place(column.key, fixture, `o:${fixture.round.trim()}`, tournamentRoundLabel(fixture.round), Number.POSITIVE_INFINITY);
    });
  }

  const rows = [...drafts.values()]
    .sort((a, b) => a.sort - b.sort || a.order - b.order)
    .map((draft) => ({
      key: draft.key,
      label: draft.label,
      cells: Object.fromEntries(columns.map((column) => [column.key, draft.cells.get(column.key) ?? []])),
    }));
  return { columns, rows, legacyChunking: !numbered && fixtures.length > 0 };
}
