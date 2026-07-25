// 3단계 가입 위저드(계정 → 본인인증 → 프로필) 캡처.
// 인증 API 는 Playwright route 로 가로채 성공 응답을 돌려준다 — 로컬 출처에서는 alpha API 가
// 출처 검증으로 거부하기 때문이며, 화면/전환 자체는 실제 컴포넌트로 렌더된다.
// Output: docs/visual-qa/signup-verify-step/{mobile,desktop}/<name>.png
// Run: node scripts/capture_signup_steps.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/signup-verify-step');
const STAMP = Date.now();
const EMAIL = `step-${STAMP}@teameet.test`;
const NICK = `단계${String(STAMP).slice(-6)}`;
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
  console.log('  OK', name);
}

async function stubVerification(ctx) {
  const ok = (data) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'success', data, timestamp: new Date(0).toISOString() }),
  });
  await ctx.route('**/api/v1/auth/phone/issue', (route) =>
    route.fulfill(ok({ expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() })),
  );
  await ctx.route('**/api/v1/auth/phone/verify', (route) =>
    route.fulfill(ok({ verified: true, proofToken: 'CAPTURE-PROOF' })),
  );
}

async function run(page, dir) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  const agreeAll = page.getByRole('button', { name: /전체 동의/ });
  if (await agreeAll.count()) {
    if ((await agreeAll.getAttribute('aria-pressed')) !== 'true') await agreeAll.click({ timeout: 15000 });
    await page.getByRole('button', { name: /동의하고/ }).first().click({ timeout: 20000 });
    await page.waitForTimeout(3000);
  }

  // 1단계: 계정 (필수 표시 확인)
  await page.getByPlaceholder('활동 닉네임').waitFor({ state: 'visible', timeout: 40000 });
  await shot(page, dir, '01-step1-account-empty');

  await page.getByPlaceholder('활동 닉네임').fill(NICK);
  await page.getByPlaceholder('예: name@email.com').fill(EMAIL);
  await page.getByPlaceholder('8자 이상').fill('teameet-ux-1234');
  await page.getByPlaceholder('비밀번호 다시 입력').fill('teameet-ux-1234');
  const checks = page.locator('button.tm-btn-neutral');
  for (let i = 0; i < (await checks.count()); i += 1) {
    await checks.nth(i).click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1100);
  }
  await page.getByRole('button', { name: '본인인증 하기' }).click({ timeout: 15000 });
  await page.waitForTimeout(1500);

  // 2단계: 본인인증
  await shot(page, dir, '02-step2-verify-empty');
  await page.getByPlaceholder('010-0000-0000').fill('01012345678');
  await page.waitForTimeout(1000);
  await shot(page, dir, '03-step2-card-open');

  await page.getByRole('button', { name: '인증번호 받기' }).click({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.locator('#phone-verification-otp-input').fill('123456');
  await page.getByRole('button', { name: '확인' }).first().click({ timeout: 15000 });
  // 완료 표시가 잠깐 보인 뒤 자동 이동
  await page.waitForTimeout(400);
  await shot(page, dir, '04-step2-verified-before-advance');
  await page.waitForTimeout(2000);

  // 3단계: 프로필 (휴대폰 필드 없음)
  await shot(page, dir, '05-step3-profile');
  console.log('  프로필 단계 도달 =', (await page.getByPlaceholder('실명 또는 확인 가능한 이름').count()) > 0);
  console.log('  휴대폰 필드 잔존 =', await page.getByPlaceholder('010-0000-0000').count());
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of [
    { key: 'mobile', width: 390, height: 844 },
    { key: 'desktop', width: 1440, height: 900 },
  ]) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[${bp.key}]`);
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
    await stubVerification(ctx);
    const page = await ctx.newPage();
    try {
      await run(page, dir);
    } catch (e) {
      console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 200));
      await shot(page, dir, 'zz-failure').catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
})();
