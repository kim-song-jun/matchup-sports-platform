// 휴대폰 인증 UX 감사 — 로그인 이후 화면(alpha).
// 공개 OTP 코드는 scrypt 해시로만 저장돼 읽을 수 없으므로, 발급 직후 alpha DB 의
// 해당 phone 챌린지 1행만 "알고 있는 코드"의 해시로 덮어써서 가입을 완주한다.
// Output: docs/visual-qa/phone-verify-ux/authed-{mobile,desktop}/<name>.png
// Run: node scripts/capture_phone_verify_authed.js
const { chromium } = require('@playwright/test');
const { execFileSync } = require('child_process');
const { randomBytes, scryptSync } = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = 'https://alpha.teameet.co.kr';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/phone-verify-ux');
const REGION = 'ap-northeast-2';
const IID = 'i-06efc23f226edccd7';

const STAMP = Date.now();
const EMAIL = `ux-audit-${STAMP}@teameet.test`;
const NICK = `감사${String(STAMP).slice(-6)}`;
const PHONE = '01000000123';      // 010-0000-xxxx = 미할당 대역, 실제 수신자 없음
const PHONE2 = '01000000456';     // 번호 변경(인증 해제) 실증용
const KNOWN_CODE = '000000';
const PASSWORD = 'teameet-ux-1234';

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function scryptHash(value) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(value, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

function ssmSql(sql) {
  const payload = {
    commands: [
      `docker exec teameet_v1_postgres psql -U teameet_alpha -d teameet_alpha -c ${JSON.stringify(sql)}`,
    ],
  };
  const file = path.join(os.tmpdir(), `ssm-sql-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  const cid = execFileSync('aws', [
    'ssm', 'send-command', '--region', REGION, '--instance-ids', IID,
    '--document-name', 'AWS-RunShellScript', '--parameters', `file://${file}`,
    '--query', 'Command.CommandId', '--output', 'text',
  ]).toString().trim();
  execFileSync('aws', ['ssm', 'wait', 'command-executed', '--region', REGION, '--command-id', cid, '--instance-id', IID], { stdio: 'ignore' });
  const out = execFileSync('aws', [
    'ssm', 'get-command-invocation', '--region', REGION, '--command-id', cid,
    '--instance-id', IID, '--query', 'StandardOutputContent', '--output', 'text',
  ]).toString().trim();
  fs.unlinkSync(file);
  return out;
}

async function shot(page, dir, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true, scale: 'css' });
  console.log('  OK', name);
}

async function signup(page, dir) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000);

  const consentAll = page.getByText('필수 약관 전체 동의', { exact: false }).first();
  if (await consentAll.count()) {
    await consentAll.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('button:not([disabled])').last().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1800);
  }

  await page.getByPlaceholder('활동 닉네임').fill(NICK);
  await page.getByPlaceholder('예: name@email.com').fill(EMAIL);
  await page.getByPlaceholder('8자 이상').fill(PASSWORD);
  await page.getByPlaceholder('비밀번호 다시 입력').fill(PASSWORD);
  const checks = page.locator('button.tm-btn-neutral');
  for (let i = 0; i < (await checks.count()); i += 1) {
    await checks.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.getByRole('button', { name: '프로필 입력하기' }).click({ timeout: 8000 });
  await page.waitForTimeout(1500);

  // 프로필 단계 입력
  await page.getByRole('radio', { name: '남', exact: true }).click({ timeout: 8000 });
  await page.getByPlaceholder('실명 또는 확인 가능한 이름').fill('감사테스트');
  await page.getByPlaceholder('010-0000-0000').fill(PHONE);
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: '인증번호 받기' }).click({ timeout: 8000 });
  await page.waitForTimeout(3000);

  // 발급된 챌린지의 해시를 알고 있는 코드로 교체
  const hash = scryptHash(KNOWN_CODE);
  const res = ssmSql(`UPDATE v1_phone_verification_challenges SET code_hash='${hash}', attempt_count=0 WHERE phone='${PHONE}';`);
  console.log('  SQL', res.replace(/\s+/g, ' ').slice(0, 60));

  await page.locator('#phone-verification-otp-input').fill(KNOWN_CODE);
  await page.getByRole('button', { name: '확인' }).first().click({ timeout: 8000 });
  await page.waitForTimeout(3000);
  await shot(page, dir, '06-phone-verified');

  await page.getByPlaceholder('예: 1995-01-15').fill('1995-01-15').catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '가입하고 계속' }).click({ timeout: 8000 });
  await page.waitForTimeout(6000);
  await shot(page, dir, '07-signup-done');
}

async function auditAuthed(page, dir) {
  for (const [name, route] of [['08-home-verified', '/home'], ['09-tournaments', '/tournaments'], ['10-my', '/my'], ['11-profile-edit', '/my/profile']]) {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await shot(page, dir, name);
  }

  // 번호 변경 → phoneVerifiedAt 리셋(인증 해제) 실증
  const phoneInput = page.getByPlaceholder('010-0000-0000').first();
  if (await phoneInput.count()) {
    await phoneInput.fill(PHONE2);
    await page.waitForTimeout(600);
    await shot(page, dir, '12-profile-phone-changed');
    const save = page.getByRole('button', { name: /저장|수정/ }).first();
    await save.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await shot(page, dir, '13-after-save');
  } else {
    console.log('  SKIP 12/13 (휴대폰 입력 미발견)');
  }

  await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3500);
  await shot(page, dir, '14-home-unverified-banner');

  await page.goto(`${BASE}/tournaments`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, dir, '15-tournaments-unverified');
}

(async () => {
  const browser = await chromium.launch();
  const dir = path.join(ROOT, 'authed-mobile');
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  try {
    await signup(page, dir);
    await auditAuthed(page, dir);
  } catch (e) {
    console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 200));
    await shot(page, dir, 'zz-failure').catch(() => {});
  }
  await ctx.close();
  await browser.close();
  console.log('DONE  email=' + EMAIL + '  phone=' + PHONE);
})();
