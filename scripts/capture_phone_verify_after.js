// 휴대폰 인증 UX 수정 후(after) 캡처. 로컬 web(:3013) + alpha API 프록시.
// Output: docs/visual-qa/phone-verify-ux/after-{mobile,desktop}/<name>.png
// Run: node scripts/capture_phone_verify_after.js
const { chromium } = require('@playwright/test');
const { execFileSync } = require('child_process');
const { randomBytes, scryptSync } = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = 'http://127.0.0.1:3013';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/phone-verify-ux');
const REGION = 'ap-northeast-2';
const IID = 'i-06efc23f226edccd7';

const STAMP = Date.now();
const EMAIL = `ux-after-${STAMP}@teameet.test`;
const NICK = `애프터${String(STAMP).slice(-6)}`;
const PHONE = '01000000789';
const KNOWN_CODE = '000000';
const PASSWORD = 'teameet-ux-1234';

const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function ssmSql(sql) {
  const payload = {
    commands: [`docker exec teameet_v1_postgres psql -U teameet_alpha -d teameet_alpha -c ${JSON.stringify(sql)}`],
  };
  const file = path.join(os.tmpdir(), `ssm-after-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(payload));
  const cid = execFileSync('aws', ['ssm', 'send-command', '--region', REGION, '--instance-ids', IID,
    '--document-name', 'AWS-RunShellScript', '--parameters', `file://${file}`,
    '--query', 'Command.CommandId', '--output', 'text']).toString().trim();
  execFileSync('aws', ['ssm', 'wait', 'command-executed', '--region', REGION, '--command-id', cid, '--instance-id', IID], { stdio: 'ignore' });
  const out = execFileSync('aws', ['ssm', 'get-command-invocation', '--region', REGION, '--command-id', cid,
    '--instance-id', IID, '--query', 'StandardOutputContent', '--output', 'text']).toString().trim();
  fs.unlinkSync(file);
  return out;
}

function patchChallenge(phone) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(KNOWN_CODE, salt, 64).toString('hex');
  return ssmSql(`UPDATE v1_phone_verification_challenges SET code_hash='scrypt:${salt}:${key}', attempt_count=0 WHERE phone='${phone}';`);
}

async function shot(page, dir, name, viewportOnly = false) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: !viewportOnly, scale: 'css' });
  console.log('  OK', name);
}

async function toProfileStep(page) {
  // 로컬 dev 는 첫 요청에서 라우트를 컴파일한다 — 하이드레이션 전에 클릭하면 조용히 무시되므로
  // 워밍업 로드 후 다시 들어가고, 동의가 실제로 반영될 때까지(=닉네임 입력칸 등장) 재시도한다.
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // 전체 동의는 aria-pressed 토글 버튼이다 — 여러 번 누르면 도로 꺼지므로 상태를 보고 한 번만 켠다.
  const agreeAll = page.getByRole('button', { name: /필수 약관 전체 동의/ });
  if (await agreeAll.count()) {
    if ((await agreeAll.getAttribute('aria-pressed')) !== 'true') {
      await agreeAll.click({ timeout: 15000 });
    }
    // 활성화된 CTA 라벨은 모드에 따라 달라진다(model.primary.label) — 비활성 라벨이 사라지는
    // 것으로 "동의 반영"을 판정하고, 그 뒤 화면 하단의 활성 버튼을 누른다.
    await page
      .getByRole('button', { name: '필수 약관에 동의해 주세요' })
      .waitFor({ state: 'detached', timeout: 20000 })
      .catch(() => {});
    const proceed = page.getByRole('button', { name: /동의하고/ }).first();
    await proceed.waitFor({ state: 'visible', timeout: 20000 });
    await proceed.click({ timeout: 20000 });
    await page.waitForTimeout(3000);
  }

  await page.getByPlaceholder('활동 닉네임').waitFor({ state: 'visible', timeout: 40000 });
  await page.getByPlaceholder('활동 닉네임').fill(NICK);
  await page.getByPlaceholder('예: name@email.com').fill(EMAIL);
  await page.getByPlaceholder('8자 이상').fill(PASSWORD);
  await page.getByPlaceholder('비밀번호 다시 입력').fill(PASSWORD);
  const checks = page.locator('button.tm-btn-neutral');
  for (let i = 0; i < (await checks.count()); i += 1) {
    await checks.nth(i).click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(1100);
  }
  await page.getByRole('button', { name: '프로필 입력하기' }).click({ timeout: 10000 });
  await page.waitForTimeout(1800);
  await page.getByRole('radio', { name: '남', exact: true }).click({ timeout: 8000 }).catch(() => {});
  await page.getByPlaceholder('실명 또는 확인 가능한 이름').fill('감사테스트');
}

async function run(page, dir, { withCooldown }) {
  await toProfileStep(page);

  // 카드 등장 직후 — 고정 CTA에 가려지지 않고 뷰에 들어오는지(자동 스크롤) 확인: 뷰포트 컷.
  await page.getByPlaceholder('010-0000-0000').fill(PHONE);
  await page.waitForTimeout(1400);
  await shot(page, dir, '01-card-appears-viewport', true);
  await shot(page, dir, '02-card-appears-full');

  await page.getByRole('button', { name: '인증번호 받기' }).click({ timeout: 10000 });
  await page.waitForTimeout(3500);

  if (withCooldown) {
    // 쿨다운은 실패가 아니라 대기 안내 — info(파랑) 톤으로 뜨는지.
    await page.getByRole('button', { name: /다시 받기/ }).click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, dir, '03-cooldown-info-tone');
  }

  // 잘못된 코드 → 에러가 입력칸 바로 아래 + 필드 error 스타일
  const otp = page.locator('#phone-verification-otp-input');
  if (await otp.count()) {
    await otp.fill('123456');
    await page.getByRole('button', { name: '확인' }).first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, dir, '04-error-under-input');
  }

  // 올바른 코드 → 완료 표시
  patchChallenge(PHONE);
  if (await otp.count()) {
    await otp.fill(KNOWN_CODE);
    await page.getByRole('button', { name: '확인' }).first().click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await shot(page, dir, '05-verified');
  }
}

(async () => {
  const browser = await chromium.launch();
  for (const bp of [
    { key: 'after-mobile', width: 390, height: 844, withCooldown: true },
    { key: 'after-desktop', width: 1440, height: 900, withCooldown: false },
  ]) {
    const dir = path.join(ROOT, bp.key);
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[${bp.key}]`);
    const ctx = await browser.newContext({ viewport: { width: bp.width, height: bp.height } });
    const page = await ctx.newPage();
    try {
      await run(page, dir, { withCooldown: bp.withCooldown });
    } catch (e) {
      console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 200));
      await shot(page, dir, 'zz-failure').catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  console.log('DONE');
})();
