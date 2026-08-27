#!/usr/bin/env node
/**
 * PR #806 fix 검증 — 공개 팀 전적의 시즌 드롭다운이 숨긴 경기의 존재를 노출하지 않는지.
 *
 * 불변식: `availableSeasons` 에 들어 있는 연도를 골랐을 때 목록이 비어 있으면 안 된다.
 * 비어 있다면 그 해에 경기가 있긴 한데 전부 hidden 이라 본문에서 빠졌다는 뜻이고,
 * 그것이 곧 "숨긴 경기의 존재"를 드러내는 간접 노출이다(수정 전 결함).
 *
 * 역방향도 함께 잰다: 목록에 실제로 등장한 경기의 연도는 반드시 availableSeasons 에
 * 있어야 한다(가시성 게이트를 너무 조여 정상 시즌을 지워 버리지 않았는지).
 */
const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr/api/v1';
const TEAM_LIMIT = Number(process.env.TEAM_LIMIT ?? 40);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()).data;
}

const seasonOf = (iso) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date(iso));

const teams = [];
let cursor;
while (teams.length < TEAM_LIMIT) {
  const page = await get(`/teams?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  teams.push(...page.items.map((t) => ({ id: t.teamId ?? t.id, name: t.name })));
  cursor = page.pageInfo?.nextCursor ?? page.pageInfo?.endCursor;
  if (!cursor || page.items.length === 0) break;
}

const emptySeasons = [];
const missingSeasons = [];
let teamsWithRecords = 0;
let seasonsChecked = 0;

for (const team of teams.slice(0, TEAM_LIMIT)) {
  let root;
  try {
    root = await get(`/teams/${team.id}/records?limit=50`);
  } catch {
    continue;
  }
  const seasons = root.availableSeasons ?? [];
  const items = root.items ?? [];
  if (seasons.length === 0 && items.length === 0) continue;
  teamsWithRecords += 1;

  for (const season of seasons) {
    seasonsChecked += 1;
    const scoped = await get(`/teams/${team.id}/records?limit=50&season=${encodeURIComponent(season)}`);
    if ((scoped.items ?? []).length === 0) {
      emptySeasons.push({ team: team.name, teamId: team.id, season });
    }
  }
  for (const item of items) {
    const at = item.playedAt ?? item.playedAtIso ?? item.date;
    if (!at) continue;
    const s = seasonOf(at);
    if (!seasons.includes(s)) missingSeasons.push({ team: team.name, teamId: team.id, season: s });
  }
}

console.log(JSON.stringify({
  base: BASE,
  teamsScanned: teams.length,
  teamsWithRecords,
  seasonsChecked,
  emptySeasons,
  missingSeasons,
  verdict: emptySeasons.length === 0 && missingSeasons.length === 0 ? 'PASS' : 'FAIL',
}, null, 2));
process.exit(emptySeasons.length === 0 && missingSeasons.length === 0 ? 0 : 1);
