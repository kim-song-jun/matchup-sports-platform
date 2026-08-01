// alpha 배포 후 인증 게이트 화면 검증.
// Output: docs/visual-qa/phone-verify-ux/alpha-verify/<name>.png
// Run: node scripts/capture_alpha_gates.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'https://alpha.teameet.co.kr';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/phone-verify-ux/alpha-verify');
const EMAIL = process.env.AUDIT_EMAIL || 'ux-audit-1784999900623@teameet.test';
const PASSWORD = 'teameet-ux-1234';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ROOT, name + '.png'), fullPage: true, scale: 'css' });
  console.log('  OK', name);
}

(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/login/email`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.getByPlaceholder(/비밀번호/).first().fill(PASSWORD);
    await page.getByRole('button', { name: /로그인/ }).first().click({ timeout: 10000 });
    await page.waitForTimeout(5000);

    // 열려 있는 대회 하나 찾기
    const openId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/tournaments?limit=30', { credentials: 'include' });
      const json = await res.json();
      const items = json.data?.items ?? json.data ?? [];
      return (items.find((t) => t.status === 'open') || {}).id ?? null;
    });
    console.log('  open tournament =', openId);

    if (openId) {
      // 1) 미인증 계정의 신청 진입 → 인증 유도 화면
      await page.goto(`${BASE}/tournaments/${openId}/apply`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);
      await shot(page, '01-apply-gate-unverified');
      const cta = page.getByRole('link', { name: '본인인증 하러 가기' });
      console.log('  인증 유도 CTA 노출 =', (await cta.count()) > 0);
      if (await cta.count()) {
        console.log('  href =', await cta.getAttribute('href'));
        await cta.click({ timeout: 10000 });
        await page.waitForTimeout(3500);
        await shot(page, '02-phone-verify-page');
        console.log('  이동 후 URL =', page.url());
      }
    }

    // 2) 프로필 수정 — 번호 변경 시 인증 카드가 뜨는지
    await page.goto(`${BASE}/my/profile/edit`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    const phone = page.locator('input[inputmode="numeric"]');
    const count = await phone.count();
    for (let i = 0; i < count; i += 1) {
      const val = await phone.nth(i).inputValue().catch(() => '');
      if (val.startsWith('010')) {
        await phone.nth(i).fill('01000000777');
        break;
      }
    }
    await page.waitForTimeout(1500);
    await shot(page, '03-profile-phone-change-card');
    console.log('  인증 카드 노출 =', (await page.getByText('휴대폰 본인인증', { exact: false }).count()) > 0);
  } catch (e) {
    console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 200));
    await shot(page, 'zz-failure').catch(() => {});
  }
  await ctx.close();
  await browser.close();
  console.log('DONE');
})();
