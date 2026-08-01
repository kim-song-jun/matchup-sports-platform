const { chromium } = require('@playwright/test');
const path = require('path'); const fs = require('fs');
const WEB = 'http://localhost:3013';
const OUT = path.join(__dirname, '..', 'docs', 'visual-qa', 'brand');
(async () => {
  const b = await chromium.launch(); const out = [];
  for (const [bp, w] of [['mobile', 390], ['desktop', 1440]]) {
    for (const [name, url] of [['landing', '/landing'], ['login', '/login']]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage(); const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      try { await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(700);
        fs.mkdirSync(path.join(OUT, bp), { recursive: true });
        await page.screenshot({ path: path.join(OUT, bp, `${name}.png`), fullPage: true });
        out.push(`[${bp}] ${name} errs=${errs.length}`);
      } catch (e) { out.push(`[${bp}] ${name} FAIL ${String(e).slice(0,50)}`); } finally { await ctx.close(); }
    }
  }
  await b.close(); console.log(out.join('\n'));
})();
