/**
 * probe-alpha-mobile-shell.mjs 의 PAGES 를 목록 페이지의 실제 링크로 채워 상세 페이지까지 잰다.
 * (탭 페이지만 재면 하단 고정 CTA·no-bottom 프레임 경로가 통째로 빠진다.)
 * 사용: ALPHA_EMAIL=... ALPHA_PASSWORD=... node scripts/probe-alpha-mobile-shell-crawl.mjs
 */
import { chromium, devices } from 'playwright';
const BASE = 'https://alpha.teameet.co.kr';
const email = process.env.ALPHA_EMAIL;
const password = process.env.ALPHA_PASSWORD;
if (!email || !password) throw new Error('ALPHA_EMAIL/ALPHA_PASSWORD 가 필요합니다');
const res = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
// getSetCookie 가 없는 런타임에서는 합쳐진 set-cookie 한 줄로 폴백한다(다른 alpha 스크립트와 동일).
const raw = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
const token = raw.map((c) => /teameet_v1_session=([^;]+)/.exec(c)).find(Boolean)?.[1];
if (!token) throw new Error(`로그인 실패 HTTP ${res.status}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/', secure: new URL(BASE).protocol === 'https:', sameSite: 'Lax' }]);
const page = await ctx.newPage();
const out = new Set();
for (const list of ['/tournaments', '/teams', '/matches', '/team-matches', '/my', '/chat', '/leagues']) {
  const r = await page.goto(BASE + list, { waitUntil: 'domcontentloaded' }).catch(() => null);
  if (!r || r.status() !== 200) continue;
  await page.waitForTimeout(2500);
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('.tm-scroll-area a[href^="/"]')].map((a) => a.getAttribute('href')));
  const uniq = [...new Set(hrefs)].filter((h) => h.split('/').length >= 3 && !h.startsWith('/tournaments/campaigns')).slice(0, 3);
  uniq.forEach((h) => out.add(h));
}
await browser.close();
console.log('PAGES=' + [...out].join(','));
