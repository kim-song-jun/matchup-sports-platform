// 휴대폰 본인인증 UX 감사 캡처 (alpha 공개 구간).
// Output: docs/visual-qa/phone-verify-ux/{mobile,desktop}/<name>.png
// Run: node scripts/capture_phone_verify_ux.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.CAPTURE_BASE || 'https://alpha.teameet.co.kr';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/phone-verify-ux');
const STAMP = Date.now();
const EMAIL = `ux-audit-${STAMP}@teameet.test`;
const NICK = `감사${String(STAMP).slice(-6)}`;
const PHONE = '01000000000'; // 미할당 더미 번호 — 실제 수신자 없음

const BREAKPOINTS = [
  { key: 'mobile', width: 390, height: 844 },
  { key: 'desktop', width: 1440, height: 900 },
];

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
  console.log('  OK', name);
}

async function run(page, dir) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);

  // 0단계: 약관 동의 게이트 (가입 폼보다 먼저 뜬다)
  const consentAll = page.getByText('필수 약관 전체 동의', { exact: false }).first();
  if (await consentAll.count()) {
    await shot(page, dir, '00-signup-terms');
    await consentAll.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    const proceed = page.locator('button:not([disabled])').last();
    await proceed.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);
  }

  await page.getByPlaceholder('활동 닉네임').waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(600);

  // step 1: 계정
  await page.getByPlaceholder('활동 닉네임').fill(NICK);
  await page.getByPlaceholder('예: name@email.com').fill(EMAIL);
  await page.getByPlaceholder('8자 이상').fill('teameet-ux-1234');
  await page.getByPlaceholder('비밀번호 다시 입력').fill('teameet-ux-1234');
  // 닉네임·이메일 중복확인 버튼 (tm-btn-neutral 2개)
  const checks = page.locator('button.tm-btn-neutral');
  const n = await checks.count();
  for (let i = 0; i < n; i += 1) {
    await checks.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await shot(page, dir, '01-signup-account');

  // step 2: 프로필
  await page.getByRole('button', { name: '프로필 입력하기' }).click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  await shot(page, dir, '02-signup-profile');

  // 휴대폰 11자리 → 인증 카드 등장
  await page.getByPlaceholder('010-0000-0000').fill(PHONE);
  await page.waitForTimeout(900);
  await shot(page, dir, '03-phone-card-idle');

  // 인증번호 받기 → OTP 입력 + 카운트다운
  await page.getByRole('button', { name: '인증번호 받기' }).click({ timeout: 8000 });
  await page.waitForTimeout(3500);
  await shot(page, dir, '04-phone-card-sent');

  // 잘못된 코드 → 에러 배너 위치 확인
  const otp = page.locator('#phone-verification-otp-input');
  if (await otp.count()) {
    await otp.fill('123456');
    await page.getByRole('button', { name: '확인' }).first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, dir, '05-phone-code-error');
  } else {
    console.log('  SKIP 05 (otp input 미노출)');
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of BREAKPOINTS) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[${bp.key} ${bp.width}]`);
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
    const page = await ctx.newPage();
    try {
      await run(page, dir);
    } catch (e) {
      console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 160));
      await shot(page, dir, 'zz-failure-state').catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
})();
