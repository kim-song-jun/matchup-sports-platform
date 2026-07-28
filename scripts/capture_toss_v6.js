// directional 구현 after 캡처 (hero·종목칩·어드민·명단). Run: node scripts/capture_toss_v6.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const WEB = 'http://localhost:3013';
const TID = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';
const REG101 = '167de01f-5e9c-49aa-a014-24fbb256b772';
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };

const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'tournament-toss-v6');
const BPS = [['mobile', 390], ['desktop', 1440]];

const SHOTS = [
  { name: '01-my-hero', user: OWNER, url: `/tournaments/${TID}/my`, note: '확정 hero #3' },
  { name: '02-detail-sport', user: OWNER, url: `/tournaments/${TID}`, note: '종목 칩 #8 + 메트릭 카드' },
  { name: '03-list-sport', user: OWNER, url: `/tournaments`, note: '종목 칩 #8' },
  { name: '04-admin-cta', user: ADMIN, url: `/admin/tournaments/${TID}`, tab: '대진 관리', note: 'CTA weight #5 + 빈단계 축약 #6' },
  { name: '05-roster-picker', user: OWNER, url: `/tournaments/${TID}/registrations/${REG101}/roster`, note: '팀원 드롭다운 #7' },
];

(async () => {
  const browser = await chromium.launch();
  const summary = [];
  for (const [bpName, width] of BPS) {
    fs.mkdirSync(path.join(OUT, bpName), { recursive: true });
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      await ctx.addInitScript(([id, email]) => {
        localStorage.setItem('teameet.v1.userId', id);
        localStorage.setItem('teameet.v1.userEmail', email);
      }, [shot.user.id, shot.user.email]);
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 70)); });
      try {
        await page.goto(`${WEB}${shot.url}`, { waitUntil: 'networkidle', timeout: 45000 });
        if (shot.tab) {
          await page.getByRole('tab', { name: shot.tab }).click({ timeout: 8000 }).catch(() => page.click(`text=${shot.tab}`, { timeout: 5000 }).catch(() => {}));
          await page.waitForTimeout(1200);
        }
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(OUT, bpName, `${shot.name}.png`), fullPage: true });
        const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 140);
        summary.push(`[${bpName}] ${shot.name} errs=${errs.length} :: ${t}`);
      } catch (e) {
        summary.push(`[${bpName}] ${shot.name} FAIL ${String(e).slice(0, 70)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(summary.join('\n'));
})();
