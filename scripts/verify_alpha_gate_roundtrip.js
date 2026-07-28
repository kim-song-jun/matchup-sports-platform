// alpha end-to-end: 대회 신청 게이트 → 인증 → 신청 화면 복귀 → 게이트 통과.
// authed 인증 코드는 scrypt 해시로만 저장되므로, 발급 직후 해당 토큰 1행을 알고 있는 코드의
// 해시로 덮어써서 흐름을 완주한다(실 SMS 수신 없이 검증하기 위한 테스트 전용 조작).
// Run: node scripts/verify_alpha_gate_roundtrip.js
const { chromium } = require('@playwright/test');
const { execFileSync } = require('child_process');
const { randomBytes, scryptSync } = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

const BASE = 'https://alpha.teameet.co.kr';
const ROOT = path.resolve(__dirname, '../docs/visual-qa/phone-verify-ux/alpha-verify');
const REGION = 'ap-northeast-2';
const IID = 'i-06efc23f226edccd7';
const EMAIL = process.env.AUDIT_EMAIL || 'ux-audit-1784999900623@teameet.test';
const PASSWORD = 'teameet-ux-1234';
const KNOWN_CODE = '000000';
const HIDE = `nextjs-portal,[data-nextjs-dev-tools-button],#__next-dev-tools-indicator,[data-nextjs-toast]{display:none!important}`;

function ssmSql(sql) {
  const payload = {
    commands: [`docker exec teameet_v1_postgres psql -U teameet_alpha -d teameet_alpha -c ${JSON.stringify(sql)}`],
  };
  const file = path.join(os.tmpdir(), `ssm-rt-${Date.now()}.json`);
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

function overrideAuthedToken() {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(KNOWN_CODE, salt, 64).toString('hex');
  return ssmSql(
    `UPDATE v1_verification_tokens SET code_hash='scrypt:${salt}:${key}', attempt_count=0 ` +
      `WHERE id = (SELECT id FROM v1_verification_tokens WHERE channel='phone' AND consumed_at IS NULL ` +
      `ORDER BY created_at DESC LIMIT 1);`,
  );
}

async function shot(page, name) {
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await page.waitForTimeout(400);
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

    const openId = await page.evaluate(async () => {
      const res = await fetch('/api/v1/tournaments?limit=30', { credentials: 'include' });
      const json = await res.json();
      const items = json.data?.items ?? json.data ?? [];
      return (items.find((t) => t.status === 'open') || {}).id ?? null;
    });

    // 게이트 → 인증 화면
    await page.goto(`${BASE}/tournaments/${openId}/apply`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    await page.getByRole('link', { name: '본인인증 하러 가기' }).click({ timeout: 10000 });
    await page.waitForTimeout(3500);

    // 인증 진행
    const phoneInput = page.getByPlaceholder('010-0000-0000').first();
    if (await phoneInput.count()) {
      const current = await phoneInput.inputValue();
      if (!current || current.replace(/\D/g, '').length !== 11) await phoneInput.fill('01000000456');
    }
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '인증번호 받기' }).click({ timeout: 10000 });
    await page.waitForTimeout(4000);
    await shot(page, '04-verify-code-sent');

    console.log('  SQL', overrideAuthedToken().replace(/\s+/g, ' ').slice(0, 40));
    await page.locator('#phone-verification-otp-input').fill(KNOWN_CODE);
    await page.getByRole('button', { name: '확인' }).first().click({ timeout: 10000 });
    await page.waitForTimeout(6000);

    console.log('  인증 후 URL =', page.url());
    await shot(page, '05-after-verify-redirect');

    const gateStillThere = await page.getByRole('link', { name: '본인인증 하러 가기' }).count();
    const wizardVisible = await page.getByRole('button', { name: /^다음 단계/ }).count();
    console.log('  게이트 잔존 =', gateStillThere, '/ 신청 위저드 노출 =', wizardVisible);
  } catch (e) {
    console.log('  FAIL', (e instanceof Error ? e.message : String(e)).slice(0, 200));
    await shot(page, 'zz-roundtrip-failure').catch(() => {});
  }
  await ctx.close();
  await browser.close();
  console.log('DONE');
})();
