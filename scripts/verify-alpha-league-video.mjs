// alpha 실측 — 리그 경기 영상(PR #750): 어드민 등록 → 공개 기록 반영 → 화면 렌더.
// 사용: ALPHA_EMAIL/ALPHA_PASSWORD(플랫폼 관리자) node scripts/verify-alpha-league-video.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://alpha.teameet.co.kr';
const HINT = process.env.LEAGUE_HINT ?? '운영자 입력 검증';
const OUT = process.env.OUT_DIR ?? '.screenshots/league-fixture-video-0825';
const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
});
const cookie = (login.headers.get('set-cookie') ?? '').match(/teameet_v1_session=([^;]+)/)?.[1] ?? '';
console.log('login:', login.status, cookie ? 'session ok' : 'NO SESSION');

async function api(path, init = {}) {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    ...init,
    headers: { accept: 'application/json', 'content-type': 'application/json', cookie: `teameet_v1_session=${cookie}`, ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, data: body?.data ?? null, body };
}

const list = await api('/league-matches?limit=50');
const league = (list.data.items ?? []).find((l) => l.title.includes(HINT));
if (!league) throw new Error('리그 없음');
const detail = await api(`/league-matches/${league.leagueId}`);
const completed = detail.data.fixtures.find((f) => typeof f.homeScore === 'number');
console.log('league:', league.leagueId, '| fixture:', completed?.teamMatchId);

// 어드민 목록 (신규 GET /admin/league-matches/:id/videos)
const adminList = await api(`/admin/league-matches/${league.leagueId}/videos`);
console.log('admin videos list:', adminList.status, 'items:', adminList.data?.items?.length ?? 'n/a', 'round[0]:', adminList.data?.items?.[0]?.round);

// 이미 같은 URL 이 등록돼 있으면(재실행) 등록을 건너뛴다 — 409 를 실패로 오독하지 않게.
const existing = (adminList.data?.items ?? []).find((f) => f.fixtureId === completed.teamMatchId)?.videos ?? [];
if (!existing.some((v) => v.url === VIDEO_URL)) {
  const createRes = await api(`/admin/league-matches/${league.leagueId}/fixtures/${completed.teamMatchId}/videos`, {
    method: 'POST',
    body: JSON.stringify({ url: VIDEO_URL, title: '(테스트) 하이라이트' }),
  });
  console.log('create video:', createRes.status, JSON.stringify(createRes.body?.data ?? createRes.body).slice(0, 160));
} else {
  console.log('create video: skipped (already registered)');
}

// 공개 기록에 반영되는지 — 관전자 ground truth.
const record = await api(`/league-matches/${league.leagueId}/fixtures/${completed.teamMatchId}/record`);
console.log('record videos:', JSON.stringify(record.data?.videos));
console.log('record history reasons:', JSON.stringify((record.data?.history ?? []).map((h) => h.reason)));

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies([{ name: 'teameet_v1_session', value: cookie, domain: 'alpha.teameet.co.kr', path: '/' }]);
for (const [name, path, width, height] of [
  ['fixture-video-mobile-390', `/league-matches/${league.leagueId}/fixtures/${completed.teamMatchId}`, 390, 844],
  ['fixture-video-desktop-1440', `/league-matches/${league.leagueId}/fixtures/${completed.teamMatchId}`, 1440, 900],
  ['admin-videos-desktop-1440', `/admin/league-matches/${league.leagueId}/videos`, 1440, 900],
]) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await page.close();
  await new Promise((r) => setTimeout(r, 400));
}
await browser.close();
console.log('saved to', OUT);
