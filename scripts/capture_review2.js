const { chromium } = require('@playwright/test');
const path = require('path'); const fs = require('fs');
const WEB = 'http://localhost:3013';
const OWNER = { id: '3b201848-3579-430f-850c-16b330c94085', email: 'owner@teameet.v1' };
const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'review2');
// promo는 인증 필요(/tournaments 데이터), login은 무인증
const TARGETS = [
  { name: 'login', url: '/login', auth: false },
  { name: 'promo', url: '/tournaments', auth: true },
];
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const [bp, w] of [['mobile', 390], ['desktop', 1440]]) {
    for (const t of TARGETS) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      if (t.auth) await ctx.addInitScript(([id, e]) => { localStorage.setItem('teameet.v1.userId', id); localStorage.setItem('teameet.v1.userEmail', e); }, [OWNER.id, OWNER.email]);
      const page = await ctx.newPage(); const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 60)); });
      try { await page.goto(`${WEB}${t.url}`, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(1000);
        fs.mkdirSync(path.join(OUT, bp), { recursive: true });
        await page.screenshot({ path: path.join(OUT, bp, `${t.name}.png`), fullPage: true });
        out.push(`[${bp}] ${t.name} errs=${errs.length}${errs.length ? ' :: ' + errs.join(' | ') : ''}`);
      } catch (e) { out.push(`[${bp}] ${t.name} FAIL ${String(e).slice(0,50)}`); } finally { await ctx.close(); }
    }
  }
  await b.close(); console.log(out.join('\n'));
})();
