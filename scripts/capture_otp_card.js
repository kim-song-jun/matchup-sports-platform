// MT SMS OTP 휴대폰 인증 카드 시각 캡처 (public signup 경로).
// v1 스택 필요: web :3013 + api :8121 (V1_VERIFICATION_DEV_ECHO=true, migrate된 빈 DB).
// 출력: docs/visual-qa/mt-sms-otp/{mobile,tablet,desktop}/{received,input,card}.png
//  - received: 프로필 단계에서 "인증번호 받기"(idle) 상태의 전체 페이지
//  - input: 발급 후 6자리 입력 상태의 전체 페이지
//  - card: 카드 요소만 클립(입력·확인·다시받기·남은시간 전체가 보이도록)
// Run: node scripts/capture_otp_card.js
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/mt-sms-otp');

const WIDTHS = [
  { key: 'mobile', width: 390, height: 900, phone: '01022220001' },
  { key: 'tablet', width: 768, height: 1100, phone: '01022220002' },
  { key: 'desktop', width: 1440, height: 1200, phone: '01022220003' },
];

const HIDE_OVERLAY =
  'nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}';

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function run() {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    const dir = path.join(ROOT, w.key);
    ensureDir(dir);
    const ctx = await browser.newContext({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 2 });
    // terms 게이팅 우회 — signup 마운트 게이트는 signupTermsDocumentIds(JSON 배열)를 검사한다.
    await ctx.addInitScript(() => {
      window.sessionStorage.setItem('teameet.v1.signupTermsAccepted', 'true');
      window.sessionStorage.setItem(
        'teameet.v1.signupTermsDocumentIds',
        JSON.stringify([
          'a1110000-0000-4000-8000-000000000001',
          'a1110000-0000-4000-8000-000000000002',
          'a1110000-0000-4000-8000-000000000012',
        ]),
      );
    });
    const page = await ctx.newPage();
    await page.addStyleTag({ content: HIDE_OVERLAY }).catch(() => {});
    console.log(`[${w.key}] goto /signup`);
    await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.addStyleTag({ content: HIDE_OVERLAY }).catch(() => {});

    // --- account step ---
    await page.getByPlaceholder('활동 닉네임').fill('otpqa');
    await page.getByRole('button', { name: '중복 확인' }).nth(0).click();
    await page.getByText('사용 가능한 닉네임이에요.').waitFor({ timeout: 15000 });

    await page.getByPlaceholder('예: name@email.com').fill('otpqa@teameet.v1');
    await page.getByRole('button', { name: '중복 확인' }).nth(1).click();
    await page.getByText('사용 가능한 이메일이에요.').waitFor({ timeout: 15000 });

    const pwds = page.locator('input[type="password"]');
    const pwdCount = await pwds.count();
    await pwds.nth(0).fill('teameet1234');
    if (pwdCount > 1) await pwds.nth(1).fill('teameet1234');

    await page.getByRole('button', { name: '프로필 입력하기' }).click();

    // --- profile step ---
    await page.getByRole('radio', { name: '남' }).click().catch(async () => {
      await page.getByRole('button', { name: '남' }).click();
    });
    await page.getByPlaceholder('실명 또는 확인 가능한 이름').fill('오티피');
    await page.getByPlaceholder('010-0000-0000').fill(w.phone);

    // 카드 등장 대기 (인증번호 받기 버튼)
    const receiveBtn = page.getByRole('button', { name: '인증번호 받기' });
    await receiveBtn.waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(dir, 'received.png'), fullPage: true });
    console.log(`[${w.key}] captured received.png`);

    // 인증번호 받기 → dev-echo devCode 프리필 → 6자리 입력 상태
    await receiveBtn.click();
    await page.getByRole('button', { name: '확인' }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(dir, 'input.png'), fullPage: true });
    console.log(`[${w.key}] captured input.png`);

    // 카드 요소만 클립 — 고정 푸터에 가리지 않고 카드 전체(입력·확인·다시받기·남은시간) 노출.
    const card = page.getByText('휴대폰 본인인증', { exact: true }).locator('xpath=ancestor::div[1]');
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(200);
    await card.screenshot({ path: path.join(dir, 'card.png') }).catch((e) => console.log('card shot skip:', e.message));
    console.log(`[${w.key}] captured card.png`);

    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
}

run().catch((err) => {
  console.error('CAPTURE FAILED:', err && err.message ? err.message : err);
  process.exit(1);
});
