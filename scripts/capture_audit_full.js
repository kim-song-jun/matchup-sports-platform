// 대회 전 surface 종합 캡처(전체 재검수용). Run: node scripts/capture_audit_full.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const WEB = 'http://localhost:3013';
const API = 'http://localhost:8121/api/v1';
const TID = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';
const REG101 = '167de01f-5e9c-49aa-a014-24fbb256b772';
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };
const FUTSAL = '3e5ecde3-40c1-461d-9af9-25fd8a85550b';
const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'audit-full');
const BPS = [['mobile', 390], ['desktop', 1440]];

const api = (m, p, b) => fetch(`${API}${p}`, { method: m, headers: { 'content-type': 'application/json', 'x-v1-user-id': ADMIN.id, 'x-v1-user-email': ADMIN.email }, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());

async function freshOpenTournament() {
  const c = await api('POST', '/admin/tournaments', { sportId: FUTSAL, title: '가을 풋살 리그 (신청 데모)', format: 'league', entryFee: 40000, minPlayers: 6, maxPlayers: 10, teamCount: 8 });
  const tid = c.data?.id;
  await api('PATCH', `/admin/tournaments/${tid}`, { venue: '망원 풋살파크', scheduledAt: '2026-09-13T09:00:00.000Z', registrationDeadlineAt: '2026-09-06T08:59:00.000Z', bankName: '토스뱅크', bankAccount: '100098765432', bankHolder: '리그운영' });
  await api('POST', `/admin/tournaments/${tid}/status`, { status: 'open' });
  return tid;
}

async function shoot(browser, bp, width, name, user, url, fn) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([id, email]) => { localStorage.setItem('teameet.v1.userId', id); localStorage.setItem('teameet.v1.userEmail', email); }, [user.id, user.email]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 60)); });
  let note = '';
  try {
    await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(700);
    if (fn) note = (await fn(page)) || '';
    await page.waitForTimeout(800);
    fs.mkdirSync(path.join(OUT, bp), { recursive: true });
    await page.screenshot({ path: path.join(OUT, bp, `${name}.png`), fullPage: true });
    const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 90);
    return `[${bp}] ${name} errs=${errs.length} ${note} :: ${t}`;
  } catch (e) { return `[${bp}] ${name} FAIL ${String(e).slice(0, 60)}`; }
  finally { await ctx.close(); }
}

const clickTab = (label) => async (page) => { await page.getByRole('tab', { name: label }).click({ timeout: 8000 }).catch(() => page.click(`text=${label}`, { timeout: 4000 }).catch(() => {})); await page.waitForTimeout(1000); };

(async () => {
  const applyTid = await freshOpenTournament();
  const browser = await chromium.launch();
  const out = [];
  for (const [bp, w] of BPS) {
    out.push(await shoot(browser, bp, w, '01-home', OWNER, '/home'));
    out.push(await shoot(browser, bp, w, '02-list', OWNER, '/tournaments'));
    out.push(await shoot(browser, bp, w, '03-detail', OWNER, `/tournaments/${TID}`));
    out.push(await shoot(browser, bp, w, '04-apply-step1', OWNER, `/tournaments/${applyTid}/apply`));
    out.push(await shoot(browser, bp, w, '05-apply-step2', OWNER, `/tournaments/${applyTid}/apply`, async (page) => {
      await page.click('text=강남 러닝 크루', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: /다음/ }).first().click({ timeout: 6000 }).catch(() => {});
      await page.waitForSelector('text=결제 수단', { timeout: 12000 }).catch(() => {});
      return 'step2';
    }));
    out.push(await shoot(browser, bp, w, '06-roster', OWNER, `/tournaments/${TID}/registrations/${REG101}/roster`, async (page) => {
      await page.getByRole('button', { name: /추가/ }).first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }));
    out.push(await shoot(browser, bp, w, '07-my', OWNER, `/tournaments/${TID}/my`));
    out.push(await shoot(browser, bp, w, '08-admin-list', ADMIN, '/admin/tournaments'));
    out.push(await shoot(browser, bp, w, '09-admin-create', ADMIN, '/admin/tournaments/new'));
    out.push(await shoot(browser, bp, w, '10-admin-registrations', ADMIN, `/admin/tournaments/${TID}`, clickTab('신청 관리')));
    out.push(await shoot(browser, bp, w, '11-admin-bracket', ADMIN, `/admin/tournaments/${TID}`, clickTab('대진 관리')));
    out.push(await shoot(browser, bp, w, '12-admin-announcements', ADMIN, `/admin/tournaments/${TID}`, clickTab('공지')));
  }
  await browser.close();
  await api('POST', `/admin/tournaments/${applyTid}/status`, { status: 'cancelled', reason: 'audit cleanup' });
  console.log(out.join('\n'));
})();
