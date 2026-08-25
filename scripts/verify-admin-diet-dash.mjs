/**
 * 어드민 다이어트 3단계 — 단일 대시보드(#773) alpha 실측 + 갤러리.
 *
 * DOM/HTTP 판정 (1440):
 *  [대시보드] /admin 에 섹션 순서 = 할 일 → 주의 필요 → 현황 → 최근 운영 활동
 *  [할 일] 인박스 KPI 4카드(미승인 대회 신청·결과 검토 대기·미답변 문의·진행중 대회) 렌더
 *  [리다이렉트] /admin/hub → /admin
 *  [사이드바] '대시보드' 단일 항목 + '할 일'·'개요' 링크 부재
 * + 갤러리: 대시보드 3폭 (fullPage — 세로 서사가 변경점이므로 전체 스크롤 캡처)
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-dash.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-dash';
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

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // 섹션 순서 — h2 헤딩 요소의 문서 순서로 판정한다. 본문 innerText indexOf 는
  // 헤더 설명문("처리할 일과 플랫폼 현황을…")의 부분 문자열에 걸려 거짓 FAIL 을 낸다.
  const headings = await page.locator('h2').allInnerTexts();
  const wanted = ['할 일', '주의 필요', '현황', '최근 운영 활동'];
  const order = wanted.map((h) => headings.findIndex((text) => text.trim() === h));
  const ordered = order.every((idx, i) => idx >= 0 && (i === 0 || idx > order[i - 1]));
  results.push({
    check: 'dash-section-order',
    headings,
    positions: order,
    verdict: ordered ? 'PASS' : 'FAIL',
  });

  const inboxCards = await Promise.all(
    ['미승인 대회 신청', '결과 검토 대기', '미답변 문의', '진행중 대회'].map((label) =>
      page.getByText(label, { exact: true }).count(),
    ),
  );
  results.push({
    check: 'dash-inbox-kpis',
    counts: inboxCards,
    verdict: inboxCards.every((count) => count > 0) ? 'PASS' : 'FAIL',
  });

  // 사이드바
  const dashLinks = await page.locator('nav a[href="/admin"]').count();
  const oldTodoLinks = await page.locator('a[href="/admin/hub"]').count();
  results.push({
    check: 'dash-sidebar-single-entry',
    dashLinks,
    oldTodoLinks,
    verdict: dashLinks > 0 && oldTodoLinks === 0 ? 'PASS' : 'FAIL',
  });

  // 리다이렉트
  await page.goto(`${BASE}/admin/hub`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const landed = new URL(page.url()).pathname;
  results.push({
    check: 'dash-redirect-hub',
    landed,
    verdict: landed === '/admin' ? 'PASS' : 'FAIL',
  });

  await context.close();
}

// ── 갤러리 (fullPage — 세로 서사가 이 변경의 본질) ────────────────────────
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  const res = await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  results.push({ check: `goto-dash-${width}`, status: res?.status() });
  await page.screenshot({ path: `${OUT}/dashboard-${width}.png`, fullPage: true });
  await context.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
