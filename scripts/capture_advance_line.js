// 조별리그 진출선 캡처 — 소비자 순위표 진출 표시 + 어드민 진출 팀 수 입력.
// Run: node scripts/capture_advance_line.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const WEB = 'http://localhost:3013';
const TID = 'efc6a994-2349-4316-87b0-4e6cd351b4b5';
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };
const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'tournament-advance-v7');

const SHOTS = [
  { name: '01-standings-advance', user: OWNER, url: `/tournaments/${TID}`, note: '소비자 순위표 진출선' },
  { name: '02-admin-advance-input', user: ADMIN, url: `/admin/tournaments/${TID}`, tab: '대진 관리', note: '어드민 진출 팀 수 입력' },
];

(async () => {
  const browser = await chromium.launch();
  const summary = [];
  for (const [bp, width] of [['mobile', 390], ['desktop', 1440]]) {
    fs.mkdirSync(path.join(OUT, bp), { recursive: true });
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
        await page.screenshot({ path: path.join(OUT, bp, `${shot.name}.png`), fullPage: true });
        const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
        summary.push(`[${bp}] ${shot.name} errs=${errs.length} 진출=${t.includes('진출') ? 'O' : '-'} :: ${t.slice(0, 120)}`);
      } catch (e) {
        summary.push(`[${bp}] ${shot.name} FAIL ${String(e).slice(0, 70)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(summary.join('\n'));
})();
