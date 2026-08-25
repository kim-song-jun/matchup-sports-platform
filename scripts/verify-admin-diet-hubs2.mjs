/**
 * 어드민 다이어트 3단계 — 설정 허브 + 콘텐츠 허브(#771) alpha 실측 + 갤러리.
 *
 * DOM/HTTP 판정 (1440):
 *  [설정] /admin/settings 탭 2개 + 연동 폼 렌더, 후기 정책 탭 전환 + URL ?tab=reviews
 *  [설정 리다이렉트] /admin/settings/integrations → /admin/settings ·
 *                    /admin/settings/reviews → ?tab=reviews
 *  [콘텐츠] /admin/content 탭 3개 + 공지 본문 렌더, 약관 탭 전환 + URL ?tab=terms
 *  [콘텐츠 리다이렉트] /admin/notices → 허브 · /admin/terms → ?tab=terms ·
 *                      /admin/popups?targetPath=/tournaments/x → ?tab=popups&targetPath 보존
 *  [사이드바] 설정·콘텐츠 단일 입구 + 구 5링크(연동 설정·후기 정책·공지사항·팝업·약관) 부재 + 문의 생존
 * + 갤러리: 설정 2탭 + 콘텐츠 3탭 × 3폭 (허브 1회 로드 + 탭 클릭 — 요청 최소화)
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-hubs2.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-hubs2';
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
const browser = await chromium.launch();
const results = [];

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

  // 설정 허브
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const settingsTabs = await page.locator('[role="tab"]').count();
  const kakaoForm = await page.getByText('카카오맵 연동').count();
  results.push({
    check: 'settings-hub-tabs-and-form',
    tabs: settingsTabs,
    kakaoForm,
    verdict: settingsTabs === 2 && kakaoForm > 0 ? 'PASS' : 'FAIL',
  });

  await page.getByRole('tab', { name: '후기 정책' }).click();
  await page.waitForTimeout(2000);
  const reviewForm = await page.getByText('후기 작성 가능 기간').count();
  results.push({
    check: 'settings-tab-switch-reviews',
    url: page.url().replace(BASE, ''),
    reviewForm,
    verdict: page.url().includes('tab=reviews') && reviewForm > 0 ? 'PASS' : 'FAIL',
  });

  // 콘텐츠 허브
  await page.goto(`${BASE}/admin/content`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const contentTabs = await page.locator('[role="tab"]').count();
  const noticeSearch = await page.getByLabel('공지 검색').count();
  results.push({
    check: 'content-hub-tabs-and-notices',
    tabs: contentTabs,
    noticeSearch,
    verdict: contentTabs === 3 && noticeSearch > 0 ? 'PASS' : 'FAIL',
  });

  await page.getByRole('tab', { name: '약관' }).click();
  await page.waitForTimeout(2500);
  const termsBody = await page.getByRole('button', { name: /새 약관/ }).count();
  results.push({
    check: 'content-tab-switch-terms',
    url: page.url().replace(BASE, ''),
    termsBody,
    verdict: page.url().includes('tab=terms') && termsBody > 0 ? 'PASS' : 'FAIL',
  });

  // 사이드바: 새 입구 2 + 구 5링크 부재 + 문의 생존
  const settingsLinks = await page.locator('a[href="/admin/settings"]').count();
  const contentLinks = await page.locator('a[href="/admin/content"]').count();
  const inquiriesLinks = await page.locator('a[href="/admin/inquiries"]').count();
  const oldLinks = await page
    .locator(
      'a[href="/admin/settings/integrations"], a[href="/admin/settings/reviews"], a[href="/admin/notices"], a[href="/admin/popups"], a[href="/admin/terms"]',
    )
    .count();
  results.push({
    check: 'sidebar-diet-settings-content',
    settingsLinks,
    contentLinks,
    inquiriesLinks,
    oldLinks,
    verdict:
      settingsLinks > 0 && contentLinks > 0 && inquiriesLinks > 0 && oldLinks === 0
        ? 'PASS'
        : 'FAIL',
  });

  // 리다이렉트 5개 (팝업은 targetPath 보존까지)
  for (const [from, expect] of [
    ['/admin/settings/integrations', '/admin/settings'],
    ['/admin/settings/reviews', 'tab=reviews'],
    ['/admin/notices', '/admin/content'],
    ['/admin/terms', 'tab=terms'],
    ['/admin/popups?targetPath=%2Ftournaments%2Fredirect-check', 'targetPath=%2Ftournaments%2Fredirect-check'],
  ]) {
    await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const landed = page.url().replace(BASE, '');
    const base = from.startsWith('/admin/settings') ? '/admin/settings' : '/admin/content';
    results.push({
      check: `redirect-${from.split('?')[0]}`,
      landed,
      verdict: landed.includes(expect) && landed.startsWith(base) ? 'PASS' : 'FAIL',
    });
  }

  await context.close();
}

// ── 갤러리: 폭마다 허브 로드 + 탭 클릭 캡처 ──────────────────────────────
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);

  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/settings-integrations-${width}.png`, fullPage: false });
  await page.getByRole('tab', { name: '후기 정책' }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/settings-reviews-${width}.png`, fullPage: false });

  const res = await page.goto(`${BASE}/admin/content`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  results.push({ check: `goto-content-${width}`, status: res?.status() });
  await page.screenshot({ path: `${OUT}/content-notices-${width}.png`, fullPage: false });
  for (const [key, label] of [
    ['popups', '팝업'],
    ['terms', '약관'],
  ]) {
    await page.getByRole('tab', { name: label }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/content-${key}-${width}.png`, fullPage: false });
  }
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
