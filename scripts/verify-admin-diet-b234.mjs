/**
 * 어드민 다이어트 배치2(#753)·배치3(#754)·배치4(#756) alpha 일괄 실측.
 *
 * DOM 판정:
 *  [b2] 대회 목록 검색 부활 — 검색 input 존재 + 타이핑 시 q= API 호출 실측
 *  [b2] 신청 관리 탭 — '결제 완료' 필터 칩 존재
 *  [b3] 약관 미리보기 — 실제 사용자 렌더 클래스(tm-auth-soft-card·tm-auth-heading) 사용
 *  [b3] hub eyebrow '할 일'
 *  [b4] 문의 헤더 → 신고 랭킹 링크 / 이의 목록 → 리그 상세 링크
 * + 3폭 갤러리(6페이지 × 390/768/1440)
 *
 * 사용법: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/verify-admin-diet-b234.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.env.CAPTURE_BASE_URL ?? 'https://alpha.teameet.co.kr';
const OUT = process.argv[2] ?? '.capture/admin-diet-b234';
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

// ── DOM 판정 (1440 한 컨텍스트에서 순차) ──────────────────────────────────
{
  const { context, page } = await makePage(1440);

  // [b2] 대회 목록 검색
  await page.goto(`${BASE}/admin/tournaments`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const searchInput = page.locator('input[placeholder="대회명 검색"]');
  const hasSearch = (await searchInput.count()) > 0;
  let qObserved = false;
  if (hasSearch) {
    const waitQ = page
      .waitForResponse((res) => res.url().includes('/admin/tournaments') && res.url().includes('q='), { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    await searchInput.fill('테스트');
    qObserved = await waitQ;
  }
  results.push({ check: 'b2-tournaments-search-alive', hasSearch, qObserved, verdict: hasSearch && qObserved ? 'PASS' : 'FAIL' });

  // [b2] 첫 대회 상세 → 신청 관리 탭의 '결제 완료' 칩
  await searchInput.fill('');
  await page.waitForTimeout(1500);
  const firstRow = page.locator('tbody tr[role="button"]').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await page.waitForTimeout(2500);
    const detailUrl = page.url();
    const m = detailUrl.match(/\/admin\/tournaments\/([^/]+)/);
    if (m) {
      await page.goto(`${BASE}/admin/tournaments/${m[1]}/registrations`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const paidChip = await page.getByRole('button', { name: /결제 완료/ }).count();
      results.push({ check: 'b2-registrations-paid-chip', count: paidChip, verdict: paidChip > 0 ? 'PASS' : 'FAIL' });
      await page.screenshot({ path: `${OUT}/registrations-1440.png` });
    }
  } else {
    results.push({ check: 'b2-registrations-paid-chip', verdict: 'SKIP(대회 행 없음)' });
  }

  // [b3] 약관 미리보기 — 실제 사용자 렌더 클래스 사용 (편집 화면 진입: 첫 정책 클릭)
  await page.goto(`${BASE}/admin/terms`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const policyBtn = page.locator('button', { hasText: /이용약관|개인정보|약관/ }).first();
  if (await policyBtn.count()) {
    await policyBtn.click();
    await page.waitForTimeout(2000);
  }
  const softCard = await page.locator('.tm-auth-soft-card').count();
  const heading = await page.locator('h2.tm-text-heading').count();
  results.push({
    check: 'b3-terms-preview-real-render',
    softCard,
    h2Heading: heading,
    verdict: softCard > 0 && heading > 0 ? 'PASS' : 'FAIL',
  });

  // [b3] hub eyebrow '할 일'
  await page.goto(`${BASE}/admin/hub`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const eyebrow = await page.locator('text=할 일').count();
  results.push({ check: 'b3-hub-eyebrow', count: eyebrow, verdict: eyebrow > 0 ? 'PASS' : 'FAIL' });

  // [b4] 문의 헤더 → 신고 랭킹 링크
  await page.goto(`${BASE}/admin/inquiries`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const reportLink = await page.locator('a[href="/admin/reports/teams"]').count();
  results.push({ check: 'b4-inquiries-report-ranking-link', count: reportLink, verdict: reportLink > 0 ? 'PASS' : 'FAIL' });

  // [b4] 이의 목록 → 리그 상세 링크 (데이터 없으면 SKIP)
  await page.goto(`${BASE}/admin/league-match-disputes`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const leagueLinks = await page.locator('a[href^="/admin/league-matches/"]').count();
  const rows = await page.locator('tbody tr').count();
  results.push({
    check: 'b4-dispute-league-link',
    leagueLinks,
    rows,
    verdict: leagueLinks > 0 ? 'PASS' : rows === 0 ? 'SKIP(이의 데이터 없음)' : 'FAIL',
  });

  await context.close();
}

// ── 3폭 갤러리 ────────────────────────────────────────────────────────────
const SHOTS = [
  ['tournaments', '/admin/tournaments'],
  ['terms', '/admin/terms'],
  ['hub', '/admin/hub'],
  ['inquiries', '/admin/inquiries'],
  ['disputes', '/admin/league-match-disputes'],
];
for (const width of [390, 768, 1440]) {
  const { context, page } = await makePage(width);
  for (const [name, path] of SHOTS) {
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
