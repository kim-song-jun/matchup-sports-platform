/**
 * 어드민 다이어트 S3b(#761 audit 표준화)·S3c(#762 포맷터 수렴) alpha 실측.
 *
 * DOM 판정:
 *  [S3b] audit: 대상 유형 칩이 공용 AdminFilterBar 구조(role=group 안 aria-pressed 버튼)로 렌더
 *  [S3b] audit: 탭 2개(role=tab) + 표 행 렌더
 *  [S3c] matches 목록 '시각' 열이 통일 포맷 M.D HH:mm (기존 M/D 슬래시식에서 변경) — computed 텍스트 판정
 * + 갤러리: audit·matches 3폭
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-s3.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-s3';
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

  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const chipGroup = page.locator('[role="group"] button[aria-pressed]');
  const chips = await chipGroup.count();
  const tabs = await page.locator('[role="tab"]').count();
  const tableRows = await page.locator('tbody tr').count();
  results.push({
    check: 's3b-audit-filterbar-chips',
    chips,
    tabs,
    tableRows,
    verdict: chips >= 10 && tabs === 2 ? 'PASS' : 'FAIL',
  });

  await page.goto(`${BASE}/admin/matches`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // 첫 데이터 행의 '시각' 열 텍스트 — 통일 포맷 M.D HH:mm 인지 computed 값으로 판정
  const firstTimeCell = await page
    .locator('tbody tr[role="button"]')
    .first()
    .locator('td')
    .first()
    .innerText()
    .catch(() => '');
  results.push({
    check: 's3c-matches-time-format-unified',
    sample: firstTimeCell.trim(),
    verdict: /^\d{1,2}\.\d{1,2} \d{2}:\d{2}$/.test(firstTimeCell.trim()) ? 'PASS' : firstTimeCell ? 'FAIL' : 'SKIP(행 없음)',
  });

  await context.close();
}

// ── 갤러리 ────────────────────────────────────────────────────────────────
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  for (const [name, path] of [
    ['audit', '/admin/audit'],
    ['matches', '/admin/matches'],
  ]) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    results.push({ check: `goto-${name}-${width}`, status: res?.status() });
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: false });
    await page.waitForTimeout(700);
  }
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
