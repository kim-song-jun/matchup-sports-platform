// Toss-친근화 after 캡처. Run: TID=efc6a994-2349-4316-87b0-4e6cd351b4b5 node scripts/capture_toss_v5.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const WEB = 'http://localhost:3013';
const TID = process.env.TID || 'efc6a994-2349-4316-87b0-4e6cd351b4b5';
const ADMIN = { id: 'd554f25e-06f4-4d04-b744-a44124230228', email: 'admin@teameet.v1' };
const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };

const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'tournament-toss-v5');
const BPS = [['mobile', 390], ['tablet', 768], ['desktop', 1440]];

const SHOTS = [
  { name: '01-admin-bracket', user: ADMIN, url: `/admin/tournaments/${TID}`, tab: '대진 관리', note: '토큰 마이그레이션·해요체 CTA' },
  { name: '02-admin-announcements', user: ADMIN, url: `/admin/tournaments/${TID}`, tab: '공지' },
  { name: '03-consumer-my', user: OWNER, url: `/tournaments/${TID}/my`, note: '확정+명단부족 친근 배지·약한 취소 버튼' },
  { name: '04-consumer-detail', user: OWNER, url: `/tournaments/${TID}`, note: '포맷-인지·브랜드 상태' },
  { name: '05-consumer-list', user: OWNER, url: `/tournaments`, note: '카드·EmptyState' },
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
        const t = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 130);
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
