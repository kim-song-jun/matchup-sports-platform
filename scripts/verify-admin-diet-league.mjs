/**
 * 어드민 다이어트 3단계 — 리그 허브(#769) alpha 실측 + 갤러리.
 *
 * DOM/HTTP 판정 (1440):
 *  [API] GET /admin/league-matches — 목록 항목에 seriesId·seriesTitle·tierLabel 필드 존재
 *  [API] seriesId=independent 필터 — 반환 전 행이 seriesId null
 *  [허브] /admin/league-matches 탭 2개 + '소속 · 티어' 열 헤더 + 체계 칩(role=group)
 *  [전환] 리그 체계 탭 클릭 → 체계 목록 렌더 + URL ?tab=series
 *  [리다이렉트] /admin/league-series → /admin/league-matches?tab=series
 *  [사이드바] '리그 체계' 링크 부재 + '정규 리그' 생존
 * + 갤러리: 정규 리그·리그 체계 탭 × 3폭
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-league.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-league';
const EMAIL = process.env.ALPHA_EMAIL;
const PASSWORD = process.env.ALPHA_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('ALPHA_EMAIL / ALPHA_PASSWORD 환경변수가 필요해요.');
  process.exit(1);
}

async function login() {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const cookie = raw.map((c) => c ?? '').find((c) => c.startsWith('teameet_v1_session='));
  if (!cookie) throw new Error('세션 쿠키를 못 받았어요.');
  return cookie.split(';')[0].split('=').slice(1).join('=');
}

const token = await login();
await mkdir(OUT, { recursive: true });
const results = [];

// ── [API] 목록 응답 필드 + independent 필터 ───────────────────────────────
{
  const headers = { cookie: `teameet_v1_session=${token}` };
  const listRes = await fetch(`${BASE}/api/v1/admin/league-matches`, { headers });
  const listJson = listRes.ok ? await listRes.json() : null;
  const items = listJson?.data?.items ?? [];
  const first = items[0] ?? null;
  const hasFields =
    first !== null &&
    'seriesId' in first &&
    'seriesTitle' in first &&
    'tierLabel' in first &&
    'seasonNo' in first;
  results.push({
    check: 'league-list-series-fields',
    status: listRes.status,
    itemCount: items.length,
    sample: first
      ? { seriesTitle: first.seriesTitle, tierLabel: first.tierLabel }
      : null,
    verdict: listRes.ok && (items.length === 0 || hasFields) ? 'PASS' : 'FAIL',
  });

  const indRes = await fetch(`${BASE}/api/v1/admin/league-matches?seriesId=independent`, { headers });
  const indJson = indRes.ok ? await indRes.json() : null;
  const indItems = indJson?.data?.items ?? [];
  const allIndependent = indItems.every((row) => row.seriesId === null);
  results.push({
    check: 'league-list-independent-filter',
    status: indRes.status,
    itemCount: indItems.length,
    verdict: indRes.ok && allIndependent ? 'PASS' : 'FAIL',
  });
}

const browser = await chromium.launch();

async function makePage(width) {
  const context = await browser.newContext({
    viewport: { width, height: width < 800 ? 900 : 960 },
    deviceScaleFactor: 2,
  });
  await context.addCookies([
    { name: 'teameet_v1_session', value: token, domain: 'alpha.teameet.co.kr', path: '/' },
  ]);
  await context.addInitScript(() => window.localStorage.setItem('teameet.v1.session', 'active'));
  const page = await context.newPage();
  page.on('response', (res) => {
    if (res.status() === 403 && res.url().includes('/api/')) {
      results.push({ check: 'HTTP-403', url: res.url(), verdict: 'RATE-LIMITED' });
    }
  });
  return { context, page };
}

// ── DOM 판정 (1440) ───────────────────────────────────────────────────────
{
  const { context, page } = await makePage(1440);

  await page.goto(`${BASE}/admin/league-matches`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const tabs = await page.locator('[role="tab"]').count();
  const tierHeader = await page.getByText('소속 · 티어').count();
  const chips = await page.locator('[role="group"][aria-label="체계 필터"] button').count();
  results.push({
    check: 'league-hub-tabs-tier-chips',
    tabs,
    tierHeader,
    chips,
    verdict: tabs === 2 && tierHeader > 0 && chips >= 2 ? 'PASS' : 'FAIL',
  });

  await page.getByRole('tab', { name: '리그 체계' }).click();
  await page.waitForTimeout(2500);
  const seriesHeader = await page.getByText('리그 체계 만들기').count();
  results.push({
    check: 'league-tab-switch-series',
    url: page.url().replace(BASE, ''),
    seriesHeader,
    verdict: page.url().includes('tab=series') && seriesHeader > 0 ? 'PASS' : 'FAIL',
  });

  // 사이드바
  const leagueLinks = await page.locator('a[href="/admin/league-matches"]').count();
  const oldSeriesLinks = await page.locator('a[href="/admin/league-series"]').count();
  results.push({
    check: 'league-sidebar-diet',
    leagueLinks,
    oldSeriesLinks,
    verdict: leagueLinks > 0 && oldSeriesLinks === 0 ? 'PASS' : 'FAIL',
  });

  // 리다이렉트
  await page.goto(`${BASE}/admin/league-series`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const landed = page.url().replace(BASE, '');
  results.push({
    check: 'league-redirect-series-list',
    landed,
    verdict: landed.startsWith('/admin/league-matches') && landed.includes('tab=series') ? 'PASS' : 'FAIL',
  });

  await context.close();
}

// ── 갤러리 ────────────────────────────────────────────────────────────────
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  const res = await page.goto(`${BASE}/admin/league-matches`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  results.push({ check: `goto-league-${width}`, status: res?.status() });
  await page.screenshot({ path: `${OUT}/league-leagues-${width}.png`, fullPage: false });
  await page.getByRole('tab', { name: '리그 체계' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/league-series-${width}.png`, fullPage: false });
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
