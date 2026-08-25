/**
 * 어드민 다이어트 3단계 — 모니터링 허브(#767) alpha 실측 + 갤러리.
 *
 * DOM/HTTP 판정 (1440):
 *  [API] GET /admin/monitoring/summary → 4필드 전부 숫자
 *  [허브] 신호 스트립 4카드 + role=tab 4개 + 초기 에러 탭 본문 렌더
 *  [전환] 감사 탭 클릭 → 감사 본문(운영 활동/상태 변경 세그먼트) + URL ?tab=audit
 *  [리다이렉트] 구 URL 4개 → /admin/monitoring(?tab=) 착지
 *  [사이드바] '모니터링' 링크 존재 + 구 4링크(에러 로그·웹 푸시 실패·SMS·감사 로그) 부재
 * + 갤러리: 폭마다 허브를 1회만 로드하고 탭 클릭으로 4장 캡처(403 예방 — 요청 최소화)
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-mon.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-mon';
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

// ── [API] summary 4필드 ───────────────────────────────────────────────────
{
  const res = await fetch(`${BASE}/api/v1/admin/monitoring/summary`, {
    headers: { cookie: `teameet_v1_session=${token}` },
  });
  const json = res.ok ? await res.json() : null;
  const d = json?.data ?? {};
  const allNumbers = ['errorsLast24h', 'pushUnacked', 'smsUnacked', 'auditToday'].every(
    (k) => typeof d[k] === 'number',
  );
  results.push({
    check: 'mon-summary-api',
    status: res.status,
    data: d,
    verdict: res.ok && allNumbers ? 'PASS' : 'FAIL',
  });
}

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

  await page.goto(`${BASE}/admin/monitoring`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const signalCards = await page.locator('button[aria-label*="탭 열기"]').count();
  const tabs = await page.locator('[role="tab"]').count();
  const errorBody = await page.locator('body').innerText();
  results.push({
    check: 'mon-hub-strip-and-tabs',
    signalCards,
    tabs,
    hasErrorTabBody: /에러|로그/.test(errorBody),
    verdict: signalCards === 4 && tabs === 4 ? 'PASS' : 'FAIL',
  });

  // 감사 탭 클릭 → 본문 전환 + URL
  await page.getByRole('tab', { name: '감사 로그' }).click();
  await page.waitForTimeout(2500);
  const auditSegments = await page.getByRole('tab', { name: /운영 활동|상태 변경/ }).count();
  results.push({
    check: 'mon-tab-switch-audit',
    url: page.url().replace(BASE, ''),
    auditSegments,
    verdict: page.url().includes('tab=audit') && auditSegments === 2 ? 'PASS' : 'FAIL',
  });

  // 사이드바: 모니터링 링크 존재 + 구 링크 부재
  const monLinks = await page.locator('a[href="/admin/monitoring"]').count();
  const oldLinks = await page
    .locator('a[href="/admin/ops/errors"], a[href="/admin/ops/push-failures"], a[href="/admin/ops/sms-failures"], a[href="/admin/audit"]')
    .count();
  results.push({
    check: 'mon-sidebar-diet',
    monLinks,
    oldLinks,
    verdict: monLinks > 0 && oldLinks === 0 ? 'PASS' : 'FAIL',
  });

  // 구 URL 리다이렉트 4개
  for (const [from, expect] of [
    ['/admin/ops/errors', '/admin/monitoring'],
    ['/admin/ops/push-failures', 'tab=push'],
    ['/admin/ops/sms-failures', 'tab=sms'],
    ['/admin/audit', 'tab=audit'],
  ]) {
    await page.goto(`${BASE}${from}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const landed = page.url().replace(BASE, '');
    results.push({
      check: `mon-redirect-${from}`,
      landed,
      verdict: landed.includes(expect) && landed.startsWith('/admin/monitoring') ? 'PASS' : 'FAIL',
    });
  }

  await context.close();
}

// ── 갤러리: 폭마다 허브 1회 로드 + 탭 클릭 캡처 ──────────────────────────
const TAB_LABELS = [
  ['errors', '에러 로그'],
  ['push', '웹 푸시 실패'],
  ['sms', 'SMS · 인증 실패'],
  ['audit', '감사 로그'],
];
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  const res = await page.goto(`${BASE}/admin/monitoring`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  results.push({ check: `goto-monitoring-${width}`, status: res?.status() });
  for (const [key, label] of TAB_LABELS) {
    if (key !== 'errors') {
      await page.getByRole('tab', { name: label }).click();
      await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: `${OUT}/mon-${key}-${width}.png`, fullPage: false });
  }
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
