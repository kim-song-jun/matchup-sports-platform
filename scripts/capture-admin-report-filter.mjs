/**
 * 어드민 문의 화면의 **신고 사유 필터**를 실제로 조작해 캡처한다.
 *
 * 왜 조작이 필요한가: 이 목록 화면은 필터 상태를 useState 로만 들고 있고 URL 쿼리로
 * 초기화하지 않는다. 그래서 `?category=report` 로 열어도 분류는 '전체' 이고 사유 필터는
 * 렌더되지 않는다 — 딥링크로는 이 UI 를 찍을 수 없다.
 *
 * 자격증명은 환경변수로만 받는다(이 저장소는 PUBLIC).
 *   ALPHA_ADMIN_EMAIL / ALPHA_ADMIN_PASSWORD (없으면 ALPHA_PASSWORD)
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-contacts');
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

const email = process.env.ALPHA_ADMIN_EMAIL;
const password = process.env.ALPHA_ADMIN_PASSWORD ?? process.env.ALPHA_PASSWORD;
if (!email || !password) throw new Error('필수 환경변수가 없습니다: ALPHA_ADMIN_EMAIL, ALPHA_ADMIN_PASSWORD(또는 ALPHA_PASSWORD)');

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (!res.ok) throw new Error(`login failed ${res.status}`);
// getSetCookie() 를 먼저 쓴다 — get() 은 Set-Cookie 가 여러 개일 때 하나로 합쳐 돌려줘
// 쿠키 경계가 흐려진다. 구형 런타임 대비로 get() 폴백을 둔다.
const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
const token = cookies.map((c) => c.match(/teameet_v1_session=([^;]+)/)?.[1]).find(Boolean);
if (!token) throw new Error('세션 쿠키를 못 받았다');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = [];

for (const theme of ['light', 'dark']) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, colorScheme: theme,
    });
    await ctx.addCookies([{
      name: 'teameet_v1_session', value: token,
      domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax',
    }]);
    const page = await ctx.newPage();
    await page.addInitScript((t) => { try { window.localStorage.setItem('tm-theme', t); } catch {} }, theme);
    await page.goto(`${BASE}/admin/inquiries`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(2500);

    // 분류를 '신고' 로 바꾼다 → 사유 필터가 나타난다.
    await page.getByLabel('문의 분류 필터').selectOption('report');
    await page.waitForTimeout(1200);
    const reasonVisible = await page.getByLabel('신고 사유 필터').isVisible().catch(() => false);

    // 사유를 '스팸·광고' 로 좁힌다.
    let narrowed = false;
    if (reasonVisible) {
      await page.getByLabel('신고 사유 필터').selectOption('spam');
      await page.waitForTimeout(1500);
      narrowed = true;
    }

    const file = path.join(OUT, `admin-report-filter-${theme}-${vp.key}.png`);
    await page.screenshot({ path: file, fullPage: true });
    const probe = await page.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      darkApplied: document.documentElement.classList.contains('dark'),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    }));
    console.log(`OK   admin-report-filter ${theme} ${vp.key}  reasonSelect=${reasonVisible} narrowed=${narrowed} bg=${probe.bg} dark=${probe.darkApplied} overflow=${probe.overflow}`);
    report.push({ theme, vp: vp.key, reasonVisible, narrowed, ...probe });
    await page.close();
    await ctx.close();
  }
}
await browser.close();
const missing = report.filter((r) => !r.reasonVisible);
console.log(missing.length === 0 ? '\n사유 필터가 6/6 전부 렌더됐다.' : `\n!! 사유 필터가 안 보인 케이스 ${missing.length}건`);
