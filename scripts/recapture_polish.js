// Re-capture the pages affected by the chat full-height + auth/onboarding
// vertical-centering polish. Run: cd e2e && node ../scripts/recapture_polish.js
const { chromium } = require('@playwright/test');
const path = require('path');
const OUT = path.resolve(__dirname, '../docs/visual-qa/manual-v2/desktop');
const BASE = 'http://localhost:3013';
const HOST = ['0cf89db6-3e53-406c-b896-89ade09add9a', 'host@teameet.v1'];
const ONB = ['00000000-0000-4000-8000-000000001006', 'coverage-not-started@teameet.v1'];
const CHAT = '5c6a8892-0405-4594-98b8-92e70d49b869';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true, scale: 'css' });
  console.log('OK', name);
}

(async () => {
  const browser = await chromium.launch();

  // chat-room (host)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); }, HOST);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    await shot(p, 'web-24-chat-room');
    await ctx.close();
  }

  // public auth pages (no auth)
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/login/email`, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    await shot(p, 'web-03-login-email');
    await p.goto(`${BASE}/signup`, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    await shot(p, 'web-04-signup');
    await ctx.close();
  }

  // onboarding flow (onboarding user) — single context so the draft persists
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([i, e]) => { localStorage.setItem('teameet.v1.userId', i); localStorage.setItem('teameet.v1.userEmail', e); localStorage.removeItem('teameet.v1.onboardingDraft'); }, ONB);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/onboarding/sport`, { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
    await shot(p, 'web-05-onboarding-sport');
    // select a sport then advance to level
    await p.locator('button.tm-auth-option-card', { hasText: '축구' }).first().click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('button', { hasText: '실력 입력하기' }).first().click().catch(() => {});
    await p.waitForURL('**/onboarding/level', { timeout: 4000 }).catch(() => {});
    await p.waitForTimeout(900);
    await shot(p, 'web-06-onboarding-level');
    // select level then advance to region
    await p.locator('button,[role="radio"]', { hasText: '중수' }).first().click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('button.tm-btn-primary:not([disabled])').first().click().catch(() => {});
    await p.waitForTimeout(900);
    await shot(p, 'web-07-onboarding-region');
    // confirm (draft now has sport+level)
    await p.goto(`${BASE}/onboarding/confirm`, { waitUntil: 'networkidle' }); await p.waitForTimeout(700);
    await shot(p, 'web-08-onboarding-confirm');
    await ctx.close();
  }

  await browser.close();
  console.log('DONE');
})();
