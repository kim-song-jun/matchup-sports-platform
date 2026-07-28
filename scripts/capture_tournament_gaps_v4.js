// 대회 functional-gap 수정 라이브 시각 검증 (rule 17).
// #10 어드민 대진 팀명 / #4 어드민 공지목록 / #3 소비자 내신청 / 포맷-인지 상세 / apply PG 제거.
// Run: node scripts/capture_tournament_gaps_v4.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const WEB = 'http://localhost:3013';
const TID = 'ebe29be8-dba6-41c8-8ccf-b1747410b4e7';
const ADMIN = { id: 'dba4a3c4-f628-4d22-9084-2b11f967120b', email: 'admin@teameet.v1' };
const OWNER = { id: '39adc75a-0702-45bd-b5fd-4cf2d295f7fd', email: 'owner@teameet.v1' };
const MANAGER = { id: '313d0621-04b3-47c0-88ae-4be47698c5c4', email: 'manager@teameet.v1' };

const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'tournament-gaps-v4');
const BPS = [['mobile', 390], ['tablet', 768], ['desktop', 1440]];

const SHOTS = [
  { name: '01-admin-bracket', user: ADMIN, url: `/admin/tournaments/${TID}`, tab: '대진 관리', note: '#10 팀명(UUID 아님)' },
  { name: '02-admin-announcements', user: ADMIN, url: `/admin/tournaments/${TID}`, tab: '공지', note: '#4 공지 목록' },
  { name: '03-consumer-my', user: OWNER, url: `/tournaments/${TID}/my`, note: '#3 ?reg= 없이 본인 신청 조회' },
  { name: '04-consumer-detail', user: OWNER, url: `/tournaments/${TID}`, note: '포맷-인지 상세' },
  { name: '05-consumer-apply', user: MANAGER, url: `/tournaments/${TID}/apply`, note: 'PG 제거 — 계좌이체만' },
];

(async () => {
  const browser = await chromium.launch();
  const summary = [];
  for (const [bpName, width] of BPS) {
    fs.mkdirSync(path.join(OUT, bpName), { recursive: true });
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      await ctx.addInitScript(
        ([id, email]) => {
          localStorage.setItem('teameet.v1.userId', id);
          localStorage.setItem('teameet.v1.userEmail', email);
        },
        [shot.user.id, shot.user.email],
      );
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 80)); });
      try {
        await page.goto(`${WEB}${shot.url}`, { waitUntil: 'networkidle', timeout: 45000 });
        if (shot.tab) {
          try {
            await page.getByRole('tab', { name: shot.tab }).click({ timeout: 8000 });
            await page.waitForTimeout(1200);
          } catch (e) {
            await page.click(`text=${shot.tab}`, { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1000);
          }
        }
        await page.waitForTimeout(1000);
        const file = path.join(OUT, bpName, `${shot.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        // 본문 일부 텍스트 추출(검증용)
        const bodyText = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 140);
        summary.push(`[${bpName}] ${shot.name} OK errs=${errs.length} :: ${bodyText}`);
      } catch (e) {
        summary.push(`[${bpName}] ${shot.name} FAIL ${String(e).slice(0, 80)}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(summary.join('\n'));
})();
