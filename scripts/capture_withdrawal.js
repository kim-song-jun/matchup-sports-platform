// Withdrawal page capture: mobile/tablet/desktop for PR gallery.
// Requires the v1 stack running (web :3013 + api :8121 + seeded pg).
// Run: node scripts/capture_withdrawal.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/withdrawal-flow');

const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'tablet', width: 768, height: 1024 },
  { key: 'desktop', width: 1440, height: 900 },
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of BREAKPOINTS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([id, email]) => {
      localStorage.removeItem('teameet.v1.userId');
      localStorage.setItem('teameet.v1.userEmail', email);
    }, HOST);
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/my/settings/withdrawal`, { waitUntil: 'networkidle', timeout: 30000 });
      await shot(page, dir, 'withdrawal');
      console.log(`OK ${bp.key}`);
    } catch (e) {
      console.log(`FAIL ${bp.key}`, e instanceof Error ? e.message : String(e));
    }
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
})();
