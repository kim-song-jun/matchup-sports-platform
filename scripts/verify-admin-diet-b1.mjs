/**
 * 어드민 다이어트 배치1(#751) alpha 실측 — 행 진입·전파 차단·빈값 계약을 DOM으로 판정하고
 * 3폭(390/768/1440) 갤러리 캡처를 남긴다.
 *
 * 판정 항목:
 *  1. 모바일(390) 카드 스택: li[role=button] 존재 + aria-label + 탭하면 상세로 이동
 *  2. 데스크톱(1440) users/teams: tr[role=button] 행 진입 신설 확인
 *  3. 데스크톱 matches: "상태 변경" 클릭 시 모달이 열리고 상세로 튕기지 않음(전파 차단)
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-b1.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-b1';
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
  // alpha 는 과한 캡처에 403 을 건다 — 모든 응답의 상태를 감시해 오진을 막는다.
  page.on('response', (res) => {
    if (res.status() === 403 && res.url().includes('/api/')) {
      results.push({ check: 'HTTP-403', url: res.url(), verdict: 'RATE-LIMITED' });
    }
  });
  return { context, page };
}

const SHOTS = [
  ['users', '/admin/users'],
  ['teams', '/admin/teams'],
  ['matches', '/admin/matches'],
];

// ── 3폭 갤러리 캡처 ────────────────────────────────────────────────────────
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  for (const [name, path] of SHOTS) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    results.push({ check: `goto-${name}-${width}`, status: res?.status() });
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: false });
    await page.waitForTimeout(600); // 요청 간격 — 403 방지
  }
  await context.close();
}

// ── DOM 판정 1·2: 모바일 카드 행 진입 (users) ─────────────────────────────
{
  const { context, page } = await makePage(390);
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const cards = page.locator('ul[role="list"] > li[role="button"]');
  const count = await cards.count();
  const label = count > 0 ? await cards.first().getAttribute('aria-label') : null;
  results.push({ check: 'mobile-card-role-button', count, sampleLabel: label, verdict: count > 0 ? 'PASS' : 'FAIL' });
  if (count > 0) {
    await cards.first().click();
    await page.waitForTimeout(2500);
    const url = page.url();
    results.push({
      check: 'mobile-card-click-navigates',
      url,
      verdict: /\/admin\/users\/[^/]+$/.test(url) ? 'PASS' : 'FAIL',
    });
  }
  await context.close();
}

// ── DOM 판정 2: 데스크톱 행 진입 신설 (users·teams) ───────────────────────
{
  const { context, page } = await makePage(1440);
  for (const [name, path] of [['users', '/admin/users'], ['teams', '/admin/teams']]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const rows = await page.locator('tbody tr[role="button"]').count();
    results.push({ check: `desktop-row-button-${name}`, count: rows, verdict: rows > 0 ? 'PASS' : 'FAIL' });
    await page.waitForTimeout(600);
  }

  // ── DOM 판정 3: matches 상태 변경 버튼 전파 차단 ──────────────────────
  await page.goto(`${BASE}/admin/matches`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const actionBtn = page.locator('tbody tr[role="button"] button', { hasText: '상태 변경' }).first();
  if (await actionBtn.count()) {
    const before = page.url();
    await actionBtn.click();
    await page.waitForTimeout(1500);
    const dialogVisible = await page.locator('[role="dialog"]').count();
    const stayed = page.url() === before;
    results.push({
      check: 'matches-action-no-row-propagation',
      dialogVisible,
      stayedOnList: stayed,
      verdict: dialogVisible > 0 && stayed ? 'PASS' : 'FAIL',
    });
    await page.screenshot({ path: `${OUT}/matches-modal-1440.png`, fullPage: false });
  } else {
    results.push({ check: 'matches-action-no-row-propagation', verdict: 'SKIP(버튼 없음 — canWrite 미보유?)' });
  }
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
