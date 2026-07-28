// 소비자 재구성(안 A) 검증 캡처. Run: node scripts/capture_rework.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const WEB = 'http://localhost:3013';
const API = 'http://localhost:8121/api/v1';
const TID = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };
const FUTSAL = '3e5ecde3-40c1-461d-9af9-25fd8a85550b';
const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'rework-v8');
const api = (m, p, b) => fetch(`${API}${p}`, { method: m, headers: { 'content-type': 'application/json', 'x-v1-user-id': ADMIN.id, 'x-v1-user-email': ADMIN.email }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

async function shoot(browser, bp, w, name, user, url, fn) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([id, e]) => { localStorage.setItem('teameet.v1.userId', id); localStorage.setItem('teameet.v1.userEmail', e); }, [user.id, user.email]);
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 60)); });
  let note = '';
  try {
    await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(800);
    if (fn) note = (await fn(page)) || '';
    await page.waitForTimeout(800);
    fs.mkdirSync(path.join(OUT, bp), { recursive: true });
    await page.screenshot({ path: path.join(OUT, bp, `${name}.png`), fullPage: true });
    const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    return `[${bp}] ${name} errs=${errs.length} ${note} | 상금:${t.includes('상금') ? 'O' : '-'} 진출:${t.includes('진출') ? 'O' : '-'} :: ${t.slice(0, 80)}`;
  } catch (e) { return `[${bp}] ${name} FAIL ${String(e).slice(0, 60)}`; }
  finally { await ctx.close(); }
}

(async () => {
  // 신청용 신규 대회(상금 포함)
  const c = await api('POST', '/admin/tournaments', { sportId: FUTSAL, title: '가을 풋살 오픈컵', format: 'league', entryFee: 40000, minPlayers: 6, maxPlayers: 10, teamCount: 8, prizePool: 1000000, prizeBreakdown: '1위 60만원 · 2위 40만원' });
  const applyTid = c.data?.id;
  await api('PATCH', `/admin/tournaments/${applyTid}`, { venue: '망원 풋살파크', scheduledAt: '2026-09-13T09:00:00.000Z', registrationDeadlineAt: '2026-09-06T08:59:00.000Z', bankName: '토스뱅크', bankAccount: '100098765432', bankHolder: '리그운영', rulesText: '5인제, 전후반 20분. 명단 마감 경기 3일 전.', refundPolicyText: '대회 7일 전까지 전액 환불.' });
  await api('POST', `/admin/tournaments/${applyTid}/status`, { status: 'open' });

  const browser = await chromium.launch();
  const out = [];
  for (const [bp, w] of [['mobile', 390], ['desktop', 1440]]) {
    out.push(await shoot(browser, bp, w, '01-detail', OWNER, `/tournaments/${TID}`));
    out.push(await shoot(browser, bp, w, '02-list', OWNER, '/tournaments'));
    out.push(await shoot(browser, bp, w, '03-apply-step2', OWNER, `/tournaments/${applyTid}/apply`, async (page) => {
      await page.click('text=강남 러닝 크루', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /다음/ }).first().click({ timeout: 6000 }).catch(() => {});
      await page.waitForSelector('text=결제 수단', { timeout: 12000 }).catch(() => {});
      return 'step2';
    }));
    out.push(await shoot(browser, bp, w, '04-my', OWNER, `/tournaments/${TID}/my`));
  }
  await browser.close();
  await api('POST', `/admin/tournaments/${applyTid}/status`, { status: 'cancelled', reason: 'cleanup' });
  console.log(out.join('\n'));
})();
