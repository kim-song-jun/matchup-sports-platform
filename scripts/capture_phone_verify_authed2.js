// 휴대폰 인증 UX 감사 2단계 — 기존 테스트 계정으로 로그인 후 프로필/홈/대회 감사.
// Run: node scripts/capture_phone_verify_authed2.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/phone-verify-ux/authed-mobile');
const EMAIL = process.env.AUDIT_EMAIL || 'ux-audit-1784999900623@teameet.test';
const PASSWORD = 'teameet-ux-1234';
const PHONE2 = '01000000456';

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ROOT, name + '.png'), fullPage: true, scale: 'css' });
  console.log('  OK', name);
}

async function go(page, route, name, wait = 3000) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(wait);
  await shot(page, name);
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login/email`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.getByPlaceholder(/비밀번호/).first().fill(PASSWORD);
    await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 8000 });
    await page.waitForTimeout(5000);
    await shot(page, '16-after-login');

    await go(page, '/my/profile/edit', '17-profile-edit-verified');

    // 번호 변경 → 저장: phoneVerifiedAt 리셋되는지 실증
    const phone = page.locator('input[inputmode="numeric"]');
    const count = await phone.count();
    console.log('  numeric inputs =', count);
    for (let i = 0; i < count; i += 1) {
      const val = await phone.nth(i).inputValue().catch(() => '');
      if (val.startsWith('010')) {
        await phone.nth(i).fill(PHONE2);
        console.log('  phone field idx', i, 'was', val);
        break;
      }
    }
    await page.waitForTimeout(600);
    await shot(page, '18-profile-phone-changed');
    await page.getByRole('button', { name: /저장|완료|수정/ }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4500);
    await shot(page, '19-after-save');

    await go(page, '/home', '20-home-unverified-banner', 4000);
    await go(page, '/my/phone-verify', '21-my-phone-verify');
    await go(page, '/tournaments', '22-tournaments-unverified');
    await go(page, '/my/profile/edit', '23-profile-edit-unverified');
  } catch (e) {
    console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 200));
    await shot(page, 'zz-failure2').catch(() => {});
  }
  await ctx.close();
  await browser.close();
  console.log('DONE');
})();
