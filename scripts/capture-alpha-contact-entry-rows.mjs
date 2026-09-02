/**
 * PR #977 보조 캡처 — 마이 메뉴 "채팅" 행과 팀 운영 메뉴 "받은 컨택" 행.
 * v1_web 은 window 가 아니라 .tm-scroll-area 로 스크롤하므로 fullPage 캡처가 첫 화면만 담는다
 * — 대상 행을 뷰포트로 스크롤한 뒤 찍는다. 자격증명은 환경변수로만 받는다(PUBLIC 저장소).
 *   ALPHA_EMAIL / ALPHA_PASSWORD / ALPHA_TEAM_ID · CAPTURE_OUT(기본 .screenshots/team-contact-chat)
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CAPTURE_BASE ?? 'https://alpha.teameet.co.kr';
const OUT = process.env.CAPTURE_OUT ?? path.resolve('.screenshots/team-contact-chat');
for (const n of ['ALPHA_EMAIL', 'ALPHA_PASSWORD', 'ALPHA_TEAM_ID']) if (!process.env[n]) throw new Error(`필수 환경변수가 없습니다: ${n}`);

const res = await fetch(`${BASE}/api/v1/auth/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ALPHA_EMAIL, password: process.env.ALPHA_PASSWORD }),
});
if (!res.ok) throw new Error(`login failed ${res.status}`);
const token = (res.headers.getSetCookie?.() ?? []).map((c) => c.match(/teameet_v1_session=([^;]+)/)?.[1]).find(Boolean);

const PAGES = [
  { key: 'my-home-chat-row', url: '/my', target: 'a[href="/chat"]' },
  { key: 'team-ops-contact-row', url: `/teams/${process.env.ALPHA_TEAM_ID}`, target: 'a[href="/chat?category=team_contact"]' },
];
const VIEWPORTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: 'teameet_v1_session', value: token, domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const resp = await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(3000);
    const target = page.locator(p.target).locator('visible=true').first();
    const found = (await target.count()) > 0;
    if (found) await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(500);
    const file = path.join(OUT, `${p.key}-light-${vp.key}.png`);
    await page.screenshot({ path: file, fullPage: false });
    const text = found ? (await target.innerText()).replace(/\s+/g, ' ').trim() : '(없음)';
    console.log(`SHOT ${p.key} ${vp.key} http=${resp?.status()} target=${found} text="${text}"`);
    await page.close();
    await new Promise((r) => setTimeout(r, 1500));
  }
  await ctx.close();
}
await browser.close();
