// alpha 실측 캡처 — 리그 경기 상세의 대회 패리티 본문(PR #747) 검증용.
// 사용: ALPHA_EMAIL/ALPHA_PASSWORD(선택, 참가팀 시점) node scripts/capture-league-fixture-record.mjs
// 주의: alpha 는 과한 캡처에 403 을 건다 — 페이지 수를 늘리지 말 것.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://alpha.teameet.co.kr';
const HINT = process.env.LEAGUE_HINT ?? '운영자 입력 검증';
const OUT = process.env.OUT_DIR ?? '.screenshots/league-fixture-record-0825';
const WIDTHS = [
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['desktop-1440', 1440, 900],
];

async function api(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return (await res.json()).data;
}

const list = await api('/league-matches?limit=50');
const items = list.items ?? [];
const league = items.find((l) => l.title.includes(HINT)) ?? items.find((l) => l.state === 'active') ?? items[0];
if (!league) throw new Error('리그가 없습니다');
const detail = await api(`/league-matches/${league.leagueId}`);
const upcoming = detail.fixtures.find((f) => typeof f.homeScore !== 'number' && f.status !== 'cancelled');
const completed = detail.fixtures.find((f) => typeof f.homeScore === 'number');
console.log('league:', league.leagueId, league.title);
console.log('upcoming:', upcoming?.teamMatchId, 'completed:', completed?.teamMatchId);

// 기록 API 계약 실측 — 관전자가 실제로 받는 값(ground truth).
for (const fx of [upcoming, completed].filter(Boolean)) {
  try {
    const record = await api(`/league-matches/${league.leagueId}/fixtures/${fx.teamMatchId}/record`);
    console.log(
      `record ${fx.teamMatchId}: round=${record.round} status=${record.status} scoreStatus=${record.scoreStatus} score=${JSON.stringify(record.score)} events=${record.events.length} videos=${record.videos.length}`,
    );
  } catch (error) {
    console.log(`record ${fx.teamMatchId}: ${error.message}`);
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
const pages = [
  ...(upcoming ? [['record-upcoming', `/league-matches/${league.leagueId}/fixtures/${upcoming.teamMatchId}`]] : []),
  ...(completed ? [['record-completed', `/league-matches/${league.leagueId}/fixtures/${completed.teamMatchId}`]] : []),
];
for (const [name, path] of pages) {
  for (const [label, width, height] of WIDTHS) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height });
    // 라이브 폴링 페이지는 networkidle 이 끝나지 않는다 — domcontentloaded + 대기.
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${name}-${label}.png`, fullPage: true });
    await page.close();
    await new Promise((r) => setTimeout(r, 400));
  }
}
await browser.close();
console.log('saved to', OUT);
