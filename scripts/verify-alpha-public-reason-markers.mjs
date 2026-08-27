#!/usr/bin/env node
/**
 * PR #809 검증 — 공개 경기 기록의 결과 변경 이력(history)에서
 *  ① 운영자가 쓴 **몰수 사유**가 새어 나가지 않는지
 *  ② 감사용 마커(`[LEAGUE_RESULT_ENTRY]` 등)가 관전자에게 그대로 보이지 않는지
 *
 * 두 불변식:
 *  - outcome.reason === 'FORFEIT' 인 경기의 history[].reason 은 전부 null 이어야 한다
 *    (몰수 사유와 outcomeNote 는 같은 문자열이고, outcomeNote 는 이미 null 로 가려진다).
 *  - 어떤 history[].reason 에도 `[UPPER_SNAKE]` 형태의 기술 마커가 남아 있으면 안 된다.
 *
 * "위반 0건"과 "검사 0건"은 다르다 — 검사한 경기가 0이면 INCONCLUSIVE(exit 1)로 낸다.
 */
const BASE = process.env.ALPHA_BASE ?? 'https://alpha.teameet.co.kr/api/v1';

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.warn(`[warn] ${name}=${JSON.stringify(raw)} 은 양의 정수가 아니라 무시하고 ${fallback} 을 씁니다.`);
    return fallback;
  }
  return parsed;
}
const LEAGUE_LIMIT = positiveIntEnv('LEAGUE_LIMIT', 25);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, data: (await res.json()).data };
}

const MARKER = /\[[A-Z0-9_]{3,}\]/;

const leagues = [];
let cursor;
while (leagues.length < LEAGUE_LIMIT) {
  const page = await get(`/league-matches?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
  if (!page.ok) break;
  const items = page.data.items ?? [];
  leagues.push(...items.map((l) => l.id ?? l.leagueId));
  cursor = page.data.pageInfo?.nextCursor ?? page.data.pageInfo?.endCursor;
  if (!cursor || items.length === 0) break;
}

const forfeitNoteLeaks = [];
const markerLeaks = [];
let recordsChecked = 0;
let forfeitRecords = 0;

for (const leagueId of leagues.slice(0, LEAGUE_LIMIT)) {
  const detail = await get(`/league-matches/${leagueId}`);
  if (!detail.ok) continue;
  const fixtures = detail.data.fixtures ?? detail.data.teamMatches ?? [];
  for (const fx of fixtures) {
    const id = fx.teamMatchId ?? fx.id;
    if (!id) continue;
    const rec = await get(`/league-matches/${leagueId}/fixtures/${id}/record`);
    if (!rec.ok) continue;
    recordsChecked += 1;
    const history = rec.data.history ?? [];
    const isForfeit = rec.data.outcome?.reason === 'FORFEIT';
    if (isForfeit) forfeitRecords += 1;
    for (const h of history) {
      if (typeof h.reason === 'string' && MARKER.test(h.reason)) {
        markerLeaks.push({ leagueId, fixtureId: id, revision: h.revision, reason: h.reason });
      }
      if (isForfeit && h.reason !== null) {
        forfeitNoteLeaks.push({ leagueId, fixtureId: id, revision: h.revision, reason: h.reason });
      }
    }
  }
}

const violations = forfeitNoteLeaks.length + markerLeaks.length;
const covered = recordsChecked > 0;
const verdict = !covered ? 'INCONCLUSIVE' : violations === 0 ? 'PASS' : 'FAIL';

console.log(JSON.stringify({
  base: BASE,
  leaguesScanned: leagues.length,
  recordsChecked,
  forfeitRecords,
  forfeitNoteLeaks,
  markerLeaks,
  verdict,
  ...(covered ? {} : { note: '검사한 경기가 0건이라 판정할 수 없습니다 — 통과로 읽지 마세요.' }),
  ...(covered && forfeitRecords === 0
    ? { note: '몰수 경기가 0건이라 몰수-사유 불변식은 실측되지 않았습니다(마커 불변식만 검증됨).' }
    : {}),
}, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
