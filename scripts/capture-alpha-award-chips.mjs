/**
 * STATS-3 어드민 수상 탭 추천 chip 3폭 캡처 (관리자 세션 쿠키 주입).
 * 캡처만 한다. chip 존재·문구는 computed 로 판정한다.
 *   ALPHA_EMAIL=... ALPHA_PASSWORD=... TOURNAMENT_ID=... OUT_DIR=... node scripts/capture-alpha-award-chips.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require_ = createRequire(new URL('../apps/v1_web/package.json', import.meta.url));
const { chromium } = require_('playwright');

const ORIGIN = process.env.ALPHA_ORIGIN ?? 'https://alpha.teameet.co.kr';
const T = process.env.TOURNAMENT_ID, OUT = process.env.OUT_DIR;
if (!process.env.ALPHA_EMAIL || !process.env.ALPHA_PASSWORD || !T || !OUT) { console.error('env 필요'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const res = await fetch(`${ORIGIN}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
});
const set = res.headers.getSetCookie?.() ?? (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
const pair = set.map((c) => c.split(';')[0]).find((c) => c.startsWith('teameet_v1_session='));
if (!pair) { console.error(`로그인 실패 HTTP ${res.status}`); process.exit(1); }
const [name, ...valueParts] = pair.split('=');
const cookie = { name, value: valueParts.join('='), domain: 'alpha.teameet.co.kr', path: '/', httpOnly: true, secure: true };

const WIDTHS = [
  { key: '390', width: 390, height: 900, mobile: true },
  { key: '768', width: 768, height: 1100, mobile: false },
  { key: '1440', width: 1440, height: 1100, mobile: false },
];
const browser = await chromium.launch();
try {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, isMobile: w.mobile, deviceScaleFactor: 2 });
    await ctx.addCookies([cookie]);
    const page = await ctx.newPage();
    await page.goto(`${ORIGIN}/admin/tournaments/${T}/awards`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const chip = await page.evaluate(() => {
      const strip = [...document.querySelectorAll('p')].find((el) => el.textContent?.includes('추천 근거'));
      if (!strip) return null;
      strip.scrollIntoView({ block: 'center' });
      const box = strip.closest('div');
      const buttons = [...(box?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('aria-label')).filter(Boolean);
      return { buttons };
    });
    await page.waitForTimeout(300);
    console.log(`${w.key}:`, JSON.stringify(chip));
    await page.screenshot({ path: `${OUT}/award-chips-${w.key}.png`, fullPage: false });
    await ctx.close();
  }
} finally { await browser.close(); }
console.log('done');
